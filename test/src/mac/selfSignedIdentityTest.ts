import { createKeychain, findIdentity, removeKeychain } from "app-builder-lib/internal"
import { setAllowUntrustedSelfSignedIdentityForTesting } from "app-builder-lib/src/codeSign/mac/macCodeSign"
import { exec, TmpDir } from "builder-util"
import { copyFile } from "fs/promises"
import * as path from "path"
import { afterEach } from "vitest"
import { createSelfSignedCodeSigningIdentity, installAdminTrustForCertificate, removeAdminTrustForCertificate } from "../helpers/selfSignedIdentity.js"

// Verifies the untrusted self-signed identity seam: electron-builder's identity discovery ignores an
// untrusted self-signed certificate by default, and accepts it only when the in-process test-only seam is
// enabled. There is intentionally no env var or build-config option to enable it in production. No keychain
// trust / sudo is required.
describe.ifMac("self-signed identity discovery", { sequential: true }, () => {
  const qualifier = "EB Test (TEAMID1234)"

  afterEach(() => {
    setAllowUntrustedSelfSignedIdentityForTesting(false)
  })

  async function importSelfSignedKeychain(tmpDir: TmpDir) {
    // legacy SHA1/3DES p12 — required for Apple's `security import` (used by createKeychain below).
    const identity = await createSelfSignedCodeSigningIdentity(`Developer ID Application: ${qualifier}`, tmpDir, { legacy: true })
    const { keychainFile } = await createKeychain({
      tmpDir,
      cscLink: identity.p12Base64,
      cscKeyPassword: identity.password,
      currentDir: process.cwd(),
    })
    return { identity, keychainFile: keychainFile! }
  }

  test("untrusted self-signed identity is ignored by default", async ({ expect, tmpDir }) => {
    setAllowUntrustedSelfSignedIdentityForTesting(false)
    const { keychainFile } = await importSelfSignedKeychain(tmpDir)
    try {
      const found = await findIdentity("Developer ID Application", qualifier, keychainFile)
      expect(found).toBeNull()
    } finally {
      await removeKeychain(keychainFile)
    }
  })

  test("untrusted self-signed identity is found when the test seam is enabled", async ({ expect, tmpDir }) => {
    setAllowUntrustedSelfSignedIdentityForTesting(true)
    const { identity, keychainFile } = await importSelfSignedKeychain(tmpDir)
    try {
      const found = await findIdentity("Developer ID Application", qualifier, keychainFile)
      expect(found).not.toBeNull()
      expect(found!.name).toBe(identity.commonName)
      expect(found!.hash).toMatch(/^[0-9A-F]{40}$/)
    } finally {
      await removeKeychain(keychainFile)
    }
  })
})

// Optional real-OS-trust path: instead of the in-process test seam, install an ADMIN-domain trust setting (via
// passwordless sudo) so the self-signed identity validates exactly like a real one. With it in place, `codesign`
// accepts the identity for code signing and `security find-identity -v -p codesigning` lists it as valid. This
// complements, rather than replaces, the untrusted-seam tests above.
describe.ifMac("self-signed identity OS trust", { sequential: true }, () => {
  const qualifier = "EB Test OS Trust (TEAMID1234)"
  const commonName = `Developer ID Application: ${qualifier}`

  async function createTrustedSelfSignedKeychain(tmpDir: TmpDir) {
    // legacy SHA1/3DES p12 — required for Apple's `security import` (used by createKeychain below).
    const identity = await createSelfSignedCodeSigningIdentity(commonName, tmpDir, { legacy: true })
    // Install admin-domain trust BEFORE importing so the identity is OS-trusted once it lands in the keychain.
    await installAdminTrustForCertificate(identity, tmpDir)
    const { keychainFile } = await createKeychain({
      tmpDir,
      cscLink: identity.p12Base64,
      cscKeyPassword: identity.password,
      currentDir: process.cwd(),
    })
    return { identity, keychainFile: keychainFile! }
  }

  test("admin-domain-trusted self-signed identity is valid for code signing", async ({ expect, tmpDir }) => {
    // No in-process seam: discovery must succeed purely because the identity is OS-trusted.
    setAllowUntrustedSelfSignedIdentityForTesting(false)
    const { identity, keychainFile } = await createTrustedSelfSignedKeychain(tmpDir)
    try {
      // electron-builder discovery finds it without the untrusted seam.
      const found = await findIdentity("Developer ID Application", qualifier, keychainFile)
      expect(found).not.toBeNull()
      expect(found!.name).toBe(identity.commonName)
      expect(found!.hash).toMatch(/^[0-9A-F]{40}$/)

      // `security` itself reports it as a valid code-signing identity (the `-v -p codesigning` filter only
      // lists OS-trusted, code-signing-capable identities).
      const validList = await exec("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning", keychainFile])
      expect(validList).toContain(identity.commonName)

      // End-to-end: actually sign a tiny Mach-O and verify the signature validates.
      const dir = await tmpDir.getTempDir({ prefix: "os-trust-sign" })
      const binary = path.join(dir, "true")
      await copyFile("/usr/bin/true", binary)
      await exec("/usr/bin/codesign", ["--sign", found!.hash!, "--keychain", keychainFile, "--force", "--timestamp=none", binary])
      // `codesign --verify` exits 0 only when the signing identity chains to a trusted anchor.
      await exec("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", binary])
    } finally {
      // Always tear down trust AND keychain, even on assertion failure.
      await removeAdminTrustForCertificate(identity, tmpDir)
      await removeKeychain(keychainFile)
    }
  })
})
