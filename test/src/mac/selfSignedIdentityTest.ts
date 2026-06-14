import { createKeychain, findIdentity, removeKeychain, setAllowUntrustedSelfSignedIdentityForTesting } from "app-builder-lib/internal"
import { TmpDir } from "builder-util"
import { afterEach } from "vitest"
import { createSelfSignedMacIdentity } from "../helpers/macSelfSignedIdentity.js"

// Verifies the untrusted self-signed identity seam: electron-builder's identity discovery ignores an
// untrusted self-signed certificate by default, and accepts it only when the in-process test-only seam is
// enabled. There is intentionally no env var or build-config option to enable it in production. No keychain
// trust / sudo is required.
describe.ifMac("self-signed identity discovery", { sequential: true }, () => {
  const tmpDir = new TmpDir("self-signed-identity-test")
  const qualifier = "EB Test (TEAMID1234)"

  afterEach(() => {
    setAllowUntrustedSelfSignedIdentityForTesting(false)
    return tmpDir.cleanup()
  })

  async function importSelfSignedKeychain() {
    const identity = await createSelfSignedMacIdentity("Developer ID Application", tmpDir)
    const { keychainFile } = await createKeychain({
      tmpDir,
      cscLink: identity.p12Base64,
      cscKeyPassword: identity.password,
      currentDir: process.cwd(),
    })
    return { identity, keychainFile: keychainFile! }
  }

  test("untrusted self-signed identity is ignored by default", async ({ expect }) => {
    setAllowUntrustedSelfSignedIdentityForTesting(false)
    const { keychainFile } = await importSelfSignedKeychain()
    try {
      const found = await findIdentity("Developer ID Application", qualifier, keychainFile)
      expect(found).toBeNull()
    } finally {
      await removeKeychain(keychainFile)
    }
  })

  test("untrusted self-signed identity is found when the test seam is enabled", async ({ expect }) => {
    setAllowUntrustedSelfSignedIdentityForTesting(true)
    const { identity, keychainFile } = await importSelfSignedKeychain()
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
