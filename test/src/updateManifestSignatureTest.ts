import { describe, expect, test } from "vitest"
import {
  canonicalizeForSigning,
  collectManifestSignatures,
  computeUpdateManifestKeyId,
  normalizePublicKeyList,
  splitPemBlocks,
  UpdateInfo,
  UPDATE_MANIFEST_SIGNATURE_VERSION,
  validateSignedManifestShape,
  verifyManifestSignature,
  verifyManifestSignatures,
  WindowsUpdateInfo,
} from "builder-util-runtime"
import { createUpdateManifestSignatures, derivePublicKeyPem, generateUpdateSigningKeypair, parsePrivateKey, signUpdateManifest } from "builder-util"
import { createPublicKey, generateKeyPairSync } from "crypto"

function makeInfo(overrides: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    version: "1.2.3",
    files: [{ url: "App-1.2.3.exe", sha512: "abc123", size: 8123456 }],
    path: "App-1.2.3.exe",
    sha512: "abc123",
    releaseDate: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

/** Returns a copy of `info` carrying a valid signature for `privateKeyPem` (UpdateInfo.signature is readonly). */
function signed(info: UpdateInfo, privateKeyPem: string): UpdateInfo {
  return { ...info, signature: signUpdateManifest(info, privateKeyPem) }
}

describe("canonicalizeForSigning", () => {
  test("is stable regardless of file order", () => {
    const a = makeInfo({
      files: [
        { url: "a.exe", sha512: "h1", size: 1 },
        { url: "b.exe", sha512: "h2", size: 2 },
      ],
    })
    const b = makeInfo({
      files: [
        { url: "b.exe", sha512: "h2", size: 2 },
        { url: "a.exe", sha512: "h1", size: 1 },
      ],
    })
    expect(canonicalizeForSigning(a)).toBe(canonicalizeForSigning(b))
  })

  test("includes version prefix, version, staging and files; excludes cosmetic fields", () => {
    const canonical = canonicalizeForSigning(makeInfo({ stagingPercentage: 25, releaseNotes: "irrelevant", releaseName: "irrelevant" }))
    expect(canonical.startsWith(UPDATE_MANIFEST_SIGNATURE_VERSION)).toBe(true)
    expect(canonical).toContain('version:"1.2.3"')
    expect(canonical).toContain("staging:25")
    expect(canonical).toContain('file:"App-1.2.3.exe"\t"abc123"\t8123456')
    expect(canonical).not.toContain("irrelevant")
  })

  test("releaseDate/releaseNotes changes do not affect the canonical payload", () => {
    const base = canonicalizeForSigning(makeInfo())
    const changed = canonicalizeForSigning(makeInfo({ releaseDate: "2099-12-31T23:59:59.000Z", releaseNotes: "new" }))
    expect(base).toBe(changed)
  })
})

describe("sign / verify round-trip", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  test("verifies a correctly signed manifest", () => {
    const info = signed(makeInfo(), privateKeyPem)
    expect(verifyManifestSignature(info, publicKeyPem)).toBe(true)
  })

  test("derived public key matches the generated one for verification", () => {
    const info = signed(makeInfo(), privateKeyPem)
    expect(verifyManifestSignature(info, derivePublicKeyPem(privateKeyPem))).toBe(true)
  })

  test("rejects a tampered sha512", () => {
    const info = signed(makeInfo(), privateKeyPem)
    const tampered = makeInfo({ files: [{ url: "App-1.2.3.exe", sha512: "EVIL", size: 8123456 }], signature: info.signature })
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })

  test("rejects a tampered version", () => {
    const info = signed(makeInfo(), privateKeyPem)
    const tampered = makeInfo({ version: "9.9.9", signature: info.signature })
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })

  test("rejects an added file", () => {
    const info = signed(makeInfo(), privateKeyPem)
    const tampered = makeInfo({
      files: [
        { url: "App-1.2.3.exe", sha512: "abc123", size: 8123456 },
        { url: "evil.exe", sha512: "deadbeef", size: 10 },
      ],
      signature: info.signature,
    })
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })

  test("rejects a wrong key", () => {
    const info = signed(makeInfo(), privateKeyPem)
    const otherKey = generateUpdateSigningKeypair().publicKeyPem
    expect(verifyManifestSignature(info, otherKey)).toBe(false)
  })

  test("rejects a missing signature", () => {
    expect(verifyManifestSignature(makeInfo(), publicKeyPem)).toBe(false)
  })

  test("rejects a truncated/garbage signature without throwing", () => {
    const info = makeInfo({ signature: "not-base64-or-valid!!" })
    expect(verifyManifestSignature(info, publicKeyPem)).toBe(false)
  })

  test("staging percentage is covered by the signature", () => {
    const info = signed(makeInfo({ stagingPercentage: 10 }), privateKeyPem)
    const tampered = makeInfo({ stagingPercentage: 100, signature: info.signature })
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })
})

// ── trust lists and multi-signature manifests (key rotation) ─────────────────

/** Returns a copy of `info` signed by every key in `privateKeyPems`: `signatures` per key, `signature` = first key's. */
function multiSigned(info: UpdateInfo, privateKeyPems: Array<string>): UpdateInfo {
  const signatures = createUpdateManifestSignatures(info, privateKeyPems)
  return { ...info, signature: signatures[0].signature, signatures }
}

describe("computeUpdateManifestKeyId", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  test("is 64 lowercase hex chars (SHA-256 of SPKI DER)", () => {
    const keyId = computeUpdateManifestKeyId(publicKeyPem)
    expect(keyId).toMatch(/^[0-9a-f]{64}$/)
  })

  test("is stable across PEM / base64-SPKI / KeyObject / private-key inputs", () => {
    const fromPem = computeUpdateManifestKeyId(publicKeyPem)
    const spkiBase64 = publicKeyPem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "")
    expect(computeUpdateManifestKeyId(spkiBase64)).toBe(fromPem)
    expect(computeUpdateManifestKeyId(createPublicKey(publicKeyPem))).toBe(fromPem)
    expect(computeUpdateManifestKeyId(parsePrivateKey(privateKeyPem))).toBe(fromPem)
  })

  test("differs between keys", () => {
    expect(computeUpdateManifestKeyId(generateUpdateSigningKeypair().publicKeyPem)).not.toBe(computeUpdateManifestKeyId(publicKeyPem))
  })

  test("rejects a non-Ed25519 key", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey
    expect(() => computeUpdateManifestKeyId(rsa)).toThrow(/Ed25519/)
  })
})

describe("splitPemBlocks / normalizePublicKeyList", () => {
  const a = generateUpdateSigningKeypair().publicKeyPem
  const b = generateUpdateSigningKeypair().publicKeyPem

  test("splits concatenated PEM blocks and tolerates surrounding whitespace", () => {
    expect(splitPemBlocks(`\n${a}\n\n${b}\n`)).toEqual([a, b])
  })

  test("returns a bare base64 value as a single entry and blank input as empty", () => {
    expect(splitPemBlocks("MCowBQYDK2VwAyEA")).toEqual(["MCowBQYDK2VwAyEA"])
    expect(splitPemBlocks("  \n ")).toEqual([])
  })

  test("ignores text outside blocks, handles CRLF and skips malformed markers", () => {
    const crlf = a.replace(/\n/g, "\r\n")
    expect(splitPemBlocks(`# comment\r\n${crlf}\r\ntrailing junk\n${b}\n`)).toEqual([crlf, b])
    // a dangling BEGIN before a complete block is swallowed into that block (BEGIN ... first END), as before
    expect(splitPemBlocks(`-----BEGIN X-----\n${a}`)).toEqual([`-----BEGIN X-----\n${a}`])
    // an END marker with an empty or dashed label is not a terminator
    expect(splitPemBlocks(`${a}\n-----BEGIN K-----\nabc\n-----END -----\n-----END A-B-----\n-----END K-----`)).toEqual([
      a,
      "-----BEGIN K-----\nabc\n-----END -----\n-----END A-B-----\n-----END K-----",
    ])
    // a BEGIN marker with an empty label is skipped, the next well-formed one starts the block
    expect(splitPemBlocks(`-----BEGIN -----\n${a}`)).toEqual([a])
  })

  test("handles many unterminated BEGIN markers in linear time (CodeQL js/polynomial-redos)", () => {
    const hostile = "-----BEGIN ,-----".repeat(10_000)
    const start = Date.now()
    // no complete block: the whole (trimmed) input is handed back so the key parser reports the real problem
    expect(splitPemBlocks(hostile)).toEqual([hostile])
    expect(splitPemBlocks(`${hostile}\n${a}`)).toEqual([`${hostile}\n${a}`])
    expect(Date.now() - start).toBeLessThan(2_000)
  })

  test("normalizes null, a string, a multi-PEM string and an array to a flat list", () => {
    expect(normalizePublicKeyList(null)).toEqual([])
    expect(normalizePublicKeyList(undefined)).toEqual([])
    expect(normalizePublicKeyList(a)).toEqual([a])
    expect(normalizePublicKeyList(`${a}\n${b}`)).toEqual([a, b])
    expect(normalizePublicKeyList([a, b])).toEqual([a, b])
  })
})

describe("verifyManifestSignatures (trust list, multi-signature)", () => {
  const oldKey = generateUpdateSigningKeypair()
  const newKey = generateUpdateSigningKeypair()
  const strangerKey = generateUpdateSigningKeypair()

  test("createUpdateManifestSignatures emits one tagged entry per key, in order", () => {
    const signatures = createUpdateManifestSignatures(makeInfo(), [oldKey.privateKeyPem, newKey.privateKeyPem])
    expect(signatures.map(it => it.keyId)).toEqual([computeUpdateManifestKeyId(oldKey.publicKeyPem), computeUpdateManifestKeyId(newKey.publicKeyPem)])
    expect(signatures[0].signature).toBe(signUpdateManifest(makeInfo(), oldKey.privateKeyPem))
    expect(signatures[1].signature).toBe(signUpdateManifest(makeInfo(), newKey.privateKeyPem))
    expect(() => createUpdateManifestSignatures(makeInfo(), [])).toThrow(/no signing key/)
  })

  test("dual-signed manifest verifies with old-only, new-only and both trusted", () => {
    const info = multiSigned(makeInfo(), [oldKey.privateKeyPem, newKey.privateKeyPem])
    expect(verifyManifestSignatures(info, [oldKey.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(oldKey.publicKeyPem) })
    expect(verifyManifestSignatures(info, [newKey.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(newKey.publicKeyPem) })
    expect(verifyManifestSignatures(info, [oldKey.publicKeyPem, newKey.publicKeyPem]).ok).toBe(true)
    // the trust-list order decides which key is reported
    expect(verifyManifestSignatures(info, [newKey.publicKeyPem, oldKey.publicKeyPem]).keyId).toBe(computeUpdateManifestKeyId(newKey.publicKeyPem))
  })

  test("legacy single `signature` verifies against a trust list containing the signer", () => {
    const info = signed(makeInfo(), oldKey.privateKeyPem)
    expect(info.signatures).toBeUndefined()
    expect(verifyManifestSignatures(info, [newKey.publicKeyPem, oldKey.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(oldKey.publicKeyPem) })
    expect(verifyManifestSignatures(info, [newKey.publicKeyPem]).ok).toBe(false)
  })

  test("`signatures`-only manifest (no legacy field) verifies too", () => {
    const { signature: _dropped, ...info } = multiSigned(makeInfo(), [newKey.privateKeyPem])
    expect(verifyManifestSignatures(info, [newKey.publicKeyPem]).ok).toBe(true)
    expect(verifyManifestSignature(info, newKey.publicKeyPem)).toBe(true)
  })

  test("a trust list of only foreign keys rejects the manifest", () => {
    const info = multiSigned(makeInfo(), [oldKey.privateKeyPem, newKey.privateKeyPem])
    expect(verifyManifestSignatures(info, [strangerKey.publicKeyPem])).toEqual({ ok: false })
  })

  test("a wrong or foreign keyId tag does not block a valid untagged (legacy) signature", () => {
    const base = makeInfo()
    const validLegacy = signUpdateManifest(base, oldKey.privateKeyPem)
    const info: UpdateInfo = {
      ...base,
      signature: validLegacy,
      // tagged with old's id but produced by a stranger — must not be accepted, and must not prevent fallback
      signatures: [{ keyId: computeUpdateManifestKeyId(oldKey.publicKeyPem), signature: signUpdateManifest(base, strangerKey.privateKeyPem) }],
    }
    expect(verifyManifestSignatures(info, [oldKey.publicKeyPem])).toEqual({ ok: true, keyId: computeUpdateManifestKeyId(oldKey.publicKeyPem) })
  })

  test("a signature tagged with an unknown keyId is still tried by no trusted key unless untagged", () => {
    const base = makeInfo()
    // valid signature by old, but mislabeled with a stranger id and no legacy field: tagged entries are only
    // tried for the key they name, so this is rejected (the tag is authoritative for tagged entries)
    const info: UpdateInfo = { ...base, signatures: [{ keyId: computeUpdateManifestKeyId(strangerKey.publicKeyPem), signature: signUpdateManifest(base, oldKey.privateKeyPem) }] }
    expect(verifyManifestSignatures(info, [oldKey.publicKeyPem]).ok).toBe(false)
  })

  test("tampered payload fails for every trusted key even when dual-signed", () => {
    const info = multiSigned(makeInfo(), [oldKey.privateKeyPem, newKey.privateKeyPem])
    const tampered: UpdateInfo = { ...info, files: [{ url: "App-1.2.3.exe", sha512: "EVIL", size: 8123456 }] }
    expect(verifyManifestSignatures(tampered, [oldKey.publicKeyPem, newKey.publicKeyPem])).toEqual({ ok: false })
  })

  test("unsigned manifest or empty trust list is not ok", () => {
    expect(verifyManifestSignatures(makeInfo(), [oldKey.publicKeyPem])).toEqual({ ok: false })
    expect(verifyManifestSignatures(signed(makeInfo(), oldKey.privateKeyPem), [])).toEqual({ ok: false })
  })

  test("garbage entries in `signatures` are skipped without throwing", () => {
    const info: UpdateInfo = {
      ...signed(makeInfo(), oldKey.privateKeyPem),
      signatures: [{ keyId: "", signature: "" }, { keyId: computeUpdateManifestKeyId(oldKey.publicKeyPem), signature: "!!not base64!!" }, null as any],
    }
    expect(verifyManifestSignatures(info, [oldKey.publicKeyPem]).ok).toBe(true)
  })

  test("duplicate trusted keys are verified once", () => {
    const info = signed(makeInfo(), oldKey.privateKeyPem)
    expect(verifyManifestSignatures(info, [oldKey.publicKeyPem, oldKey.publicKeyPem]).ok).toBe(true)
  })

  test("malformed trusted key is a configuration error and throws", () => {
    const info = signed(makeInfo(), oldKey.privateKeyPem)
    expect(() => verifyManifestSignatures(info, ["not a key"])).toThrow()
  })
})

describe("collectManifestSignatures", () => {
  const { privateKeyPem, publicKeyPem } = generateUpdateSigningKeypair()

  test("returns tagged entries plus the legacy signature when it is not already listed", () => {
    const base = makeInfo()
    const legacy = signUpdateManifest(base, privateKeyPem)
    const other = signUpdateManifest(base, generateUpdateSigningKeypair().privateKeyPem)
    const keyId = computeUpdateManifestKeyId(publicKeyPem)
    expect(collectManifestSignatures({ ...base, signature: legacy, signatures: [{ keyId, signature: other }] })).toEqual([{ keyId, signature: other }, { signature: legacy }])
  })

  test("does not duplicate the legacy signature when `signatures` already carries it", () => {
    const info = multiSigned(makeInfo(), [privateKeyPem])
    expect(collectManifestSignatures(info)).toHaveLength(1)
  })

  test("is empty for an unsigned manifest", () => {
    expect(collectManifestSignatures(makeInfo())).toEqual([])
    expect(collectManifestSignatures(makeInfo({ signature: "", signatures: [] }))).toEqual([])
  })
})

// ── minimumSystemVersion and NSIS web-installer packages ─────────────────────

/** A web-installer manifest the way updateInfoBuilder writes it: `packages[arch].path` is the package basename. */
function makeWebInfo(overrides: Partial<WindowsUpdateInfo> = {}): WindowsUpdateInfo {
  return {
    ...makeInfo({ minimumSystemVersion: "10.0.19041" }),
    packages: {
      x64: { path: "App-1.2.3-x64.nsis.7z", sha512: "p64", size: 5000, blockMapSize: 120, isAdminRightsRequired: true },
      ia32: { path: "App-1.2.3-ia32.nsis.7z", sha512: "p32", size: 4000 },
    },
    ...overrides,
  }
}

describe("canonicalizeForSigning: minimumSystemVersion and packages", () => {
  test("pins the exact wire format (EBUM1) including the minimumSystemVersion and package lines", () => {
    const info = makeWebInfo({ stagingPercentage: 25, minimumSystemVersion: "10.0.22631", releaseNotes: "irrelevant" })
    expect(canonicalizeForSigning(info)).toBe(
      [
        "EBUM1",
        // strings are JSON-quoted (so a value can never contain a raw newline/tab), numbers are bare
        'version:"1.2.3"',
        "staging:25",
        'minimumSystemVersion:"10.0.22631"',
        'file:"App-1.2.3.exe"\t"abc123"\t8123456',
        // packages sorted by arch; unset optional fields are empty columns, isAdminRightsRequired is "1" or ""
        'package:"ia32"\t"App-1.2.3-ia32.nsis.7z"\t"p32"\t4000\t\t',
        'package:"x64"\t"App-1.2.3-x64.nsis.7z"\t"p64"\t5000\t120\t1',
      ].join("\n")
    )
  })

  test("pins the exact wire format for a manifest with neither field: empty minimumSystemVersion line, no package lines", () => {
    // absent optional fields are empty (no JSON encoding is empty, so "absent" is distinct from the empty string "")
    const expected = ["EBUM1", 'version:"1.2.3"', "staging:", "minimumSystemVersion:", 'file:"App-1.2.3.exe"\t"abc123"\t8123456'].join("\n")
    expect(canonicalizeForSigning(makeInfo())).toBe(expected)
    // null / empty `packages` (non-web NSIS manifests, YAML `packages: null`) canonicalize identically
    expect(canonicalizeForSigning({ ...makeInfo(), packages: null } as WindowsUpdateInfo)).toBe(expected)
    expect(canonicalizeForSigning({ ...makeInfo(), packages: {} } as WindowsUpdateInfo)).toBe(expected)
    expect(canonicalizeForSigning({ ...makeInfo(), minimumSystemVersion: undefined })).toBe(expected)
  })

  test("is stable regardless of package (arch key) order", () => {
    const a = makeWebInfo()
    const b = makeWebInfo({ packages: { ia32: a.packages!.ia32, x64: a.packages!.x64 } })
    expect(Object.keys(a.packages!)).not.toEqual(Object.keys(b.packages!))
    expect(canonicalizeForSigning(a)).toBe(canonicalizeForSigning(b))
  })

  test("isAdminRightsRequired is signed as a strict boolean true only", () => {
    const withTrue = canonicalizeForSigning(makeWebInfo())
    const withFalse = canonicalizeForSigning(makeWebInfo({ packages: { ...makeWebInfo().packages, x64: { ...makeWebInfo().packages!.x64, isAdminRightsRequired: false } } }))
    const withUnset = canonicalizeForSigning(makeWebInfo({ packages: { ...makeWebInfo().packages, x64: { ...makeWebInfo().packages!.x64, isAdminRightsRequired: undefined } } }))
    expect(withTrue).not.toBe(withFalse)
    expect(withFalse).toBe(withUnset)
  })

  test("untyped extra package fields (the `file` mirror written by the NSIS target) are not signed", () => {
    const info = makeWebInfo()
    const withFile = makeWebInfo({ packages: { ...info.packages, x64: { ...info.packages!.x64, file: "App-1.2.3-x64.nsis.7z" } as any } })
    expect(canonicalizeForSigning(withFile)).toBe(canonicalizeForSigning(info))
  })

  test("a null package entry does not throw and yields a distinct payload", () => {
    const info = makeWebInfo({ packages: { x64: null as any } })
    expect(() => canonicalizeForSigning(info)).not.toThrow()
    expect(canonicalizeForSigning(info)).toContain('package:"x64"\t\t\t\t\t')
    expect(canonicalizeForSigning(info)).not.toBe(canonicalizeForSigning(makeWebInfo({ packages: {} })))
  })
})

describe("sign / verify: minimumSystemVersion and packages are covered", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  test("verifies a correctly signed web-installer manifest carrying minimumSystemVersion", () => {
    const info = signed(makeWebInfo(), privateKeyPem)
    expect(verifyManifestSignature(info, publicKeyPem)).toBe(true)
    expect(verifyManifestSignatures(info, [publicKeyPem]).ok).toBe(true)
  })

  test.each([
    ["path", { path: "evil.nsis.7z" }],
    ["sha512", { sha512: "EVIL" }],
    ["size", { size: 5001 }],
    ["blockMapSize", { blockMapSize: 121 }],
    ["isAdminRightsRequired", { isAdminRightsRequired: false }],
  ])("rejects a package entry whose %s was tampered", (_field, patch) => {
    const info = signed(makeWebInfo(), privateKeyPem) as WindowsUpdateInfo
    const tampered: WindowsUpdateInfo = { ...info, packages: { ...info.packages, x64: { ...info.packages!.x64, ...patch } } }
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })

  test("rejects an added package entry", () => {
    const info = signed(makeWebInfo(), privateKeyPem) as WindowsUpdateInfo
    const tampered: WindowsUpdateInfo = { ...info, packages: { ...info.packages, arm64: { path: "App-1.2.3-arm64.nsis.7z", sha512: "evil", size: 1 } } }
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })

  test("rejects a removed package entry", () => {
    const info = signed(makeWebInfo(), privateKeyPem) as WindowsUpdateInfo
    const { ia32: _dropped, ...rest } = info.packages!
    const tampered: Array<WindowsUpdateInfo> = [
      { ...info, packages: rest },
      { ...info, packages: {} },
      { ...info, packages: null },
    ]
    for (const it of tampered) {
      expect(verifyManifestSignature(it, publicKeyPem)).toBe(false)
    }
  })

  test("rejects a changed, removed or added minimumSystemVersion", () => {
    const withMin = signed(makeInfo({ minimumSystemVersion: "10.0.19041" }), privateKeyPem)
    expect(verifyManifestSignature(withMin, publicKeyPem)).toBe(true)
    expect(verifyManifestSignature({ ...withMin, minimumSystemVersion: "6.1.7601" }, publicKeyPem)).toBe(false)
    const { minimumSystemVersion: _dropped, ...removed } = withMin
    expect(verifyManifestSignature(removed, publicKeyPem)).toBe(false)
    expect(verifyManifestSignature({ ...withMin, minimumSystemVersion: undefined }, publicKeyPem)).toBe(false)

    const without = signed(makeInfo(), privateKeyPem)
    expect(verifyManifestSignature(without, publicKeyPem)).toBe(true)
    expect(verifyManifestSignature({ ...without, minimumSystemVersion: "10.0.19041" }, publicKeyPem)).toBe(false)
  })

  test("a manifest with neither field still signs and verifies", () => {
    const info = signed(makeInfo(), privateKeyPem)
    expect(info.minimumSystemVersion).toBeUndefined()
    expect((info as WindowsUpdateInfo).packages).toBeUndefined()
    expect(verifyManifestSignature(info, publicKeyPem)).toBe(true)
  })
})

// ── injective canonical encoding and signed-manifest shape checks ────────────

/**
 * The forgery reported against the delimiter-based EBUM1 draft: move the original `file:` records into
 * `minimumSystemVersion` (which the updater's OS-version gate fails to parse and ignores), empty `files`, and
 * point the unsigned legacy `path`/`sha512` at attacker-controlled content — all while reusing the signature.
 */
function copilotForgery(original: UpdateInfo): UpdateInfo {
  const fileLines = canonicalizeForSigning(original)
    .split("\n")
    .filter(line => line.startsWith("file:"))
    .join("\n")
  return {
    version: original.version,
    files: [],
    minimumSystemVersion: `\n${fileLines}`,
    path: "https://evil.example/evil.exe",
    sha512: "EVILHASH",
    releaseDate: original.releaseDate,
    signature: original.signature,
    signatures: original.signatures,
  }
}

describe("canonicalizeForSigning is injective", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  test("the files-into-minimumSystemVersion forgery does not reproduce the signed bytes and fails verification", () => {
    const original = multiSigned(makeInfo(), [privateKeyPem])
    const forged = copilotForgery(original)
    expect(canonicalizeForSigning(forged)).not.toBe(canonicalizeForSigning(original))
    expect(verifyManifestSignatures(forged, [publicKeyPem])).toEqual({ ok: false, reason: "files must be a non-empty array" })
    expect(verifyManifestSignature(forged, publicKeyPem)).toBe(false)
  })

  test("a newline or tab inside a value cannot forge a record or field boundary", () => {
    const base = makeInfo()
    // one file whose url spells out two records, vs. two genuine files
    const smuggled = makeInfo({ files: [{ url: 'a.exe"\t"h1"\t1\nfile:"b.exe', sha512: "h2", size: 2 }] })
    const genuine = makeInfo({
      files: [
        { url: "a.exe", sha512: "h1", size: 1 },
        { url: "b.exe", sha512: "h2", size: 2 },
      ],
    })
    expect(canonicalizeForSigning(smuggled)).not.toBe(canonicalizeForSigning(genuine))
    // every encoded line is exactly one record: no raw newline or tab survives inside a value
    for (const info of [smuggled, makeInfo({ version: "1.2.3\nstaging:100" }), makeInfo({ minimumSystemVersion: "10\tx" })]) {
      const lines = canonicalizeForSigning(info).split("\n")
      expect(lines.length).toBe(canonicalizeForSigning(base).split("\n").length)
      expect(lines.every(line => /^(EBUM1|version:|staging:|minimumSystemVersion:|file:|package:)/.test(line))).toBe(true)
    }
  })

  test("absent, empty-string and numeric-looking values are all distinct", () => {
    const absent = canonicalizeForSigning(makeInfo())
    const empty = canonicalizeForSigning(makeInfo({ minimumSystemVersion: "" }))
    expect(empty).not.toBe(absent)
    expect(canonicalizeForSigning(makeInfo({ stagingPercentage: 25 }))).not.toBe(canonicalizeForSigning(makeInfo({ stagingPercentage: "25" as any })))
    expect(canonicalizeForSigning(makeInfo({ files: [{ url: "a", sha512: "h", size: 1 }] }))).not.toBe(
      canonicalizeForSigning(makeInfo({ files: [{ url: "a", sha512: "h", size: "1" as any }] }))
    )
    // an explicitly undefined optional field is the same as an absent one (both are "not present")
    expect(canonicalizeForSigning(makeInfo({ files: [{ url: "a", sha512: "h" }] }))).toBe(canonicalizeForSigning(makeInfo({ files: [{ url: "a", sha512: "h", size: undefined }] })))
  })

  test("package arch keys are signed, so a package cannot be re-keyed to another arch", () => {
    const info = makeWebInfo({ packages: { x64: { path: "p.nsis.7z", sha512: "h", size: 1 } } })
    const rekeyed = makeWebInfo({ packages: { arm64: { path: "p.nsis.7z", sha512: "h", size: 1 } } })
    expect(canonicalizeForSigning(info)).not.toBe(canonicalizeForSigning(rekeyed))
  })
})

describe("validateSignedManifestShape", () => {
  const { publicKeyPem, privateKeyPem } = generateUpdateSigningKeypair()

  test("accepts the manifests updateInfoBuilder writes", () => {
    expect(validateSignedManifestShape(makeInfo())).toBeNull()
    expect(validateSignedManifestShape(makeInfo({ stagingPercentage: 10, minimumSystemVersion: "10.0.19041" }))).toBeNull()
    expect(validateSignedManifestShape(makeWebInfo())).toBeNull()
    expect(validateSignedManifestShape({ ...makeInfo(), packages: null } as WindowsUpdateInfo)).toBeNull()
  })

  test.each<[string, Partial<UpdateInfo> | Partial<WindowsUpdateInfo>, RegExp]>([
    ["empty files", { files: [] }, /files must be a non-empty array/],
    ["missing files", { files: undefined as any }, /files must be a non-empty array/],
    ["file without sha512", { files: [{ url: "a.exe" } as any] }, /files\[0\] must have a non-empty string url and sha512/],
    ["file with a non-numeric size", { files: [{ url: "a.exe", sha512: "h", size: "1" as any }] }, /files\[0\]\.size must be a number/],
    ["non-string version", { version: 1.2 as any }, /version must be a non-empty string/],
    ["non-numeric stagingPercentage", { stagingPercentage: "25" as any }, /stagingPercentage must be a number/],
    ["non-string minimumSystemVersion", { minimumSystemVersion: 10 as any }, /minimumSystemVersion must be a string/],
    ["newline in minimumSystemVersion", { minimumSystemVersion: "\nfile:x" }, /minimumSystemVersion contains a control character/],
    ["tab in a file url", { files: [{ url: "a\tb.exe", sha512: "h", size: 1 }] }, /files\[0\]\.url contains a control character/],
    ["NUL in version", { version: `1.2.3${String.fromCharCode(0)}` }, /version contains a control character/],
    ["DEL in a file sha512", { files: [{ url: "a.exe", sha512: `h${String.fromCharCode(127)}`, size: 1 }] }, /files\[0\]\.sha512 contains a control character/],
    ["null package entry", { packages: { x64: null as any } }, /packages\.x64 must have a non-empty string path and sha512/],
    ["package without sha512", { packages: { x64: { path: "p" } as any } }, /packages\.x64 must have a non-empty string path and sha512/],
    ["package with a non-numeric size", { packages: { x64: { path: "p", sha512: "h", size: "1" as any } } }, /packages\.x64 size and blockMapSize must be numbers/],
    [
      "package with a non-boolean isAdminRightsRequired",
      { packages: { x64: { path: "p", sha512: "h", isAdminRightsRequired: "yes" as any } } },
      /isAdminRightsRequired must be a boolean/,
    ],
    ["control character in a package arch key", { packages: { "x64\n": { path: "p", sha512: "h" } } }, /packages arch key .* contains a control character/],
    ["control character in a package path", { packages: { x64: { path: "p\nq", sha512: "h" } } }, /packages\.x64\.path contains a control character/],
    ["packages as an array", { packages: [] as any }, /packages must be an object keyed by arch/],
  ])("rejects %s", (_name, patch, expected) => {
    const info = { ...makeInfo(), ...patch } as UpdateInfo
    expect(validateSignedManifestShape(info)).toMatch(expected)
    // verification never even reaches the key: the shape problem is the reported reason
    const result = verifyManifestSignatures({ ...info, signature: signUpdateManifest(makeInfo(), privateKeyPem) }, [publicKeyPem])
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(expected)
  })

  test("the signer refuses to sign a manifest the verifier would reject", () => {
    expect(() => signUpdateManifest(makeInfo({ files: [] }), privateKeyPem)).toThrow(/Cannot sign update manifest for version 1.2.3: files must be a non-empty array/)
    expect(() => createUpdateManifestSignatures(makeInfo({ minimumSystemVersion: "\nfile:x" }), [privateKeyPem])).toThrow(/contains a control character/)
    // a well-formed manifest still signs and verifies
    expect(verifyManifestSignature(signed(makeInfo(), privateKeyPem), publicKeyPem)).toBe(true)
  })

  test("a well-formed but wrongly signed manifest reports no shape reason", () => {
    const info = signed(makeInfo(), generateUpdateSigningKeypair().privateKeyPem)
    expect(verifyManifestSignatures(info, [publicKeyPem])).toEqual({ ok: false })
  })
})
