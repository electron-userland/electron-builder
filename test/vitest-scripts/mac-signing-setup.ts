import { TmpDir } from "builder-util"
import { exec } from "builder-util"
import { existsSync } from "fs"
import { remove, writeFile } from "fs-extra"
import * as os from "os"
import * as path from "path"
import { createSelfSignedMacIdentity } from "../src/helpers/macSelfSignedIdentity"

// Vitest globalSetup: on macOS, provision an ephemeral self-signed code-signing identity so the signing
// tests can run without an Apple Developer membership, keychain trust, or sudo. The identity is exposed via
// the same env vars electron-builder already reads (MAC_CSC_LINK / CSC_KEY_PASSWORD), and
// CSC_ALLOW_SELF_SIGNED enables discovery of the untrusted identity. A real cert (MAC_CSC_LINK already set)
// is always respected and takes precedence.
//
// NO certificate trust is established here, on purpose. Setting cert trust on macOS is impossible on a
// headless CI runner without sudo: `security add-trusted-cert` modifies per-user Trust Settings, which
// "require user authentication via an authentication dialog" (security(1)) — a GUI prompt that can never be
// answered on a GitHub Actions runner, so the call blocks forever and every macOS shard hangs. (Admin-domain
// trust is the only non-GUI path and requires root.) Trust is also genuinely unnecessary: codesign signs
// happily with an untrusted self-signed identity, and Squirrel.Mac's auto-update check matches the new build
// against the running build's leaf-pinned Designated Requirement — verified empirically, the mac auto-updater
// e2e passes with both user- and admin-domain trust stores completely empty.
//
// Why a session keychain (not just the per-build keychain createKeychain makes):
//   createKeychain() in macCodeSign.ts creates a temp keychain per build, imports the cert+key, then DELETES
//   the keychain file when the build finishes. By the time Squirrel.Mac later verifies the downloaded update,
//   the cert is gone from every keychain in the search list, so the Security framework falls through to the
//   (locked) login keychain while resolving the signature and pops an "access login keychain" item-access
//   prompt. Keeping a session-scoped keychain — unlocked, holding the same cert, kept ahead of the login
//   keychain in the search list for the whole run — satisfies that lookup without ever touching the login
//   keychain. Every command below takes a password we own; none invoke Authorization Services, so it is
//   fully headless/CI-safe.

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

  // Clean up any leftover session keychain from a previous interrupted run.
  if (existsSync(SESSION_KEYCHAIN)) {
    await exec("/usr/bin/security", ["delete-keychain", SESSION_KEYCHAIN]).catch(() => {})
  }

  const tmpDir = new TmpDir("mac-signing-global-setup")
  const p12TmpPath = path.join(os.tmpdir(), `eb-test-signing-${Date.now()}.p12`)

  try {
    // Only an application identity: `codesign` accepts an untrusted self-signed cert, but `productbuild`
    // (pkg installer signing) requires a system-trusted identity and rejects self-signed ones, so a self-
    // signed pkg installer stays unsigned (the app inside is still codesigned). Providing a self-signed
    // installer identity would only make `productbuild --sign` fail.
    const application = await createSelfSignedMacIdentity("Developer ID Application", tmpDir)
    await writeFile(p12TmpPath, Buffer.from(application.p12Base64, "base64"))

    // --- Session keychain: keeps the cert reachable for the whole run (see header). All headless-safe. ---
    await exec("/usr/bin/security", ["create-keychain", "-p", SESSION_KEYCHAIN_PASSWORD, SESSION_KEYCHAIN])
    await exec("/usr/bin/security", ["unlock-keychain", "-p", SESSION_KEYCHAIN_PASSWORD, SESSION_KEYCHAIN])
    await exec("/usr/bin/security", ["set-keychain-settings", SESSION_KEYCHAIN]) // disable auto-lock for the session
    await exec("/usr/bin/security", [
      "import", p12TmpPath,
      "-k", SESSION_KEYCHAIN,
      "-P", application.password,
      "-T", "/usr/bin/codesign",
      "-T", "/usr/bin/security",
    ])
    // Pre-authorize Apple tools against the key so any incidental key access stays prompt-free (-k takes the
    // keychain password we own, not the p12 password).
    await exec("/usr/bin/security", [
      "set-key-partition-list", "-S", "apple-tool:,apple:", "-s",
      "-k", SESSION_KEYCHAIN_PASSWORD, SESSION_KEYCHAIN,
    ])

    // Prepend the session keychain to the user's search list so it is consulted before the login keychain.
    // createKeychain() snapshots the current list (which now includes SESSION_KEYCHAIN), prepends its own
    // per-build keychain, and does NOT restore after deletion — so the session keychain stays reachable for
    // the rest of the test run.
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
