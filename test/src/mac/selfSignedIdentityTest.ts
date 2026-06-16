import { createKeychain, findIdentity, removeKeychain } from "app-builder-lib/internal"
import { setAllowUntrustedSelfSignedIdentityForTesting } from "app-builder-lib/src/codeSign/mac/macCodeSign"
import { TmpDir } from "builder-util"
import { afterEach } from "vitest"
import { createSelfSignedCodeSigningIdentity } from "../helpers/selfSignedIdentity.js"

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
