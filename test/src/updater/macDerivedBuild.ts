import { build, Configuration } from "app-builder-lib"
import { AsarFilesystem, Node, readAsarHeader } from "app-builder-lib/src/asar/asar"
import { AsarIntegrity } from "app-builder-lib/src/asar/integrity"
import { createKeychain, findIdentity, removeKeychain } from "app-builder-lib/src/codeSign/mac/macCodeSign"
import { computeAsarIntegrityDigest, writeAsarIntegrityDigest } from "app-builder-lib/src/electron/mac/asarIntegrityDigest"
import { parsePlistFile, savePlistFile } from "app-builder-lib/src/util/mac/plist"
import { exec, Executables, TmpDir } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { Arch, Platform } from "electron-builder"
import { move, outputJson, readdir, readFile } from "fs-extra"
import { open } from "fs/promises"
import { createHash } from "crypto"
import path from "path"
import { ExpectStatic } from "vitest"
import { getMacSigningIdentity } from "../helpers/packTester"
import { installMac, macAppBundle } from "./blackboxInstallMac"
import { ApplicationUpdatePaths, assertAsarIntegrityDigestEmbedded, testAppConfiguration } from "./blackboxUpdateHelpers"

/** A version of the test app derived from a mac build of it (see {@link deriveMacBuild}). */
export interface DerivedMacVersion {
  version: string
  /** configuration of this version's update files, e.g. its `updateManifest` keys, as the `extraConfig` of a VersionBuild */
  extraConfig?: Partial<Configuration> | Nullish
  compression: Configuration["compression"]
}

/** Offset of the header JSON in an asar: the size pickle (8 bytes), then the header pickle's payload size and string length (4 bytes each). */
const ASAR_HEADER_STRING_OFFSET = 16

/**
 * The test app at `derived.version`, made from the mac build `from` (of `fromVersion`) without building it again: an update between two
 * builds of the test app only needs them to differ in version, and a build (fixture install, native rebuild, signing, zip) is most of the
 * time of a mac blackbox case. A copy of the built app gets the new version in the package.json of its asar and in its Info.plist, the
 * ASAR integrity that follows from that (Info.plist entries and the digest in the Electron Framework, see mac.asarIntegrityDigest), and
 * the code signature of the test identity again; electron-builder then packages that app (`prepackaged`) into its zip, block map and
 * latest-mac.yml, signed with `derived.extraConfig`'s update manifest keys. The app's `app-update.yml` stays the one of `from`.
 *
 * Returns the output laid out like a build's: the update files and `mac*` / TestApp.app. macOS only (codesign, ditto).
 */
export async function deriveMacBuild(
  expect: ExpectStatic,
  { from, fromVersion, arch, derived, tmpDir }: { from: ApplicationUpdatePaths; fromVersion: string; arch: Arch; derived: DerivedMacVersion; tmpDir: TmpDir }
): Promise<ApplicationUpdatePaths> {
  const { version } = derived
  const workDir = await tmpDir.getTempDir({ prefix: `derived-${version}` })
  // alone in its directory: electron-builder packages the directory of a prepackaged app
  const appPath = path.join(workDir, "prepackaged", "TestApp.app")
  // ditto keeps the symlinks of the bundle's frameworks and its code signature
  await exec("ditto", [macAppBundle(from.dir, arch), appPath])

  const integrity = await setAppVersion(appPath, fromVersion, version)
  const frameworkBinary = path.join(electronFramework(appPath), "Versions", "A", "Electron Framework")
  expect(await writeAsarIntegrityDigest(frameworkBinary, computeAsarIntegrityDigest(integrity)), "the ASAR integrity digest slots (one per slice)").toBe(
    arch === Arch.universal ? 2 : 1
  )
  await signAgain(appPath, await helpersWithAsarIntegrity(appPath), tmpDir)

  const dir = path.join(workDir, "dist")
  await packageUpdateFiles(appPath, dir, arch, derived, tmpDir)
  // where a build leaves the app, next to the update files
  await move(appPath, macAppBundle(dir, arch))
  await assertAsarIntegrityDigestEmbedded(expect, path.join(macAppBundle(dir, arch), "Contents"), arch)
  return { dir, appPath: installMac(dir, arch) }
}

function electronFramework(appPath: string): string {
  return path.join(appPath, "Contents", "Frameworks", "Electron Framework.framework")
}

/**
 * Sets `toVersion` in the package.json of the app's asar(s) and in its Info.plist, and the ElectronAsarIntegrity entries that follow from
 * the changed asar headers in every Info.plist that has them (a universal app has them in its helpers' too). Returns the new entries.
 */
async function setAppVersion(appPath: string, fromVersion: string, toVersion: string): Promise<AsarIntegrity> {
  const contents = path.join(appPath, "Contents")
  const infoPlistPath = path.join(contents, "Info.plist")
  const infoPlist = await parsePlistFile<Record<string, any>>(infoPlistPath)
  const current: AsarIntegrity | undefined = infoPlist.ElectronAsarIntegrity
  if (current == null) {
    throw new Error(`${infoPlistPath} has no ElectronAsarIntegrity`)
  }

  const integrity: AsarIntegrity = {}
  let versionedAsars = 0
  for (const [key, entry] of Object.entries(current)) {
    const { header, versioned } = await setAsarPackageVersion(path.join(contents, key), fromVersion, toVersion)
    versionedAsars += versioned ? 1 : 0
    // what electron-builder and @electron/universal record: the SHA-256 of the header JSON
    integrity[key] = { ...entry, hash: createHash("sha256").update(header).digest("hex") }
  }
  if (versionedAsars === 0) {
    throw new Error(`No asar of ${appPath} has a package.json of version ${fromVersion}`)
  }

  // CFBundleVersion is the build version: the version, or the version and a CI build number
  for (const key of ["CFBundleShortVersionString", "CFBundleVersion"]) {
    const value = infoPlist[key]
    if (typeof value !== "string" || !(value === fromVersion || value.startsWith(`${fromVersion}.`))) {
      throw new Error(`${key} of ${infoPlistPath} is ${value}, not ${fromVersion}`)
    }
    infoPlist[key] = toVersion + value.substring(fromVersion.length)
  }
  infoPlist.ElectronAsarIntegrity = integrity
  await savePlistFile(infoPlistPath, infoPlist)

  for (const helper of await helpersWithAsarIntegrity(appPath)) {
    const helperPlistPath = path.join(helper, "Contents", "Info.plist")
    const helperPlist = await parsePlistFile<Record<string, any>>(helperPlistPath)
    helperPlist.ElectronAsarIntegrity = integrity
    await savePlistFile(helperPlistPath, helperPlist)
  }
  return integrity
}

/** The helper apps whose Info.plist has ElectronAsarIntegrity entries: @electron/universal writes them into every Info.plist of a universal app. */
async function helpersWithAsarIntegrity(appPath: string): Promise<Array<string>> {
  const frameworks = path.join(appPath, "Contents", "Frameworks")
  const helpers: Array<string> = []
  for (const name of await readdir(frameworks)) {
    // checked as text first: an Info.plist electron-builder did not write may not be XML
    if (name.endsWith(".app") && (await readFile(path.join(frameworks, name, "Contents", "Info.plist"), "utf8")).includes("ElectronAsarIntegrity")) {
      helpers.push(path.join(frameworks, name))
    }
  }
  return helpers
}

/**
 * Sets `toVersion` in the package.json at the root of `asarFile`, in place, with its integrity in the header; returns the header and
 * whether the asar has such a package.json (a version of another length would move every file after it, so it is refused).
 */
async function setAsarPackageVersion(asarFile: string, fromVersion: string, toVersion: string): Promise<{ header: string; versioned: boolean }> {
  const { header, size } = await readAsarHeader(asarFile)
  const archive = new AsarFilesystem(asarFile, JSON.parse(header), size)
  const node = archive.header.files?.["package.json"]
  if (node == null || node.unpacked === true || node.offset == null || node.integrity == null) {
    return { header, versioned: false }
  }
  const text = (await archive.readFile("package.json")).toString("utf8")
  const metadata = JSON.parse(text)
  if (metadata.version !== fromVersion) {
    return { header, versioned: false }
  }
  if (toVersion.length !== fromVersion.length) {
    throw new Error(`Cannot set version ${toVersion} in ${asarFile}: it must be as long as ${fromVersion}, the files after package.json would move`)
  }
  // @electron/asar stores a file whose content an earlier one has once, at the earlier one's offset
  if (countNodesAt(archive.header, node.offset) !== 1) {
    throw new Error(`Cannot set the version in ${asarFile}: another file shares the content of its package.json`)
  }
  if (JSON.stringify(JSON.parse(header)) !== header) {
    throw new Error(`Cannot set the version in ${asarFile}: its header is not the JSON.stringify output it is rewritten as`)
  }

  const patched = Buffer.from(text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${toVersion}$2`), "utf8")
  if (JSON.stringify(JSON.parse(patched.toString("utf8"))) !== JSON.stringify({ ...metadata, version: toVersion })) {
    throw new Error(`Cannot set the version in the package.json of ${asarFile}: its first "version" is not the package's`)
  }
  node.integrity = fileIntegrity(patched, node.integrity.blockSize)
  const patchedHeader = JSON.stringify(archive.header)
  if (Buffer.byteLength(patchedHeader) !== Buffer.byteLength(header)) {
    throw new Error(`Cannot set the version in ${asarFile}: the header changed size`)
  }

  const handle = await open(asarFile, "r+")
  try {
    const stored = Buffer.alloc(Buffer.byteLength(header))
    await handle.read(stored, 0, stored.length, ASAR_HEADER_STRING_OFFSET)
    if (stored.toString("utf8") !== header) {
      throw new Error(`Unexpected header layout of ${asarFile}`)
    }
    await handle.write(Buffer.from(patchedHeader, "utf8"), 0, stored.length, ASAR_HEADER_STRING_OFFSET)
    await handle.write(patched, 0, patched.length, 8 + size + parseInt(node.offset, 10))
  } finally {
    await handle.close()
  }
  return { header: patchedHeader, versioned: true }
}

function countNodesAt(node: Node, offset: string): number {
  let count = node.unpacked !== true && node.offset === offset ? 1 : 0
  for (const child of Object.values(node.files ?? {})) {
    count += countNodesAt(child, offset)
  }
  return count
}

/** The integrity @electron/asar records for a file: the SHA-256 of the whole file and of each block of `blockSize`. */
function fileIntegrity(data: Buffer, blockSize: number): NonNullable<Node["integrity"]> {
  const sha256 = (it: Buffer) => createHash("sha256").update(it).digest("hex")
  const blocks: Array<string> = []
  for (let offset = 0; offset < data.length; offset += blockSize) {
    blocks.push(sha256(data.subarray(offset, offset + blockSize)))
  }
  return { algorithm: "SHA256", hash: sha256(data), blockSize, blocks: blocks.length === 0 ? [sha256(data)] : blocks }
}

/**
 * Signs the code whose content changed again, inside out, with the identity the build signed with (Squirrel.Mac only installs an update
 * signed like the installed app): the helpers whose Info.plist changed, the Electron Framework (its binary holds the digest), and the app
 * (its Info.plist and asar). The entitlements, requirements and flags the build signed them with are kept.
 */
async function signAgain(appPath: string, changedHelpers: Array<string>, tmpDir: TmpDir): Promise<void> {
  const { p12Base64, password } = await getMacSigningIdentity()
  // the keychain electron-builder imports the identity into for a build
  const { keychainFile } = await createKeychain({ tmpDir, cscLink: p12Base64, cscKeyPassword: password, currentDir: appPath })
  if (keychainFile == null) {
    throw new Error("No keychain was created for the test signing identity")
  }
  try {
    const identity = await findIdentity("Developer ID Application", null, keychainFile)
    if (identity == null) {
      throw new Error("The test signing identity is not in its keychain")
    }
    const codesign = Executables.resolve("codesign")
    for (const code of [...changedHelpers, electronFramework(appPath), appPath]) {
      await exec(codesign, [
        "--sign",
        identity.hash ?? identity.name,
        "--keychain",
        keychainFile,
        "--force",
        "--timestamp=none",
        "--preserve-metadata=identifier,entitlements,requirements,flags,runtime",
        code,
      ])
    }
    await exec(codesign, ["--verify", "--deep", "--strict", appPath])
  } finally {
    await removeKeychain(keychainFile)
  }
}

/** electron-builder packages the app (`prepackaged`, which it does not change or sign) into the zip, block map and latest-mac.yml of `derived`. */
async function packageUpdateFiles(appPath: string, outDir: string, arch: Arch, { version, extraConfig, compression }: DerivedMacVersion, tmpDir: TmpDir): Promise<void> {
  const projectDir = await tmpDir.getTempDir({ prefix: `derived-${version}-project` })
  await outputJson(path.join(projectDir, "package.json"), { name: "testapp", version, description: "Test Application", author: "Foo Bar <foo@example.com>" })
  await build({
    projectDir,
    prepackaged: appPath,
    targets: Platform.MAC.createTarget("zip", arch),
    publish: "never",
    // unsigned unless the version configures keys, as assertPack builds the test app
    config: testAppConfiguration(version, { ...extraConfig, compression, directories: { output: outDir }, updateManifest: extraConfig?.updateManifest ?? false }),
  })
}
