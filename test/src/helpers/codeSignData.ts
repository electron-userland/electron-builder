import { setAllowUntrustedSelfSignedIdentityForTesting } from "app-builder-lib/src/codeSign/mac/macCodeSign"
import { log } from "builder-util"
import { Lazy } from "lazy-val"
import { TmpDir } from "temp-file"
import { createSelfSignedCodeSigningIdentity, SelfSignedIdentity } from "./selfSignedIdentity"

const PUBLISHER = "EB Test Code Signing"
const TEAM_ID = "TEAMID1234"

// Single source of the Windows signing identity for tests, resolved once per worker. An ephemeral, untrusted
// self-signed identity is generated at runtime (no committed cert/secret) and injected into each build's
// config by signedWin() in packTester, deliberately NOT placed in the global process env.
export const winSigningCredentialsInfo = new Lazy<SelfSignedIdentity>(async () => {
  const tmpDir = new TmpDir("win-signing")
  try {
    // Modern PBES2/AES p12 with an EMPTY password: osslsigncode/signtool reject legacy 3DES bags, and an
    // empty password avoids osslsigncode's no-TTY console-prompt fallback (see SelfSignedIdentityOptions).
    const identity = await createSelfSignedCodeSigningIdentity(PUBLISHER, tmpDir, { password: "" })
    log.info("provisioned ephemeral self-signed Windows identity for code-signing tests")
    return identity
  } finally {
    await tmpDir.cleanup()
  }
})

// Single source of the macOS signing identity for tests, resolved once per worker. If a real cert is
// ephemeral, untrusted self-signed identity is generated and electron-builder's test-only seam
// (setAllowUntrustedSelfSignedIdentityForTesting) is flipped on so discovery accepts it — there is no env
// var or build-config option that can do this in a real build. The credentials are injected into each
// build's config by signed(), deliberately NOT placed in the global process env.
export const macSigningCredentialsInfo = new Lazy<SelfSignedIdentity>(async () => {
  const tmpDir = new TmpDir("mac-signing")
  try {
    const certPrefix = "Developer ID Application"
    // Only an application identity: `codesign` accepts an untrusted self-signed cert, but `productbuild`
    // (pkg installer signing) requires a system-trusted identity and rejects self-signed ones, so a self-
    // signed pkg installer stays unsigned (the app inside is still codesigned).
    // legacy SHA1/3DES PKCS#12 — required for Apple's `security import` (rejects OpenSSL 3 defaults).
    const application = await createSelfSignedCodeSigningIdentity(`${certPrefix}: EB Test (${TEAM_ID})`, tmpDir, { legacy: true })
    setAllowUntrustedSelfSignedIdentityForTesting(true)
    log.info("provisioned ephemeral self-signed Developer ID Application identity for code-signing tests")
    return application
  } finally {
    await tmpDir.cleanup()
  }
})
