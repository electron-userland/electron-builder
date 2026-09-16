import { describe, expect, test } from "vitest"
import {
  canonicalizeForSigning,
  collectManifestSignatures,
  computeUpdateManifestKeyId,
  normalizePublicKeyList,
  splitPemBlocks,
  UpdateInfo,
  UPDATE_MANIFEST_SIGNATURE_VERSION,
  verifyManifestSignature,
  verifyManifestSignatures,
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
    expect(canonical).toContain("version:1.2.3")
    expect(canonical).toContain("staging:25")
    expect(canonical).toContain("file:App-1.2.3.exe\tabc123\t8123456")
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
