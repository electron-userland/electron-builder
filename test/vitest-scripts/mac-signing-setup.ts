import { TmpDir } from "builder-util"
import { createSelfSignedMacIdentity } from "../src/helpers/macSelfSignedIdentity"

// Vitest globalSetup: on macOS, provision an ephemeral self-signed code-signing identity so the signing
// tests can run without an Apple Developer membership, keychain trust, or sudo. The identity is exposed via
// the same env vars electron-builder already reads (MAC_CSC_LINK / CSC_KEY_PASSWORD), and
// CSC_ALLOW_SELF_SIGNED enables discovery of the untrusted identity. A real cert (MAC_CSC_LINK already set)
// is always respected and takes precedence.
//
// Nothing persistent is created — the base64 p12 lives only in env. Each build still creates and tears down
// its OWN throwaway keychain via createKeychain() in macCodeSign.ts. Two things we deliberately do NOT do:
//   1. Add a long-lived keychain to the user search list. A second keychain that holds the same-named
//      identity makes `codesign --sign "<name>"` ambiguous ("matches ... in <kc A> and ... in <kc B>"),
//      because codesign resolves the identity by name across the WHOLE search list (the `--keychain` flag
//      does not restrict it). The per-build keychain createKeychain manages is the only one that should
//      ever carry the identity at sign time.
//   2. Add certificate trust. It is unnecessary (codesign signs fine with an untrusted self-signed cert,
//      and Squirrel.Mac's auto-update matches the leaf-pinned Designated Requirement — no anchor trust) and
//      impossible to set headlessly: `security add-trusted-cert` needs either a GUI auth dialog (user
//      domain) or root (admin domain), so it would hang every macOS CI shard.

export async function setup() {
  if (process.platform !== "darwin" || process.env.MAC_CSC_LINK) {
    return
  }
  const tmpDir = new TmpDir("mac-signing-global-setup")
  try {
    // Only an application identity: `codesign` accepts an untrusted self-signed cert, but `productbuild`
    // (pkg installer signing) requires a system-trusted identity and rejects self-signed ones, so a self-
    // signed pkg installer stays unsigned (the app inside is still codesigned).
    const application = await createSelfSignedMacIdentity("Developer ID Application", tmpDir)
    process.env.MAC_CSC_LINK = application.p12Base64
    process.env.CSC_KEY_PASSWORD = application.password
    process.env.CSC_ALLOW_SELF_SIGNED = "true"
    console.log("[mac-signing-setup] provisioned ephemeral self-signed Developer ID Application identity for code-signing tests")
  } finally {
    await tmpDir.cleanup()
  }
}
