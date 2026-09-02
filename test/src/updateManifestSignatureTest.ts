import { describe, expect, test } from "vitest"
import { canonicalizeForSigning, UpdateInfo, UPDATE_MANIFEST_SIGNATURE_VERSION, verifyManifestSignature } from "builder-util-runtime"
import { derivePublicKeyPem, generateUpdateSigningKeypair, signUpdateManifest } from "builder-util"

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
