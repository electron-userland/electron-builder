import { checkInstallerPackageSignature, validateStapledTicket, verifyMacCodeSignature } from "app-builder-lib/src/codeSign/mac/macSignatureVerifier.js"
import { AuthenticodeSignerInfo } from "app-builder-lib/src/codeSign/win/authenticodeSignature.js"
import { verifyBuildOutput, VerificationResult } from "app-builder-lib/src/util/buildOutputVerifier.js"
import { createUpdateManifestSignatures, generateUpdateSigningKeypair, parsePrivateKey, serializeToYaml } from "builder-util"
import { hashFile } from "builder-util-runtime"
import { mkdir, readFile, symlink, writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

// codesign / stapler / pkgutil run on macOS only
vi.mock("app-builder-lib/src/codeSign/mac/macSignatureVerifier.js", () => ({
  verifyMacCodeSignature: vi.fn(),
  validateStapledTicket: vi.fn(),
  checkInstallerPackageSignature: vi.fn(),
}))

const keyA = generateUpdateSigningKeypair()
const keyB = generateUpdateSigningKeypair()
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!

beforeEach(() => {
  // a signing key exported on the developer's machine must not become the fallback trust list
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", undefined)
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", undefined)
  vi.mocked(verifyMacCodeSignature).mockReset().mockResolvedValue(null)
  vi.mocked(validateStapledTicket).mockReset().mockResolvedValue(null)
  vi.mocked(checkInstallerPackageSignature).mockReset().mockResolvedValue(null)
})

afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform)
  vi.unstubAllEnvs()
})

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
}

async function write(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

/** Writes an artifact and returns the `files` entry a manifest lists for it under `url`. */
async function writeArtifact(dir: string, name: string, url = name, content = `the artifact ${name}`) {
  const file = path.join(dir, name)
  await write(file, content)
  return { url, sha512: await hashFile(file), size: Buffer.byteLength(content) }
}

/** Writes a manifest the way updateInfoBuilder does, signed by `signWith` (unsigned when empty). */
async function writeManifest(file: string, files: Array<any>, signWith: Array<string> = [keyA.privateKeyPem]): Promise<void> {
  const info: any = { version: "1.0.0", files, releaseDate: "2026-10-24T00:00:00.000Z" }
  let manifest = info
  if (signWith.length > 0) {
    const signatures = createUpdateManifestSignatures(info, signWith.map(parsePrivateKey))
    manifest = { ...info, signature: signatures[0].signature, signatures }
  }
  await write(file, serializeToYaml(manifest, false, true))
}

function appUpdateYml(options: { keys?: Array<string>; publisherName?: Array<string> }): string {
  const config: any = { provider: "generic", url: "https://example.com/updates" }
  if (options.keys != null && options.keys.length > 0) {
    config.updateManifestPublicKey = options.keys.length === 1 ? options.keys[0] : options.keys
  }
  if (options.publisherName != null) {
    config.publisherName = options.publisherName
  }
  return serializeToYaml(config)
}

const writeLinuxApp = (outDir: string, keys: Array<string>) => write(path.join(outDir, "linux-unpacked", "resources", "app-update.yml"), appUpdateYml({ keys }))

function run(outDir: string, config: any = {}, signers: Record<string, AuthenticodeSignerInfo> = {}): Promise<Array<VerificationResult>> {
  const readSigner = (file: string) => Promise.resolve(signers[path.basename(file)] ?? ({ type: "unsigned", reason: "no signature in the test fixture" } as const))
  return verifyBuildOutput({ outDir, config, readSigner })
}

const resultsOf = (results: Array<VerificationResult>, check: string, fileName?: string) =>
  results.filter(it => it.check === check && (fileName == null || path.basename(it.file) === fileName)).map(it => it.status)

// The output directory can hold downloaded artifacts, which are not trusted
describe("app-update.yml of an untrusted output", () => {
  test.skipIf(process.platform === "win32")("is not read through a symlink that leads out of the app", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    const secret = path.join(await tmpDir.createTempDir(), "id_ed25519")
    await write(secret, "-----BEGIN OPENSSH PRIVATE KEY-----\nnot: [valid\n")
    await mkdir(path.join(outDir, "linux-unpacked", "resources"), { recursive: true })
    await symlink(secret, path.join(outDir, "linux-unpacked", "resources", "app-update.yml"))
    await writeManifest(path.join(outDir, "latest-linux.yml"), [await writeArtifact(outDir, "My-1.0.0.AppImage")])
    const results = await run(outDir)
    const problem = results.find(it => it.check === "app update configuration")
    expect(problem).toMatchObject({ status: "failed", message: "app-update.yml is a symlink that leads out of the app" })
    expect(JSON.stringify(results)).not.toContain("OPENSSH")
  })

  test.skipIf(process.platform === "win32")("is read through a symlink that stays inside the app", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await write(path.join(outDir, "linux-unpacked", "resources", "real-app-update.yml"), appUpdateYml({ keys: [keyA.publicKeyPem] }))
    await symlink("real-app-update.yml", path.join(outDir, "linux-unpacked", "resources", "app-update.yml"))
    await writeManifest(path.join(outDir, "latest-linux.yml"), [await writeArtifact(outDir, "My-1.0.0.AppImage")])
    const results = await run(outDir)
    expect(resultsOf(results, "app update configuration")).toEqual([])
    expect(resultsOf(results, "update manifest signature")).toEqual(["verified"])
  })

  test("that is not valid YAML, or not a mapping, fails without quoting its content", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await write(path.join(outDir, "linux-unpacked", "resources", "app-update.yml"), "provider: generic\nurl: [SECRET-TOKEN-1234\n")
    await write(path.join(outDir, "linux-arm64-unpacked", "resources", "app-update.yml"), "- a list\n")
    const results = await run(outDir)
    const problems = results.filter(it => it.check === "app update configuration")
    expect(problems.map(it => it.status)).toEqual(["failed", "failed"])
    expect(problems.find(it => it.file.includes("linux-unpacked"))?.message).toMatch(/^app-update\.yml is not valid YAML \(.+\)$/)
    expect(problems.find(it => it.file.includes("linux-arm64-unpacked"))?.message).toBe("app-update.yml is not a YAML mapping")
    expect(JSON.stringify(results)).not.toContain("SECRET-TOKEN-1234")
  })
})

describe("update manifests", () => {
  test("a signed manifest verifies against the trust list of every packaged app of its platform, and its files match", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await writeLinuxApp(outDir, [keyA.publicKeyPem])
    await write(path.join(outDir, "linux-arm64-unpacked", "resources", "app-update.yml"), appUpdateYml({ keys: [keyA.publicKeyPem] }))
    await writeManifest(path.join(outDir, "latest-linux.yml"), [await writeArtifact(outDir, "My-1.0.0.AppImage")])
    const results = await run(outDir)
    expect(resultsOf(results, "update manifest signature")).toEqual(["verified", "verified"])
    expect(resultsOf(results, "update manifest file")).toEqual(["verified"])
  })

  test("a tampered, unsigned or foreign-signed manifest fails, and so does an app that embeds no trust list", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await writeLinuxApp(outDir, [keyA.publicKeyPem])
    const artifact = await writeArtifact(outDir, "My-1.0.0.AppImage")
    await writeManifest(path.join(outDir, "latest-linux.yml"), [artifact])
    const manifestFile = path.join(outDir, "latest-linux.yml")
    await writeFile(manifestFile, (await readFile(manifestFile, "utf8")).replace("version: 1.0.0", "version: 9.9.9"))
    await writeManifest(path.join(outDir, "beta-linux.yml"), [artifact], [])
    await writeManifest(path.join(outDir, "alpha-linux.yml"), [artifact], [keyB.privateKeyPem])
    const results = await run(outDir)
    expect(resultsOf(results, "update manifest signature", "latest-linux.yml")).toEqual(["failed"])
    expect(results.find(it => path.basename(it.file) === "beta-linux.yml" && it.check === "update manifest signature")?.message).toContain("the manifest is not signed")
    expect(resultsOf(results, "update manifest signature", "alpha-linux.yml")).toEqual(["failed"])

    const keylessDir = await tmpDir.createTempDir()
    await writeLinuxApp(keylessDir, [])
    await writeManifest(path.join(keylessDir, "latest-linux.yml"), [await writeArtifact(keylessDir, "My-1.0.0.AppImage")])
    const keyless = await run(keylessDir)
    expect(keyless.find(it => it.check === "update manifest signature")?.message).toContain(
      "embeds no updateManifestPublicKey, so installs of this build accept any update manifest"
    )
  })

  test("updateManifest: false skips the signature check", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await writeLinuxApp(outDir, [])
    await writeManifest(path.join(outDir, "latest-linux.yml"), [await writeArtifact(outDir, "My-1.0.0.AppImage")], [])
    expect(resultsOf(await run(outDir, { linux: { updateManifest: false } }), "update manifest signature")).toEqual(["skipped"])
  })

  test("without a packaged app, updateManifest.publicKey provides the trust list, or the manifest cannot be verified", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await writeManifest(path.join(outDir, "latest-mac.yml"), [await writeArtifact(outDir, "My-1.0.0-mac.zip")])
    expect(resultsOf(await run(outDir, { updateManifest: { publicKey: keyA.publicKeyPem } }), "update manifest signature")).toEqual(["verified"])
    expect(resultsOf(await run(outDir, { updateManifest: { publicKey: keyB.publicKeyPem } }), "update manifest signature")).toEqual(["failed"])
    const results = await run(outDir)
    expect(resultsOf(results, "update manifest signature")).toEqual(["unverifiable"])
    expect(results.find(it => it.check === "update manifest signature")?.message).toContain("updateManifest.publicKey is not set")
  })

  // verify needs public keys only: a signing (private) key is never loaded, from the configuration or the environment
  test("a signing key is never used as the trust list: without updateManifest.publicKey the manifest is unverifiable", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await writeManifest(path.join(outDir, "latest-mac.yml"), [await writeArtifact(outDir, "My-1.0.0-mac.zip")])
    // the key that signed the manifest, where electron-builder would find it to sign with
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", Buffer.from(keyA.privateKeyPem).toString("base64"))
    expect(resultsOf(await run(outDir), "update manifest signature")).toEqual(["unverifiable"])
    expect(resultsOf(await run(outDir, { updateManifest: { signingKey: keyA.privateKeyPem } }), "update manifest signature")).toEqual(["unverifiable"])
    // a key file that would fail the read if verify tried to load it
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", undefined)
    vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", path.join(outDir, "missing-key.pem"))
    expect(resultsOf(await run(outDir, { updateManifest: { signingKeyFile: path.join(outDir, "missing-key.pem") } }), "update manifest signature")).toEqual(["unverifiable"])
  })

  test("a cutover release signed outside its embedded trust list is skipped, since its signing key is not in any trust list", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    // the release is signed with the old key A but embeds only the new key B (updateManifest.allowSigningKeyOutsideTrustList)
    await writeLinuxApp(outDir, [keyB.publicKeyPem])
    await writeManifest(path.join(outDir, "latest-linux.yml"), [await writeArtifact(outDir, "My-1.0.0.AppImage")])
    const cutover = { publicKey: keyB.publicKeyPem, allowSigningKeyOutsideTrustList: true }
    expect(resultsOf(await run(outDir, { updateManifest: cutover }), "update manifest signature")).toEqual(["skipped"])
    // the signing key is not loaded to verify it with either
    expect(resultsOf(await run(outDir, { updateManifest: { ...cutover, signingKey: keyA.privateKeyPem } }), "update manifest signature")).toEqual(["skipped"])
    // without the opt-in it is a failure
    expect(resultsOf(await run(outDir, { updateManifest: { publicKey: keyB.publicKeyPem } }), "update manifest signature")).toEqual(["failed"])
  })

  test("manifests are found by their shape, also those of a second provider in a subdirectory", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await writeLinuxApp(outDir, [keyA.publicKeyPem])
    const artifact = await writeArtifact(outDir, "My-1.0.0.AppImage")
    await writeManifest(path.join(outDir, "s3", "latest-linux.yml"), [artifact])
    await write(path.join(outDir, "builder-debug.yml"), serializeToYaml({ version: "1.0.0", files: [] }))
    await write(path.join(outDir, "notes.yml"), serializeToYaml({ title: "not a manifest" }))
    const results = await run(outDir)
    expect(results.filter(it => it.check === "update manifest signature").map(it => path.relative(outDir, it.file))).toEqual([path.join("s3", "latest-linux.yml")])
    expect(resultsOf(results, "update manifest file")).toEqual(["verified"])
  })
})

// nsis-web writes into its own folder, and the manifest of each further publish provider one level below it
describe("manifests of a target with its own folder", () => {
  async function writeNsisWebOutput(outDir: string, nestedSigner = keyA.privateKeyPem) {
    await write(path.join(outDir, "win-unpacked", "resources", "app-update.yml"), appUpdateYml({ keys: [keyA.publicKeyPem] }))
    const nsisWeb = path.join(outDir, "nsis-web")
    const installer = await writeArtifact(nsisWeb, "My Web Setup 1.0.0.exe", "My-Web-Setup-1.0.0.exe")
    await writeManifest(path.join(nsisWeb, "latest.yml"), [installer])
    await writeManifest(path.join(nsisWeb, "s3", "latest.yml"), [installer], [nestedSigner])
    return { nsisWeb, installer }
  }

  test("a further provider's manifest below the target folder is verified, and its files are found in the target folder", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    const { nsisWeb } = await writeNsisWebOutput(outDir)
    const results = await run(outDir)
    const manifestResults = (check: string) => results.filter(it => it.check === check).map(it => [path.relative(outDir, it.file), it.status])
    expect(manifestResults("update manifest signature")).toEqual([
      [path.join("nsis-web", "latest.yml"), "verified"],
      [path.join("nsis-web", "s3", "latest.yml"), "verified"],
    ])
    expect(manifestResults("update manifest file")).toEqual([
      [path.join("nsis-web", "latest.yml"), "verified"],
      [path.join("nsis-web", "s3", "latest.yml"), "verified"],
    ])
    expect(results.find(it => it.file === path.join(nsisWeb, "s3", "latest.yml") && it.check === "update manifest file")?.message).toContain(
      path.join("nsis-web", "My Web Setup 1.0.0.exe")
    )
  })

  test("a further provider's manifest with a foreign signature or a changed file fails", async ({ expect, tmpDir }) => {
    const signedElsewhere = await tmpDir.createTempDir()
    await writeNsisWebOutput(signedElsewhere, keyB.privateKeyPem)
    expect(resultsOf(await run(signedElsewhere), "update manifest signature", "latest.yml")).toEqual(["verified", "failed"])

    const changed = await tmpDir.createTempDir()
    const { nsisWeb, installer } = await writeNsisWebOutput(changed)
    await writeManifest(path.join(nsisWeb, "s3", "latest.yml"), [{ ...installer, sha512: "AAAA" }])
    const nested = (await run(changed)).filter(it => it.file === path.join(nsisWeb, "s3", "latest.yml") && it.check === "update manifest file")
    expect(nested.map(it => it.status)).toEqual(["failed"])
  })

  test.skipIf(process.platform === "win32")("a symlink to a folder outside the output is not followed", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    const { nsisWeb } = await writeNsisWebOutput(outDir)
    const outside = await tmpDir.createTempDir()
    await writeManifest(path.join(outside, "latest.yml"), [await writeArtifact(outside, "Other Setup.exe")], [keyB.privateKeyPem])
    await symlink(outside, path.join(nsisWeb, "github"))
    await symlink(outside, path.join(outDir, "bitbucket"))
    const results = await run(outDir)
    expect(results.filter(it => !it.file.startsWith(outDir) || it.file.includes("github") || it.file.includes("bitbucket"))).toEqual([])
    expect(resultsOf(results, "update manifest signature")).toEqual(["verified", "verified"])
  })
})

describe("update manifest files", () => {
  test("are matched by sha512, also under the different name a GitHub manifest lists", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await writeLinuxApp(outDir, [keyA.publicKeyPem])
    await writeManifest(path.join(outDir, "latest-linux.yml"), [await writeArtifact(outDir, "My App-1.0.0.AppImage", "My-App-1.0.0.AppImage")])
    const results = await run(outDir)
    expect(results.find(it => it.check === "update manifest file")).toMatchObject({ status: "verified", message: expect.stringContaining("My App-1.0.0.AppImage") })
  })

  test("fail when an artifact is missing or was changed after the manifest was written", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await writeLinuxApp(outDir, [keyA.publicKeyPem])
    await writeManifest(path.join(outDir, "latest-linux.yml"), [await writeArtifact(outDir, "My-1.0.0.AppImage"), { url: "My-1.0.0.deb", sha512: "bWlzc2luZw==", size: 7 }])
    await writeFile(path.join(outDir, "My-1.0.0.AppImage"), "the artifact My-1.0.0.AppImagE")
    const results = await run(outDir)
    expect(resultsOf(results, "update manifest file")).toEqual(["failed", "failed"])
    expect(results.find(it => it.check === "update manifest file")?.message).toContain("it is missing, or it was changed after the manifest was written")
  })
})

describe("Windows artifacts", () => {
  const signed = (status: number | null, subject = "CN=My Company, O=My Company"): AuthenticodeSignerInfo => ({ type: "signed", subject, status })

  test("must carry a valid Authenticode signature, whose hash only Windows can validate", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    for (const name of ["Valid Setup.exe", "Unsigned.exe", "Modified.exe", "My.msi", "Elsewhere.exe", "notes.txt"]) {
      await write(path.join(outDir, name), name)
    }
    await write(path.join(outDir, "nsis-web", "Web Setup.exe"), "stub")
    const results = await run(
      outDir,
      {},
      {
        "Valid Setup.exe": signed(0),
        "Web Setup.exe": signed(4),
        "Modified.exe": signed(3),
        "My.msi": { type: "unreadable", reason: "not a PE file (no MZ header)" },
        "Elsewhere.exe": signed(null),
      }
    )
    const check = "Authenticode signature"
    expect(resultsOf(results, check, "Valid Setup.exe")).toEqual(["verified"])
    expect(resultsOf(results, check, "Web Setup.exe")).toEqual(["verified"])
    expect(resultsOf(results, check, "Unsigned.exe")).toEqual(["failed"])
    expect(resultsOf(results, check, "Modified.exe")).toEqual(["failed"])
    expect(resultsOf(results, check, "My.msi")).toEqual(["unverifiable"])
    expect(results.find(it => path.basename(it.file) === "Elsewhere.exe")?.message).toContain("the signature hash can only be validated on Windows")
    expect(resultsOf(results, check, "notes.txt")).toEqual([])
  })

  test("signing opt-outs are skipped, whatever the host can read", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await write(path.join(outDir, "My Setup.exe"), "exe")
    await write(path.join(outDir, "My.msi"), "msi")
    expect(resultsOf(await run(outDir, { win: { sign: false } }), "Authenticode signature")).toEqual(["skipped", "skipped"])
    const excluded = await run(outDir, { win: { signExts: ["!.msi"] } }, { "My Setup.exe": signed(0) })
    expect(resultsOf(excluded, "Authenticode signature", "My.msi")).toEqual(["skipped"])
    expect(resultsOf(excluded, "Authenticode signature", "My Setup.exe")).toEqual(["verified"])
  })

  test("the app executable is checked, and an update installer must match the publisherName electron-updater verifies it against", async ({ expect, tmpDir }) => {
    const outDir = await tmpDir.createTempDir()
    await write(path.join(outDir, "win-unpacked", "resources", "app-update.yml"), appUpdateYml({ keys: [keyA.publicKeyPem], publisherName: ["CN=My Company, O=My Company"] }))
    await write(path.join(outDir, "win-unpacked", "My.exe"), "app")
    await writeManifest(path.join(outDir, "latest.yml"), [await writeArtifact(outDir, "My Setup 1.0.0.exe", "My-Setup-1.0.0.exe")])

    const matching = await run(outDir, {}, { "My.exe": signed(0), "My Setup 1.0.0.exe": signed(0) })
    expect(resultsOf(matching, "Authenticode signature", "My.exe")).toEqual(["verified"])
    expect(resultsOf(matching, "update publisher", "My Setup 1.0.0.exe")).toEqual(["verified"])

    const other = await run(outDir, {}, { "My.exe": signed(0), "My Setup 1.0.0.exe": signed(0, "CN=Someone Else") })
    expect(other.find(it => it.check === "update publisher")).toMatchObject({ status: "failed", message: expect.stringContaining("electron-updater would reject this update") })
  })
})

describe("macOS artifacts", () => {
  async function writeMacOutput(outDir: string): Promise<void> {
    await write(path.join(outDir, "mac-arm64", "My.app", "Contents", "Info.plist"), "<plist/>")
    await write(path.join(outDir, "mas", "My.app", "Contents", "Info.plist"), "<plist/>")
    await write(path.join(outDir, "mas", "My-1.0.0.pkg"), "mas installer")
    await write(path.join(outDir, "My-1.0.0.pkg"), "installer")
    await write(path.join(outDir, "My-1.0.0.dmg"), "dmg")
  }

  test("on macOS: app signatures, notarization tickets (not for the Mac App Store), installers and a signed DMG", async ({ expect, tmpDir }) => {
    setPlatform("darwin")
    const outDir = await tmpDir.createTempDir()
    await writeMacOutput(outDir)
    vi.mocked(validateStapledTicket).mockImplementation(file => Promise.resolve(file.endsWith(".pkg") ? "My-1.0.0.pkg does not have a ticket stapled to it." : null))
    const results = await run(outDir, { dmg: { sign: true } })

    expect(results.filter(it => it.check === "code signature").map(it => path.relative(outDir, it.file))).toEqual([
      path.join("mac-arm64", "My.app"),
      path.join("mas", "My.app"),
      "My-1.0.0.dmg",
    ])
    expect(results.filter(it => it.check === "notarization ticket").map(it => [path.relative(outDir, it.file), it.status])).toEqual([
      [path.join("mac-arm64", "My.app"), "verified"],
      ["My-1.0.0.pkg", "failed"],
    ])
    expect(resultsOf(results, "installer signature")).toEqual(["verified", "verified"])
    expect(verifyMacCodeSignature).toHaveBeenCalledWith(path.join(outDir, "My-1.0.0.dmg"), { deep: false })
  })

  test("off macOS the checks cannot run, but opt-outs are still skipped", async ({ expect, tmpDir }) => {
    setPlatform("linux")
    const outDir = await tmpDir.createTempDir()
    await writeMacOutput(outDir)
    const results = await run(outDir, { mac: { notarize: false } })
    expect(resultsOf(results, "code signature")).toEqual(["unverifiable", "unverifiable"])
    expect(resultsOf(results, "notarization ticket")).toEqual(["skipped", "skipped"])
    expect(verifyMacCodeSignature).not.toHaveBeenCalled()

    // mac.sign: null opts out of the app signature and notarization checks
    expect(resultsOf(await run(outDir, { mac: { sign: null } }), "code signature")).toEqual(["skipped", "skipped"])
  })

  test("a MAS app follows its mas (and masDev) sign configuration, which cascades over mac", async ({ expect, tmpDir }) => {
    setPlatform("darwin")
    const outDir = await tmpDir.createTempDir()
    await write(path.join(outDir, "mac", "My.app", "Contents", "Info.plist"), "<plist/>")
    await write(path.join(outDir, "mas-arm64", "My.app", "Contents", "Info.plist"), "<plist/>")
    await write(path.join(outDir, "mas-dev", "My.app", "Contents", "Info.plist"), "<plist/>")
    const statusOf = (results: Array<VerificationResult>) =>
      Object.fromEntries(results.filter(it => it.check === "code signature").map(it => [path.basename(path.dirname(it.file)), it.status]))

    // mas.sign: null opts the MAS apps out, not the mac app
    const masOff = await run(outDir, { mas: { sign: null } })
    expect(statusOf(masOff)).toEqual({ mac: "verified", "mas-arm64": "skipped", "mas-dev": "skipped" })
    expect(masOff.find(it => it.file.includes("mas-arm64"))?.message).toBe("mas.sign (or its identity) is null in the configuration")
    // masDev only affects mas-dev; an identity of null in a sign object opts out too
    expect(statusOf(await run(outDir, { masDev: { sign: { identity: null } } }))).toEqual({ mac: "verified", "mas-arm64": "verified", "mas-dev": "skipped" })
    // mac.sign: null cascades to the MAS apps, unless mas signs them again
    expect(statusOf(await run(outDir, { mac: { sign: null }, mas: { sign: { identity: "3rd Party Mac Developer Application: Foo" } } }))).toEqual({
      mac: "skipped",
      "mas-arm64": "verified",
      "mas-dev": "verified",
    })
    // strictVerify merges over mac's sign object
    vi.mocked(verifyMacCodeSignature).mockClear()
    await run(outDir, { mac: { sign: { strictVerify: false } }, mas: { sign: { type: "distribution" } } })
    expect(vi.mocked(verifyMacCodeSignature).mock.calls.map(call => call[1].strict)).toEqual([false, false, false])
  })

  test("only the app output directories of the mac targets are read as macOS apps", async ({ expect, tmpDir }) => {
    setPlatform("darwin")
    const outDir = await tmpDir.createTempDir()
    for (const dir of ["mac", "mac-universal", "mas-x64", "mas-dev-arm64", "machine-learning", "mascot", "mac-arm64-extra", "mac-universal-x64-temp"]) {
      await write(path.join(outDir, dir, "My.app", "Contents", "Info.plist"), "<plist/>")
    }
    for (const dir of ["linux-unpacked", "win-ia32-unpacked", "linux-tools-unpacked"]) {
      await write(path.join(outDir, dir, "resources", "app-update.yml"), "- not a mapping\n")
    }
    const results = await run(outDir)
    expect(
      results
        .filter(it => it.check === "code signature")
        .map(it => path.relative(outDir, path.dirname(it.file)))
        .sort()
    ).toEqual(["mac", "mac-universal", "mas-dev-arm64", "mas-x64"])
    expect(
      results
        .filter(it => it.check === "app update configuration")
        .map(it => path.relative(outDir, it.file).split(path.sep)[0])
        .sort()
    ).toEqual(["linux-unpacked", "win-ia32-unpacked"])
  })

  test("hands the tools absolute paths only, so a file name such as -v.pkg is never read as an option", async ({ expect, tmpDir }) => {
    setPlatform("darwin")
    const outDir = await tmpDir.createTempDir()
    await write(path.join(outDir, "-v.pkg"), "installer")
    await write(path.join(outDir, "mac", "-v.app", "Contents", "Info.plist"), "<plist/>")
    await run(path.relative(process.cwd(), outDir))
    const files = [...vi.mocked(checkInstallerPackageSignature).mock.calls.map(call => call[0]), ...vi.mocked(verifyMacCodeSignature).mock.calls.map(call => call[0])]
    expect(files).toEqual([path.join(outDir, "-v.pkg"), path.join(outDir, "mac", "-v.app")])
    expect(files.every(it => path.isAbsolute(it))).toBe(true)
  })

  test("honors mac.sign.strictVerify", async ({ expect, tmpDir }) => {
    setPlatform("darwin")
    const outDir = await tmpDir.createTempDir()
    await write(path.join(outDir, "mac", "My.app", "Contents", "Info.plist"), "<plist/>")
    await run(outDir, { mac: { sign: { strictVerify: false } } })
    expect(verifyMacCodeSignature).toHaveBeenCalledWith(path.join(outDir, "mac", "My.app"), { deep: true, strict: false })
  })
})
