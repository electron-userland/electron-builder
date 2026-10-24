import { setAllowUntrustedSelfSignedIdentityForTesting } from "app-builder-lib/src/codeSign/mac/macCodeSign"
import { log } from "builder-util"
import { Lazy } from "lazy-val"
import { TmpDir } from "temp-file"
import { createSelfSignedCodeSigningIdentity, SelfSignedIdentity } from "./selfSignedIdentity"

const PUBLISHER = "EB Test Code Signing"
// The Windows test identity has more than a CN, so the tests cover a derived publisherName (only the CN) of a subject with several attributes,
// and an explicit publisherName pinning the full subject
const WIN_PUBLISHER_ADDITIONAL_DN_FIELDS = { O: "EB Test Org", C: "US" } as const
const TEAM_ID = "TEAMID1234"

/**
 * The full subject of the Windows test identity in the format Windows reports it (RDNs in reverse encoding order, separated by `, `).
 * Also a valid explicit publisherName matching it (a stricter pin than the derived one).
 */
export const WIN_SIGNING_SUBJECT = `C=${WIN_PUBLISHER_ADDITIONAL_DN_FIELDS.C}, O=${WIN_PUBLISHER_ADDITIONAL_DN_FIELDS.O}, CN=${PUBLISHER}`

/** The publisherName a build signed with the Windows test identity derives when none is configured: `CN=<common name>`. */
export const WIN_SIGNING_PUBLISHER_NAME = `CN=${PUBLISHER}`

// Single source of the Windows signing identity for tests, resolved once per worker. An ephemeral, untrusted
// self-signed identity is generated at runtime (no committed cert/secret) and injected into each build's
// config by signedWin() in packTester, deliberately NOT placed in the global process env.
export const winSigningCredentialsInfo = new Lazy<SelfSignedIdentity>(async () => {
  const tmpDir = new TmpDir("win-signing")
  try {
    // Modern PBES2/AES p12 with an EMPTY password: osslsigncode/signtool reject legacy 3DES bags, and an
    // empty password avoids osslsigncode's no-TTY console-prompt fallback (see SelfSignedIdentityOptions).
    const identity = await createSelfSignedCodeSigningIdentity(PUBLISHER, tmpDir, { password: "", additionalDnFields: WIN_PUBLISHER_ADDITIONAL_DN_FIELDS })
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
