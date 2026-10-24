import { afterEach, describe, expect, test, vi } from "vitest"
import * as path from "path"
import { readFile, writeFile } from "fs/promises"
import { KeyObject, verify as cryptoVerify } from "crypto"
import { load } from "js-yaml"
import {
  canonicalizeForSigning,
  canonicalizeForSigningV2,
  computeUpdateManifestKeyId,
  EBUM1_MANIFEST_FIELDS,
  parsePublicKey,
  UpdateInfo,
  UpdateManifestSignature,
  UPDATE_MANIFEST_UNSIGNED_FIELDS,
  validateSignedManifestShape,
  verifyManifestSignatures,
  WindowsUpdateInfo,
} from "builder-util-runtime"
import { generateUpdateSigningKeypair, loadUpdateSigningKeys, serializeSignedUpdateManifest, serializeToYaml, signUpdateManifest } from "builder-util"
import { DebUpdater } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import { carryUpdateManifestSource, parseUpdateInfo } from "electron-updater/src/providers/Provider"

function makeInfo(overrides: Record<string, unknown> = {}): UpdateInfo {
  return {
    version: "1.2.3",
    files: [{ url: "App-1.2.3.exe", sha512: "abc123", size: 8123456 }],
    releaseDate: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

/** Parses manifest YAML the way electron-updater does (js-yaml `load`). */
function parse(yaml: string): UpdateInfo {
  const parsed: unknown = load(yaml)
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("manifest YAML is not a mapping")
  }
  return parsed as UpdateInfo
}

/** The published YAML of `info` signed by `keys`, parsed back as an updater sees it. */
function publish(info: UpdateInfo, keys: Array<string>): UpdateInfo {
  return parse(serializeSignedUpdateManifest(info, keys))
}

/** `info` with only the signatures of `format` (and no legacy `signature` unless the format is EBUM1). */
function onlyFormat(info: UpdateInfo, format: "EBUM1" | "EBUM2"): UpdateInfo {
  const { signature, signatures, ...rest } = info
  const kept = (signatures ?? []).filter(it => (it.format ?? "EBUM1") === format)
  return format === "EBUM1" ? { ...rest, signature, signatures: kept } : { ...rest, signatures: kept }
}

/**
 * The verifier of electron-updater 7.0.0-alpha.8 to alpha.11 (builder-util-runtime 10.0.0-alpha.8 to alpha.11), reproduced from the
 * published `dist/updateManifestSignature.js`: it knows no `format`, collects every entry with a non-empty `signature`, and tries each
 * against the EBUM1 payload. Its EBUM1 canonicalizer and shape check are byte-for-byte the current `canonicalizeForSigning` and
 * `validateSignedManifestShape` (whose wire format is pinned in updateManifestSignatureTest).
 */
function alpha11VerifyManifestSignatures(info: UpdateInfo, publicKeys: Array<string>): { ok: boolean; keyId?: string; reason?: string } {
  const candidates: Array<{ keyId?: string; signature: string }> = []
  for (const entry of info.signatures ?? []) {
    if (entry != null && typeof entry.signature === "string" && entry.signature.length > 0) {
      candidates.push({ keyId: typeof entry.keyId === "string" && entry.keyId.length > 0 ? entry.keyId : undefined, signature: entry.signature })
    }
  }
  if (typeof info.signature === "string" && info.signature.length > 0 && !candidates.some(it => it.signature === info.signature)) {
    candidates.push({ signature: info.signature })
  }
  if (candidates.length === 0 || publicKeys.length === 0) {
    return { ok: false }
  }
  const shapeProblem = validateSignedManifestShape(info)
  if (shapeProblem != null) {
    return { ok: false, reason: shapeProblem }
  }
  const data = Buffer.from(canonicalizeForSigning(info), "utf8")
  const seen = new Set<string>()
  for (const publicKey of publicKeys) {
    const key: KeyObject = parsePublicKey(publicKey)
    const keyId = computeUpdateManifestKeyId(key)
    if (seen.has(keyId)) {
      continue
    }
    seen.add(keyId)
    for (const candidate of [...candidates.filter(it => it.keyId === keyId), ...candidates.filter(it => it.keyId == null)]) {
      let ok = false
      try {
        ok = cryptoVerify(null, data, key, Buffer.from(candidate.signature, "base64"))
      } catch {
        ok = false
      }
      if (ok) {
        return { ok: true, keyId }
      }
    }
  }
  return { ok: false }
}

describe("canonicalizeForSigningV2: canonical form", () => {
  test("golden vector: a minimal manifest", () => {
    expect(canonicalizeForSigningV2({ version: "1.0.0", files: [{ url: "a.exe", sha512: "h" }] })).toEqual({
      ok: true,
      payload: 'EBUM2\n{"files":[{"sha512":"h","url":"a.exe"}],"version":"1.0.0"}',
    })
  })

  test("golden vector: sorted keys at every depth (UTF-16 code units), arrays in order, JSON escapes and numbers, unsigned fields dropped", () => {
    const manifest = {
      version: "1.2.3",
      files: [
        { url: "b.exe", sha512: "h2", size: 2 },
        { url: "a.exe", sha512: "h1", size: 8123456, blockMapSize: 120, isAdminRightsRequired: true },
      ],
      releaseDate: "2026-01-01T00:00:00.000Z",
      stagingPercentage: 25,
      releaseNotes: "not signed",
      releaseName: "not signed",
      signature: "not signed",
      signatures: [{ keyId: "k", signature: "s", format: "EBUM2" }],
      vendor: {
        é: 1,
        a: {},
        Z: [true, null, 1.5, 'a"b\\\n\t\u0001'],
        "10": 1e21,
        "9": 5e-7,
        ﬁ: "fi ligature",
        "\u{1F600}": "astral",
        nested: { signature: "signed: only the top-level signature field is excluded" },
      },
    }
    const expected =
      "EBUM2\n" +
      '{"files":[{"sha512":"h2","size":2,"url":"b.exe"},{"blockMapSize":120,"isAdminRightsRequired":true,"sha512":"h1","size":8123456,"url":"a.exe"}],' +
      '"releaseDate":"2026-01-01T00:00:00.000Z","stagingPercentage":25,' +
      '"vendor":{"10":1e+21,"9":5e-7,"Z":[true,null,1.5,"a\\"b\\\\\\n\\t\\u0001"],"a":{},' +
      '"nested":{"signature":"signed: only the top-level signature field is excluded"},"é":1,"\u{1F600}":"astral","ﬁ":"fi ligature"},' +
      '"version":"1.2.3"}'
    expect(canonicalizeForSigningV2(manifest)).toEqual({ ok: true, payload: expected })
  })

  test("is independent of key insertion order, but not of array order", () => {
    const a = canonicalizeForSigningV2({ version: "1", files: [{ url: "a", sha512: "1" }], vendor: { x: 1, y: 2 } })
    const b = canonicalizeForSigningV2({ vendor: { y: 2, x: 1 }, files: [{ sha512: "1", url: "a" }], version: "1" })
    expect(a).toEqual(b)
    const files = [
      { url: "a", sha512: "1" },
      { url: "b", sha512: "2" },
    ]
    expect(canonicalizeForSigningV2(makeInfo({ files }))).not.toEqual(canonicalizeForSigningV2(makeInfo({ files: [...files].reverse() })))
  })

  test("excludes exactly signature, signatures, releaseName and releaseNotes", () => {
    expect(UPDATE_MANIFEST_UNSIGNED_FIELDS).toEqual(["signature", "signatures", "releaseName", "releaseNotes"])
  })

  test("an absent field, null and an empty string are all distinct", () => {
    const payloads = [makeInfo(), makeInfo({ minimumSystemVersion: null }), makeInfo({ minimumSystemVersion: "" })].map(it => canonicalizeForSigningV2(it))
    expect(new Set(payloads.map(it => (it.ok ? it.payload : it.reason))).size).toBe(3)
  })

  test.each<[string, unknown, RegExp]>([
    ["a Date (an unquoted YAML timestamp)", makeInfo({ releaseDate: new Date("2026-01-01T00:00:00.000Z") }), /^releaseDate is Date, which has no canonical form/],
    ["binary data", makeInfo({ vendor: { blob: new Uint8Array([1]) } }), /^vendor\.blob is Uint8Array/],
    ["NaN", makeInfo({ vendor: { n: Number.NaN } }), /^vendor\.n is not a finite number/],
    ["Infinity", makeInfo({ stagingPercentage: Number.POSITIVE_INFINITY }), /^stagingPercentage is not a finite number/],
    ["negative zero", makeInfo({ stagingPercentage: -0 }), /^stagingPercentage is negative zero/],
    ["undefined", makeInfo({ vendor: { u: undefined } }), /^vendor\.u is undefined/],
    ["a function", makeInfo({ vendor: { f: () => 1 } }), /^vendor\.f is function/],
    ["a bigint", makeInfo({ vendor: { b: BigInt(1) } }), /^vendor\.b is bigint/],
    ["a class instance", makeInfo({ vendor: { m: new Map() } }), /^vendor\.m is Map/],
    ["a sparse array", makeInfo({ vendor: { s: new Array(3) } }), /^vendor\.s\[0\] is missing/],
    ["a key that needs quoting in the path", makeInfo({ vendor: { "a b": Number.NaN } }), /^vendor\["a b"\] is not a finite number/],
    ["a non-mapping manifest", ["version"], /not a mapping/],
    ["null", null, /not a mapping/],
  ])("refuses %s", (_name, manifest, reason) => {
    const result = canonicalizeForSigningV2(manifest)
    expect(result.ok).toBe(false)
    expect(result.ok ? "" : result.reason).toMatch(reason)
  })

  test("refuses YAML aliases, including a self-referencing one and a merge key, rather than expanding them", () => {
    for (const yaml of [
      "version: '1'\nfiles: [{url: a, sha512: h}]\nvendor: {a: &x [1], b: *x}\n",
      "version: '1'\nfiles: [{url: a, sha512: h}]\nvendor: &x [*x]\n",
      "version: '1'\nfiles: [{url: a, sha512: h}]\nvendor: {base: &b {k: {deep: 1}}, other: {<<: *b}}\n",
    ]) {
      const result = canonicalizeForSigningV2(load(yaml))
      expect(result.ok ? "" : result.reason).toMatch(/repeats an earlier value \(a YAML alias\)/)
    }
  })

  test("refuses nesting deeper than 32 levels without overflowing the stack", () => {
    let deep: unknown = "leaf"
    for (let i = 0; i < 10_000; i++) {
      deep = { d: deep }
    }
    const result = canonicalizeForSigningV2(makeInfo({ vendor: deep }))
    expect(result.ok ? "" : result.reason).toMatch(/nested deeper than 32 levels/)
  })

  test("never throws, even on a throwing getter", () => {
    const hostile = makeInfo()
    Object.defineProperty(hostile, "boom", {
      enumerable: true,
      get() {
        throw new Error("boom")
      },
    })
    expect(canonicalizeForSigningV2(hostile)).toEqual({ ok: false, reason: "the manifest cannot be canonicalized: boom" })
  })
})

describe("EBUM2 signatures cover every field", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  test("an unknown added field is signed: changing or removing it fails EBUM2", () => {
    const info = publish(makeInfo({ futureField: { enabled: true, list: [1, 2] } }), [privateKeyPem])
    expect(verifyManifestSignatures(info, [publicKeyPem])).toMatchObject({ ok: true, format: "EBUM2" })

    const ebum2Only = onlyFormat(info, "EBUM2")
    expect(verifyManifestSignatures(ebum2Only, [publicKeyPem])).toMatchObject({ ok: true, format: "EBUM2" })
    expect(verifyManifestSignatures({ ...ebum2Only, futureField: { enabled: false, list: [1, 2] } } as UpdateInfo, [publicKeyPem]).ok).toBe(false)
    expect(verifyManifestSignatures({ ...ebum2Only, futureField: { enabled: true, list: [2, 1] } } as UpdateInfo, [publicKeyPem]).ok).toBe(false)
    const { futureField: _removed, ...withoutField } = ebum2Only as UpdateInfo & { futureField: unknown }
    expect(verifyManifestSignatures(withoutField, [publicKeyPem]).ok).toBe(false)
  })

  test("a field added after signing fails EBUM2 and cannot fall back to EBUM1, which does not cover it", () => {
    const info = publish(makeInfo(), [privateKeyPem])
    const injected = { ...info, allowSomethingDangerous: true } as UpdateInfo
    expect(verifyManifestSignatures(injected, [publicKeyPem])).toEqual({
      ok: false,
      reason: '"allowSomethingDangerous" is not covered by an EBUM1 signature, and no EBUM2 signature validates',
    })
    // stripping the EBUM2 signatures does not help: EBUM1 is only accepted for the fields an EBUM1-only builder writes
    expect(verifyManifestSignatures(onlyFormat(injected, "EBUM1"), [publicKeyPem]).ok).toBe(false)
  })

  test("fields EBUM1 leaves unsigned are covered by EBUM2: releaseDate, files[].blockMapSize, files[].isAdminRightsRequired, vendor", () => {
    const info = onlyFormat(
      publish(makeInfo({ files: [{ url: "App.AppImage", sha512: "h", size: 10, blockMapSize: 3, isAdminRightsRequired: false }], vendor: { a: 1 } }), [privateKeyPem]),
      "EBUM2"
    )
    expect(verifyManifestSignatures(info, [publicKeyPem]).ok).toBe(true)
    for (const tampered of [
      { ...info, releaseDate: "2099-01-01T00:00:00.000Z" },
      { ...info, files: [{ ...info.files[0], blockMapSize: 4 }] },
      { ...info, files: [{ ...info.files[0], isAdminRightsRequired: true }] },
      { ...info, vendor: { a: 2 } },
    ]) {
      expect(verifyManifestSignatures(tampered as UpdateInfo, [publicKeyPem]).ok).toBe(false)
    }
  })

  test("releaseNotes and releaseName stay editable after signing", () => {
    const info = onlyFormat(publish(makeInfo({ releaseNotes: "first draft", releaseName: "v1.2.3" }), [privateKeyPem]), "EBUM2")
    const edited: UpdateInfo = { ...info, releaseNotes: [{ version: "1.2.3", note: "rewritten" }], releaseName: "Renamed" }
    expect(verifyManifestSignatures(edited, [publicKeyPem])).toMatchObject({ ok: true, format: "EBUM2" })
    const { releaseNotes: _notes, releaseName: _name, ...removed } = info
    expect(verifyManifestSignatures(removed, [publicKeyPem])).toMatchObject({ ok: true, format: "EBUM2" })
  })

  test("an EBUM1 signature relabelled as EBUM2 does not verify (the payloads are domain-separated by their tag)", () => {
    const base = makeInfo()
    const keyId = computeUpdateManifestKeyId(publicKeyPem)
    const relabelled: UpdateInfo = { ...base, signatures: [{ keyId, signature: signUpdateManifest(base, privateKeyPem), format: "EBUM2" }] }
    expect(verifyManifestSignatures(relabelled, [publicKeyPem]).ok).toBe(false)
    const asEbum1: UpdateInfo = { ...base, signatures: [{ keyId, signature: signUpdateManifest(base, privateKeyPem, "EBUM2"), format: "EBUM1" }] }
    expect(verifyManifestSignatures(asEbum1, [publicKeyPem]).ok).toBe(false)
  })

  test("entries in a format this version does not know are skipped", () => {
    const base = makeInfo()
    const keyId = computeUpdateManifestKeyId(publicKeyPem)
    const future = { keyId, signature: signUpdateManifest(base, privateKeyPem, "EBUM2"), format: "EBUM3" } as unknown as UpdateManifestSignature
    expect(verifyManifestSignatures({ ...base, signatures: [future] }, [publicKeyPem])).toEqual({
      ok: false,
      reason: "it carries no signature in a supported format (EBUM2, EBUM1)",
    })
    expect(verifyManifestSignatures({ ...base, signatures: [future, { keyId, signature: signUpdateManifest(base, privateKeyPem) }] }, [publicKeyPem])).toMatchObject({
      ok: true,
      format: "EBUM1",
    })
  })
})

describe("EBUM2 survives the YAML round trip", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("releaseDate is written as a quoted string and parsed back as a string, so the published file verifies", async ({ tmpDir }) => {
    const info = makeInfo({ releaseDate: new Date("2026-03-04T05:06:07.890Z").toISOString(), vendor: { float: 0.1, big: 1e21, tiny: 5e-7, text: "multi\nline\n" } })
    const yaml = serializeSignedUpdateManifest(info, [privateKeyPem])
    expect(yaml).toContain("releaseDate: '2026-03-04T05:06:07.890Z'")

    const file = path.join(await tmpDir.createTempDir(), "latest.yml")
    await writeFile(file, yaml)
    const parsed = parse(await readFile(file, "utf8"))
    expect(typeof parsed.releaseDate).toBe("string")
    expect(verifyManifestSignatures(onlyFormat(parsed, "EBUM2"), [publicKeyPem])).toMatchObject({ ok: true, format: "EBUM2" })
    expect(verifyManifestSignatures(onlyFormat(parsed, "EBUM1"), [publicKeyPem])).toMatchObject({ ok: true, format: "EBUM1" })
  })

  test("signing is deterministic and the file still verifies after a CRLF line-ending conversion", () => {
    const info = makeInfo({ vendor: { notes: "a\nb\n", list: ["x", "y"] } })
    expect(serializeSignedUpdateManifest(info, [privateKeyPem])).toBe(serializeSignedUpdateManifest(info, [privateKeyPem]))
    const crlf = serializeSignedUpdateManifest(info, [privateKeyPem]).replace(/\n/g, "\r\n")
    expect(verifyManifestSignatures(onlyFormat(parse(crlf), "EBUM2"), [publicKeyPem])).toMatchObject({ ok: true, format: "EBUM2" })
  })

  test("a releaseDate hand-edited to an unquoted timestamp parses as a Date and fails EBUM2 with a reason, rather than being guessed at", () => {
    const yaml = serializeSignedUpdateManifest(makeInfo(), [privateKeyPem])
    const unquoted = yaml.replace("releaseDate: '2026-01-01T00:00:00.000Z'", "releaseDate: 2026-01-01T00:00:00.000Z")
    expect(unquoted).not.toBe(yaml)
    const parsed = parse(unquoted)
    expect(parsed.releaseDate).toBeInstanceOf(Date)
    expect(verifyManifestSignatures(onlyFormat(parsed, "EBUM2"), [publicKeyPem])).toEqual({
      ok: false,
      reason: "its EBUM2 payload cannot be computed: releaseDate is Date, which has no canonical form (quote it in the YAML to make it a string)",
    })
    // EBUM1 never covered releaseDate, so a dual-signed manifest still verifies through its EBUM1 signature
    expect(verifyManifestSignatures(parsed, [publicKeyPem])).toMatchObject({ ok: true, format: "EBUM1" })
  })

  test("the builder refuses to sign a value that does not survive YAML as itself (a Date from a JS config)", () => {
    expect(() => serializeSignedUpdateManifest(makeInfo({ vendor: { builtAt: new Date() } }), [privateKeyPem])).toThrow(
      /Cannot sign update manifest for version 1\.2\.3: vendor\.builtAt is Date, which has no canonical form/
    )
  })

  test("signs with the keys from ELECTRON_BUILDER_UPDATE_SIGN_KEY, in both formats, for every key", () => {
    const second = generateUpdateSigningKeypair()
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", Buffer.from(`${privateKeyPem}\n${second.privateKeyPem}\n`).toString("base64"))
    const keys = loadUpdateSigningKeys(null)
    expect(keys).toHaveLength(2)
    const parsed = parse(serializeSignedUpdateManifest(makeInfo(), keys))
    expect(parsed.signatures?.map(it => it.format)).toEqual(["EBUM1", "EBUM1", "EBUM2", "EBUM2"])
    for (const key of [publicKeyPem, second.publicKeyPem]) {
      expect(verifyManifestSignatures(onlyFormat(parsed, "EBUM2"), [key])).toMatchObject({ ok: true, format: "EBUM2", keyId: computeUpdateManifestKeyId(key) })
      expect(verifyManifestSignatures(onlyFormat(parsed, "EBUM1"), [key])).toMatchObject({ ok: true, format: "EBUM1", keyId: computeUpdateManifestKeyId(key) })
    }
  })

  test("existing signature fields on the input are replaced, not signed", () => {
    const stale = makeInfo({ signature: "stale", signatures: [{ keyId: "stale", signature: "stale" }] })
    const parsed = parse(serializeSignedUpdateManifest(stale, [privateKeyPem]))
    expect(parsed.signatures?.some(it => it.signature === "stale")).toBe(false)
    expect(verifyManifestSignatures(parsed, [publicKeyPem])).toMatchObject({ ok: true, format: "EBUM2" })
  })
})

describe("compatibility with EBUM1-only verifiers and manifests", () => {
  const oldKey = generateUpdateSigningKeypair()
  const newKey = generateUpdateSigningKeypair()

  test("a dual-signed manifest verifies under the alpha.8–alpha.11 verifier, for each key, and still fails when tampered", () => {
    const parsed = publish(makeInfo({ stagingPercentage: 50 }), [oldKey.privateKeyPem, newKey.privateKeyPem])
    expect(alpha11VerifyManifestSignatures(parsed, [oldKey.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(oldKey.publicKeyPem) })
    expect(alpha11VerifyManifestSignatures(parsed, [newKey.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(newKey.publicKeyPem) })
    // installs built before trust lists existed verify the legacy single field only
    const { signatures: _list, ...legacyOnly } = parsed
    expect(alpha11VerifyManifestSignatures(legacyOnly, [oldKey.publicKeyPem]).ok).toBe(true)
    expect(alpha11VerifyManifestSignatures({ ...parsed, files: [{ ...parsed.files[0], sha512: "EVIL" }] }, [oldKey.publicKeyPem]).ok).toBe(false)
    expect(alpha11VerifyManifestSignatures({ ...parsed, stagingPercentage: 100 }, [newKey.publicKeyPem]).ok).toBe(false)
  })

  test("an EBUM2 entry alone does not verify under the alpha.11 verifier, so the EBUM1 entries are what keep it updating", () => {
    const parsed = publish(makeInfo(), [oldKey.privateKeyPem])
    expect(alpha11VerifyManifestSignatures(onlyFormat(parsed, "EBUM2"), [oldKey.publicKeyPem]).ok).toBe(false)
    expect(alpha11VerifyManifestSignatures(onlyFormat(parsed, "EBUM1"), [oldKey.publicKeyPem]).ok).toBe(true)
  })

  test("the same dual-signed manifest verifies under the new verifier with EBUM2, for each key", () => {
    const parsed = publish(makeInfo(), [oldKey.privateKeyPem, newKey.privateKeyPem])
    expect(verifyManifestSignatures(parsed, [oldKey.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(oldKey.publicKeyPem), format: "EBUM2" })
    expect(verifyManifestSignatures(parsed, [newKey.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(newKey.publicKeyPem), format: "EBUM2" })
  })

  test("an EBUM1-only manifest as electron-builder 27.0.0-alpha.9–alpha.12 wrote it still verifies", () => {
    const base = makeInfo({ releaseNotes: "notes", path: "App-1.2.3.exe", sha512: "abc123" })
    // alpha.9–alpha.12: `signatures` entries without `format`, plus the legacy `signature`
    const alphaShape: UpdateInfo = {
      ...base,
      signature: signUpdateManifest(base, oldKey.privateKeyPem),
      signatures: [
        { keyId: computeUpdateManifestKeyId(oldKey.publicKeyPem), signature: signUpdateManifest(base, oldKey.privateKeyPem) },
        { keyId: computeUpdateManifestKeyId(newKey.publicKeyPem), signature: signUpdateManifest(base, newKey.privateKeyPem) },
      ],
    }
    const parsed = parse(serializeToYaml(alphaShape, false, true))
    expect(verifyManifestSignatures(parsed, [newKey.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(newKey.publicKeyPem), format: "EBUM1" })
    // the legacy single `signature` alone, as an external signer may write it
    expect(verifyManifestSignatures({ ...base, signature: signUpdateManifest(base, oldKey.privateKeyPem) }, [oldKey.publicKeyPem])).toMatchObject({ ok: true, format: "EBUM1" })
  })

  test("an alpha.9 nsis-web manifest with every EBUM1-era top-level field still verifies", () => {
    const web: WindowsUpdateInfo & Record<string, unknown> = {
      ...makeInfo({ minimumSystemVersion: "10.0.19041", stagingPercentage: 10, releaseName: "n", releaseNotes: "n", path: "App.exe", sha512: "abc123", sha2: "00" }),
      packages: { x64: { path: "App-x64.nsis.7z", sha512: "p64", size: 5000, blockMapSize: 120, file: "App-x64.nsis.7z" } as any },
      isAdminRightsRequired: true,
      vendor: { anything: ["goes"] },
    }
    expect(Object.keys(web).filter(it => !EBUM1_MANIFEST_FIELDS.includes(it))).toEqual([])
    const signed = { ...web, signature: signUpdateManifest(web, oldKey.privateKeyPem) }
    expect(verifyManifestSignatures(signed, [oldKey.publicKeyPem])).toMatchObject({ ok: true, format: "EBUM1" })
  })

  test("an EBUM1-only manifest with a field no EBUM1-only builder writes is refused, naming the field", () => {
    const base = makeInfo({ customFlag: true })
    expect(verifyManifestSignatures({ ...base, signature: signUpdateManifest(base, oldKey.privateKeyPem) }, [oldKey.publicKeyPem])).toEqual({
      ok: false,
      reason: '"customFlag" is not covered by an EBUM1 signature, and no EBUM2 signature validates',
    })
  })

  test("while dual-signing, a field EBUM1 does not know can still be stripped together with the EBUM2 signatures", () => {
    // the documented limit of falling back to EBUM1: a newer field is protected against being added or changed, not against
    // being removed, until installs stop accepting EBUM1. New fields must therefore default to the safe behavior when absent.
    const parsed = publish(makeInfo({ futureField: true }), [oldKey.privateKeyPem])
    const { futureField: _stripped, ...rest } = onlyFormat(parsed, "EBUM1") as UpdateInfo & { futureField: unknown }
    expect(verifyManifestSignatures(rest, [oldKey.publicKeyPem])).toMatchObject({ ok: true, format: "EBUM1" })
  })
})

describe("AppUpdater verifies the manifest as published, before providers add fields", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()
  const stubApp: AppAdapter = {
    name: "TestApp",
    version: "1.0.0",
    isPackaged: false,
    appUpdateConfigPath: "/tmp/does-not-exist-app-update.yml",
    userDataPath: "/tmp",
    baseCachePath: "/tmp",
    whenReady: () => Promise.resolve(),
    relaunch: () => {},
    quit: () => {},
    onQuit: () => {},
  }
  const makeUpdater = () => {
    const updater = new DebUpdater(null, stubApp)
    updater.updateManifestPublicKey = publicKeyPem
    return updater
  }
  const verify = (updater: DebUpdater, info: UpdateInfo): Promise<void> => (updater as any).verifyManifestSignature(info)
  const feedUrl = new URL("https://example.com/latest.yml")

  test("a GitHub-style `{ tag, ...result }` with a feed release name verifies with EBUM2", async () => {
    const result = parseUpdateInfo(serializeSignedUpdateManifest(makeInfo(), [privateKeyPem]), "latest.yml", feedUrl)
    result.releaseName = "Title from the Atom feed"
    // what GitHubProvider / GitLabProvider return
    const info = carryUpdateManifestSource(result, { tag: "v1.2.3", assets: { "App-1.2.3.exe": "https://api.example.com/1" }, ...result })
    const updater = makeUpdater()
    const infoSpy = vi.spyOn((updater as any)._logger, "info")
    await expect(verify(updater, info)).resolves.toBeUndefined()
    expect(infoSpy).toHaveBeenCalledWith("Update manifest signature verified for version 1.2.3 (EBUM2)")
  })

  test("the recorded manifest text leaves the UpdateInfo object untouched", () => {
    const yaml = serializeSignedUpdateManifest(makeInfo(), [privateKeyPem])
    const result = parseUpdateInfo(yaml, "latest.yml", feedUrl)
    expect(Reflect.ownKeys(result)).toEqual(["version", "files", "releaseDate", "signature", "signatures"])
    expect(result).toStrictEqual(load(yaml))
  })

  test("a copy that does not carry the source text is verified as it is, so the provider's own fields count against it", async () => {
    const result = parseUpdateInfo(serializeSignedUpdateManifest(makeInfo(), [privateKeyPem]), "latest.yml", feedUrl)
    await expect(verify(makeUpdater(), { tag: "v1.2.3", ...result } as UpdateInfo)).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
  })

  test("a provider that changes a signed field after parsing is refused", async () => {
    const result = parseUpdateInfo(serializeSignedUpdateManifest(makeInfo(), [privateKeyPem]), "latest.yml", feedUrl)
    result.releaseDate = "2099-01-01T00:00:00.000Z"
    await expect(verify(makeUpdater(), result)).rejects.toMatchObject({
      code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID",
      message: expect.stringContaining('the update provider changed signed field(s) "releaseDate" after parsing'),
    })
  })

  test("a tampered published manifest is refused even though the provider's object looks right", async () => {
    const yaml = serializeSignedUpdateManifest(makeInfo(), [privateKeyPem]).replace("sha512: abc123", "sha512: EVIL")
    await expect(verify(makeUpdater(), parseUpdateInfo(yaml, "latest.yml", feedUrl))).rejects.toMatchObject({ code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID" })
  })

  test("an UpdateInfo built without parseUpdateInfo (a custom provider) is verified as it is", async () => {
    const parsed = publish(makeInfo(), [privateKeyPem])
    await expect(verify(makeUpdater(), parsed)).resolves.toBeUndefined()
    // a field it adds is then part of what is verified: EBUM2 fails, and EBUM1 does not vouch for it
    await expect(verify(makeUpdater(), { ...parsed, tag: "v1.2.3" } as UpdateInfo)).rejects.toMatchObject({
      code: "ERR_UPDATER_MANIFEST_SIGNATURE_INVALID",
      message: expect.stringContaining('"tag" is not covered by an EBUM1 signature'),
    })
  })
})
