import { TmpDir } from "builder-util"
import { createSelfSignedMacIdentity } from "../src/helpers/macSelfSignedIdentity"

// Vitest globalSetup: on macOS, provision an ephemeral self-signed code-signing identity so the signing
// tests can run without an Apple Developer membership, keychain trust, or sudo. The identity is exposed via
// the same env vars electron-builder already reads (MAC_CSC_LINK / CSC_KEY_PASSWORD / CSC_INSTALLER_*), and
// CSC_ALLOW_SELF_SIGNED enables discovery of the untrusted identity. A real cert (MAC_CSC_LINK already set)
// is always respected and takes precedence.
//
// Nothing persistent is created: the base64 PKCS#12 lives only in env, each build owns its own keychain via
// createKeychain (cleaned up as today), and no system trust is touched — so teardown is a no-op.
export async function setup() {
  if (process.platform !== "darwin" || process.env.MAC_CSC_LINK) {
    return
  }

  const tmpDir = new TmpDir("mac-signing-global-setup")
  try {
    // Only an application identity: `codesign` accepts an untrusted self-signed cert, but `productbuild`
    // (pkg installer signing) requires a system-trusted identity and rejects self-signed ones, so a self-
    // signed pkg installer stays unsigned (the app inside is still codesigned). Providing a self-signed
    // installer identity would only make `productbuild --sign` fail.
    const application = await createSelfSignedMacIdentity("Developer ID Application", tmpDir)

    process.env.MAC_CSC_LINK = application.p12Base64
    process.env.CSC_KEY_PASSWORD = application.password
    process.env.CSC_ALLOW_SELF_SIGNED = "true"

    console.log("[mac-signing-setup] provisioned ephemeral self-signed Developer ID Application identity for code-signing tests")
  } finally {
    // base64 already captured into env — the intermediate key/cert/p12 files are no longer needed
    await tmpDir.cleanup()
  }
}

export async function teardown() {
  // no-op: no keychain or system trust was created
}
