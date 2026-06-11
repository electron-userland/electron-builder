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
    const info = makeInfo()
    info.signature = signUpdateManifest(info, privateKeyPem)
    expect(verifyManifestSignature(info, publicKeyPem)).toBe(true)
  })

  test("derived public key matches the generated one for verification", () => {
    const info = makeInfo()
    info.signature = signUpdateManifest(info, privateKeyPem)
    expect(verifyManifestSignature(info, derivePublicKeyPem(privateKeyPem))).toBe(true)
  })

  test("rejects a tampered sha512", () => {
    const info = makeInfo()
    info.signature = signUpdateManifest(info, privateKeyPem)
    const tampered = makeInfo({ files: [{ url: "App-1.2.3.exe", sha512: "EVIL", size: 8123456 }] })
    tampered.signature = info.signature
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })

  test("rejects a tampered version", () => {
    const info = makeInfo()
    info.signature = signUpdateManifest(info, privateKeyPem)
    const tampered = makeInfo({ version: "9.9.9" })
    tampered.signature = info.signature
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })

  test("rejects an added file", () => {
    const info = makeInfo()
    info.signature = signUpdateManifest(info, privateKeyPem)
    const tampered = makeInfo({
      files: [
        { url: "App-1.2.3.exe", sha512: "abc123", size: 8123456 },
        { url: "evil.exe", sha512: "deadbeef", size: 10 },
      ],
    })
    tampered.signature = info.signature
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })

  test("rejects a wrong key", () => {
    const info = makeInfo()
    info.signature = signUpdateManifest(info, privateKeyPem)
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
    const info = makeInfo({ stagingPercentage: 10 })
    info.signature = signUpdateManifest(info, privateKeyPem)
    const tampered = makeInfo({ stagingPercentage: 100 })
    tampered.signature = info.signature
    expect(verifyManifestSignature(tampered, publicKeyPem)).toBe(false)
  })
})
