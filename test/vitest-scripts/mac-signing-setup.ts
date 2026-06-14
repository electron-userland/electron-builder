import { TmpDir } from "builder-util"
import { exec } from "builder-util"
import { existsSync } from "fs"
import { remove, writeFile } from "fs-extra"
import * as os from "os"
import * as path from "path"
import { createSelfSignedMacIdentity, isOpenSsl3OrNewer } from "../src/helpers/macSelfSignedIdentity"

// Vitest globalSetup: on macOS, provision an ephemeral self-signed code-signing identity so the signing
// tests can run without an Apple Developer membership, keychain trust, or sudo. The identity is exposed via
// the same env vars electron-builder already reads (MAC_CSC_LINK / CSC_KEY_PASSWORD), and
// CSC_ALLOW_SELF_SIGNED enables discovery of the untrusted identity. A real cert (MAC_CSC_LINK already set)
// is always respected and takes precedence.
//
// Why a session keychain (not just a temp keychain):
//   createKeychain() in macCodeSign.ts creates a temp keychain per build, then deletes it. After deletion
//   the cert is gone from every search-list path. When Squirrel.Mac's Security-framework call then tries to
//   resolve our cert's trust status, it falls through to the login keychain and triggers an Authorization
//   Services dialog ("access login keychain"). By keeping a session-scoped keychain that persists for the
//   entire test run — and adding trust TO THAT KEYCHAIN (not to trustSettings.plist) — the Security
//   framework finds the cert + its trust record without ever reaching the login keychain.
//
//   `security add-trusted-cert -k <session_keychain>` writes trust into the keychain item directly
//   (requires only the keychain password we own) rather than calling SecTrustSettingsSetTrustSettings
//   (which requires Authorization Services and pops a GUI password dialog). This works on headless CI
//   runners without any user interaction.

const SESSION_KEYCHAIN = path.join(os.tmpdir(), "eb-test-signing.keychain-db")
const SESSION_KEYCHAIN_PASSWORD = "eb-test-session"

async function listKeychains(): Promise<string[]> {
  const raw = await exec("/usr/bin/security", ["list-keychains", "-d", "user"])
  return raw
    .trim()
    .split("\n")
    .map(k => k.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
}

export async function setup() {
  if (process.platform !== "darwin" || process.env.MAC_CSC_LINK) {
    return
  }

  // Clean up any leftover session keychain from a previous failed run.
  if (existsSync(SESSION_KEYCHAIN)) {
    await exec("/usr/bin/security", ["delete-keychain", SESSION_KEYCHAIN]).catch(() => {})
  }

  const tmpDir = new TmpDir("mac-signing-global-setup")
  const p12TmpPath = path.join(os.tmpdir(), `eb-test-signing-${Date.now()}.p12`)
  const certPemTmpPath = `${p12TmpPath}.pem`
  const certDerTmpPath = `${p12TmpPath}.der`

  try {
    // Only an application identity: `codesign` accepts an untrusted self-signed cert, but `productbuild`
    // (pkg installer signing) requires a system-trusted identity and rejects self-signed ones, so a self-
    // signed pkg installer stays unsigned (the app inside is still codesigned). Providing a self-signed
    // installer identity would only make `productbuild --sign` fail.
    const application = await createSelfSignedMacIdentity("Developer ID Application", tmpDir)

    // --- Session keychain ---
    await exec("/usr/bin/security", ["create-keychain", "-p", SESSION_KEYCHAIN_PASSWORD, SESSION_KEYCHAIN])
    await exec("/usr/bin/security", ["unlock-keychain", "-p", SESSION_KEYCHAIN_PASSWORD, SESSION_KEYCHAIN])
    await exec("/usr/bin/security", ["set-keychain-settings", "-t", "3600", "-l", SESSION_KEYCHAIN])

    // Import cert + private key so the session keychain can also be used for signing.
    await writeFile(p12TmpPath, Buffer.from(application.p12Base64, "base64"))
    await exec("/usr/bin/security", [
      "import", p12TmpPath,
      "-k", SESSION_KEYCHAIN,
      "-P", application.password,
      "-T", "/usr/bin/codesign",
      "-T", "/usr/bin/security",
    ])
    await exec("/usr/bin/security", [
      "set-key-partition-list", "-S", "apple-tool:,apple:", "-s",
      "-k", SESSION_KEYCHAIN_PASSWORD, SESSION_KEYCHAIN,
    ])

    // Extract the public cert (DER) and add trust TO the session keychain.
    // Using `-k <session_keychain>` writes the trust record into the keychain item itself — no
    // Authorization Services dialog, no login-keychain access, no password prompt on CI.
    const p12ExtractArgs = ["pkcs12", "-in", p12TmpPath, "-nokeys", "-passin", `pass:${application.password}`, "-out", certPemTmpPath]
    if (await isOpenSsl3OrNewer()) {
      p12ExtractArgs.splice(1, 0, "-legacy")
    }
    await exec("openssl", p12ExtractArgs)
    await exec("openssl", ["x509", "-in", certPemTmpPath, "-outform", "DER", "-out", certDerTmpPath])
    await exec("/usr/bin/security", ["add-trusted-cert", "-r", "trustRoot", "-k", SESSION_KEYCHAIN, certDerTmpPath])

    // Prepend the session keychain to the user's search list.
    // createKeychain() snapshots the current list (which includes SESSION_KEYCHAIN), prepends its
    // own temp keychain, and does NOT restore after deletion — so the session keychain stays
    // reachable at position 2+ for the rest of the test run.
    const currentKeychains = await listKeychains()
    if (!currentKeychains.includes(SESSION_KEYCHAIN)) {
      await exec("/usr/bin/security", ["list-keychains", "-d", "user", "-s", SESSION_KEYCHAIN, ...currentKeychains])
    }

    process.env.MAC_CSC_LINK = application.p12Base64
    process.env.CSC_KEY_PASSWORD = application.password
    process.env.CSC_ALLOW_SELF_SIGNED = "true"

    console.log("[mac-signing-setup] provisioned ephemeral self-signed Developer ID Application identity for code-signing tests")
  } finally {
    await remove(p12TmpPath).catch(() => {})
    await remove(certPemTmpPath).catch(() => {})
    await remove(certDerTmpPath).catch(() => {})
    await tmpDir.cleanup()
  }
}

export async function teardown() {
  if (process.platform !== "darwin" || !existsSync(SESSION_KEYCHAIN)) {
    return
  }

  // Remove our session keychain from the search list, then delete it.
  const keychains = await listKeychains().catch(() => [] as string[])
  const remaining = keychains.filter(k => k !== SESSION_KEYCHAIN)
  if (remaining.length > 0) {
    await exec("/usr/bin/security", ["list-keychains", "-d", "user", "-s", ...remaining]).catch(() => {})
  }
  await exec("/usr/bin/security", ["delete-keychain", SESSION_KEYCHAIN]).catch(() => {})
}
