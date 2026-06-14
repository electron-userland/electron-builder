import { createKeychain, findIdentity, removeKeychain } from "app-builder-lib/internal"
import { TmpDir } from "builder-util"
import { afterEach } from "vitest"
import { createSelfSignedMacIdentity } from "../helpers/macSelfSignedIdentity.js"

// Verifies the CSC_ALLOW_SELF_SIGNED opt-in: electron-builder's identity discovery ignores an untrusted
// self-signed certificate by default, but accepts it when the flag is set (local dev signing without an
// Apple Developer membership). No keychain trust / sudo is required.
describe.ifMac("self-signed identity discovery", { sequential: true }, () => {
  const tmpDir = new TmpDir("self-signed-identity-test")
  const qualifier = "EB Test (TEAMID1234)"

  afterEach(() => {
    delete process.env.CSC_ALLOW_SELF_SIGNED
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

  test("untrusted self-signed identity is ignored without CSC_ALLOW_SELF_SIGNED", async ({ expect }) => {
    delete process.env.CSC_ALLOW_SELF_SIGNED
    const { keychainFile } = await importSelfSignedKeychain()
    try {
      const found = await findIdentity("Developer ID Application", qualifier, keychainFile)
      expect(found).toBeNull()
    } finally {
      await removeKeychain(keychainFile)
    }
  })

  test("untrusted self-signed identity is found with CSC_ALLOW_SELF_SIGNED=true", async ({ expect }) => {
    process.env.CSC_ALLOW_SELF_SIGNED = "true"
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
