import { getMakeNsisPath } from "app-builder-lib/src/toolsets/nsis"
import { serializeToYaml, spawnAndWriteWithOutput } from "builder-util"
import { GenericServerOptions, UpdateInfo } from "builder-util-runtime"
import { readExecutableProductVersions } from "electron-updater/src/windowsExecutableVersion"
import { createHash } from "crypto"
import fsExtra from "fs-extra"
import type { Server } from "http"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, describe, test } from "vitest"
import { createLocalServer } from "../helpers/launchAppCrossPlatform.js"
import { createNsisUpdater, trackEvents, windowsExecutable, writeRawUpdateConfig, writeUpdateConfig } from "../helpers/updaterTestUtil.js"

// An update manifest that is not signed binds the installer only by a checksum it chooses itself, so NsisUpdater also requires the
// ProductVersion of a signed installer to be the update version (the version electron-builder writes into both).

const DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#nsis-update-installers-must-carry-the-updates-version"
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

async function writeExecutable(tmpDir: TmpDir, content: Buffer): Promise<string> {
  const file = path.join(await tmpDir.createTempDir({ prefix: "installer-version" }), "installer.exe")
  await fsExtra.writeFile(file, content)
  return file
}

// offsets of the structures of a windowsExecutable() the tests corrupt
function layout(exe: Buffer) {
  const pe = exe.readUInt32LE(0x3c)
  const optionalHeader = pe + 24
  const directoriesCount = optionalHeader + (exe.readUInt16LE(optionalHeader) === 0x20b ? 108 : 92)
  const resourceDirectory = directoriesCount + 4 + 2 * 8
  const sectionTable = optionalHeader + exe.readUInt16LE(pe + 20)
  const resourceRva = exe.readUInt32LE(resourceDirectory)
  let resourceSection = -1
  for (let i = 0; i < exe.readUInt16LE(pe + 6); i++) {
    const section = sectionTable + i * 40
    const virtualAddress = exe.readUInt32LE(section + 12)
    if (resourceRva >= virtualAddress && resourceRva < virtualAddress + exe.readUInt32LE(section + 8)) {
      resourceSection = section
    }
  }
  const resourceRoot = resourceSection === -1 ? -1 : exe.readUInt32LE(resourceSection + 20) + resourceRva - exe.readUInt32LE(resourceSection + 12)
  const key = (text: string) => exe.indexOf(Buffer.from(text, "utf16le")) - 6
  return { pe, optionalHeader, directoriesCount, resourceDirectory, resourceSection, resourceRoot, versionInfo: key("VS_VERSION_INFO"), productVersion: key("ProductVersion") }
}

function corrupt(change: (exe: Buffer, offsets: ReturnType<typeof layout>) => void): Buffer {
  const exe = windowsExecutable(["1.1.0"])
  change(exe, layout(exe))
  return exe
}

describe("readExecutableProductVersions", () => {
  test("reads the ProductVersion of a 64-bit and a 32-bit executable", async ({ expect, tmpDir }) => {
    for (const is32Bit of [false, true]) {
      const file = await writeExecutable(tmpDir, windowsExecutable(["1.2.3-beta.1"], { is32Bit }))
      expect(await readExecutableProductVersions(file)).toEqual(["1.2.3-beta.1"])
    }
  })

  test("reads the ProductVersion of every string table", async ({ expect, tmpDir }) => {
    const file = await writeExecutable(tmpDir, windowsExecutable(["1.1.0", "1.0.0"]))
    expect(await readExecutableProductVersions(file)).toEqual(["1.1.0", "1.0.0"])
  })

  // the installer is what electron-builder compiles: VIAddVersionKey ProductVersion is the app version (see NsisTarget.computeVersionKey)
  test("reads the ProductVersion of an installer compiled by makensis", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "installer-version-makensis" })
    const installer = path.join(dir, "installer.exe")
    const makensis = await getMakeNsisPath(undefined, dir)
    const script = [
      "Unicode true",
      "SilentInstall silent",
      `OutFile "${installer}"`,
      'VIProductVersion "1.2.3.0"',
      'VIAddVersionKey /LANG=1033 ProductName "Test App"',
      'VIAddVersionKey /LANG=1033 FileDescription "Test App"',
      'VIAddVersionKey /LANG=1033 LegalCopyright "Test"',
      'VIAddVersionKey /LANG=1033 ProductVersion "1.2.3-beta.1"',
      'VIAddVersionKey /LANG=1033 FileVersion "1.2.3.0"',
      "Section",
      "SectionEnd",
    ]
    await spawnAndWriteWithOutput(makensis.path, ["-WX", "-V2", "-"], script.join("\n"), { env: { ...process.env, ...makensis.env } })
    expect(await readExecutableProductVersions(installer)).toEqual(["1.2.3-beta.1"])
  })

  test("is empty without a version resource, or without a ProductVersion in it", async ({ expect, tmpDir }) => {
    expect(await readExecutableProductVersions(await writeExecutable(tmpDir, windowsExecutable([])))).toEqual([])
    expect(await readExecutableProductVersions(await writeExecutable(tmpDir, windowsExecutable([null])))).toEqual([])
  })

  test("is empty when the optional header has no resource directory entry", async ({ expect, tmpDir }) => {
    const exe = corrupt((exe, { directoriesCount }) => exe.writeUInt32LE(2, directoriesCount))
    expect(await readExecutableProductVersions(await writeExecutable(tmpDir, exe))).toEqual([])
  })

  test.for<[string, () => Buffer, string]>([
    ["a file shorter than a DOS header", () => Buffer.from("MZ"), "unexpected end of file"],
    ["a file that is no executable", () => Buffer.alloc(128, "not an executable"), "no MZ signature"],
    ["an executable without a PE signature", () => corrupt((exe, { pe }) => exe.writeUInt32LE(0, pe)), "no PE signature"],
    ["an unknown optional header", () => corrupt((exe, { optionalHeader }) => exe.writeUInt16LE(0x107, optionalHeader)), "unknown optional header magic 0x107"],
    [
      "a resource directory in no section",
      () => corrupt((exe, { resourceDirectory }) => exe.writeUInt32LE(0x7fff0000, resourceDirectory)),
      "the resource directory is in no section",
    ],
    [
      "a resource section larger than 16 MB",
      () => corrupt((exe, { resourceSection }) => exe.writeUInt32LE(16 * 1024 * 1024 + 1, resourceSection + 16)),
      "the resource section has 16777217 bytes",
    ],
    [
      "resource directory entries beyond the resource section",
      () => corrupt((exe, { resourceRoot }) => exe.writeUInt16LE(0xffff, resourceRoot + 14)),
      "is outside the resource section",
    ],
    ["a version resource longer than its data", () => corrupt((exe, { versionInfo }) => exe.writeUInt16LE(0xffff, versionInfo)), "a version resource block has an invalid length"],
    // a block of length 0 would be read again and again
    ["a string of length 0", () => corrupt((exe, { productVersion }) => exe.writeUInt16LE(0, productVersion)), "a version resource block has an invalid length"],
    [
      "a version resource that is no VS_VERSIONINFO",
      () => corrupt((exe, { versionInfo }) => exe.write("X", versionInfo + 6, "utf16le")),
      "the version resource is no VS_VERSIONINFO",
    ],
  ])("throws for %s", async ([, content, message], { expect, tmpDir }) => {
    await expect(readExecutableProductVersions(await writeExecutable(tmpDir, content()))).rejects.toThrow(message)
  })
})

describe("NsisUpdater installer version check", () => {
  const signedConfig = (url = "https://example.com/updates") => writeRawUpdateConfig<GenericServerOptions>({ provider: "generic", url, publisherName: ["CN=Test"] })
  const update = (version: string, manifestSignatureVerified = false) => ({ info: { version } as UpdateInfo, manifestSignatureVerified })

  async function signedUpdater() {
    const updater = await createNsisUpdater("1.0.0")
    updater.updateConfigPath = await signedConfig()
    return updater
  }

  test("accepts an installer whose every ProductVersion is the update version", async ({ expect, tmpDir }) => {
    const updater = await signedUpdater()
    const file = await writeExecutable(tmpDir, windowsExecutable(["1.1.0", "1.1.0"]))
    // @ts-expect-error accessing a private method
    await expect(updater.verifyInstallerVersion(file, update("1.1.0"))).resolves.toBeUndefined()
  })

  test.for<[string, Array<string | null>, string]>([
    ["of an older release", ["1.0.0"], 'its ProductVersion is "1.0.0"'],
    ["with one string table of another version", ["1.1.0", "1.0.0"], 'its ProductVersion is "1.0.0"'],
    ["without a ProductVersion", [null], "it has no ProductVersion"],
  ])("rejects an installer %s", async ([, productVersions, reason], { expect, tmpDir }) => {
    const updater = await signedUpdater()
    const file = await writeExecutable(tmpDir, windowsExecutable(productVersions))
    // @ts-expect-error accessing a private method
    await expect(updater.verifyInstallerVersion(file, update("1.1.0"))).rejects.toMatchObject({
      code: "ERR_UPDATER_INSTALLER_VERSION_MISMATCH",
      message: expect.stringMatching(
        new RegExp(`^The installer of version 1\\.1\\.0 is rejected: ${escapeRegExp(reason)}\\. electron-updater 7 .*updateManifestPublicKey.* ${escapeRegExp(DOCS)}$`)
      ),
    })
  })

  test("rejects an installer whose ProductVersion cannot be read", async ({ expect, tmpDir }) => {
    const updater = await signedUpdater()
    const file = await writeExecutable(tmpDir, Buffer.alloc(128, "not an executable"))
    // @ts-expect-error accessing a private method
    await expect(updater.verifyInstallerVersion(file, update("1.1.0"))).rejects.toMatchObject({
      code: "ERR_UPDATER_INSTALLER_VERSION_MISMATCH",
      message: expect.stringContaining("its ProductVersion cannot be read (no MZ signature)"),
    })
  })

  // a verified manifest binds the installer by its sha512
  test("is skipped for an update whose manifest signature was verified", async ({ expect, tmpDir }) => {
    const updater = await signedUpdater()
    const file = await writeExecutable(tmpDir, windowsExecutable(["1.0.0"]))
    // @ts-expect-error accessing a private method
    await expect(updater.verifyInstallerVersion(file, update("1.1.0", true))).resolves.toBeUndefined()
  })

  // without a signature check, any installer is accepted anyway
  test("is skipped when the update config opts out of signature verification", async ({ expect, tmpDir }) => {
    const updater = await createNsisUpdater("1.0.0")
    updater.updateConfigPath = await writeUpdateConfig<GenericServerOptions>({ provider: "generic", url: "https://example.com/updates" })
    const file = await writeExecutable(tmpDir, windowsExecutable(["1.0.0"]))
    // @ts-expect-error accessing a private method
    await expect(updater.verifyInstallerVersion(file, update("1.1.0"))).resolves.toBeUndefined()
  })

  test("is skipped without an update config file", async ({ expect, tmpDir }) => {
    const updater = await createNsisUpdater("1.0.0")
    updater.updateConfigPath = "/nonexistent/dir/app-update.yml"
    const file = await writeExecutable(tmpDir, windowsExecutable(["1.0.0"]))
    // @ts-expect-error accessing a private method
    await expect(updater.verifyInstallerVersion(file, update("1.1.0"))).resolves.toBeUndefined()
  })

  // as in verifySignature, which reads the same config first
  test("rejects the update when the update config cannot be read", async ({ expect, tmpDir }) => {
    const updater = await createNsisUpdater("1.0.0")
    const config = path.join(await tmpDir.createTempDir({ prefix: "installer-version-config" }), "app-update.yml")
    await fsExtra.writeFile(config, "provider: [generic")
    updater.updateConfigPath = config
    const file = await writeExecutable(tmpDir, windowsExecutable(["1.1.0"]))
    // @ts-expect-error accessing a private method
    const result: Promise<void> = updater.verifyInstallerVersion(file, update("1.1.0"))
    await expect(result).rejects.toBeInstanceOf(Error)
    await expect(result).rejects.not.toMatchObject({ code: "ERR_UPDATER_INSTALLER_VERSION_MISMATCH" })
  })

  describe("download", () => {
    const servers: Array<Server> = []
    afterEach(() => {
      for (const server of servers.splice(0)) {
        server.close()
      }
    })

    async function checkForUpdates(tmpDir: TmpDir, installer: Buffer) {
      const root = await tmpDir.createTempDir({ prefix: "installer-version-server" })
      await fsExtra.outputFile(path.join(root, "TestApp-Setup-1.1.0.exe"), installer)
      const sha512 = createHash("sha512").update(installer).digest("base64")
      await fsExtra.outputFile(
        path.join(root, "latest.yml"),
        serializeToYaml({ version: "1.1.0", files: [{ url: "TestApp-Setup-1.1.0.exe", sha512, size: installer.length }], releaseDate: "2024-01-01T00:00:00.000Z" })
      )
      const { server, port } = await createLocalServer(root)
      servers.push(server)
      const updater = await createNsisUpdater("1.0.0")
      updater.updateConfigPath = await signedConfig(`http://127.0.0.1:${port}`)
      updater.verifyUpdateFileAuthenticodeSignature = () => Promise.resolve({ response: "success" })
      const events = trackEvents(updater)
      return { events, result: await updater.checkForUpdates() }
    }

    test("a signed installer of an older release served under a newer version is rejected", async ({ expect, tmpDir }) => {
      const { events, result } = await checkForUpdates(tmpDir, windowsExecutable(["1.0.0"]))
      await expect(result?.downloadPromise).rejects.toMatchObject({ code: "ERR_UPDATER_INSTALLER_VERSION_MISMATCH" })
      expect(events).toEqual(["checking-for-update", "update-available", "error"])
    })

    test("the signed installer of the update version is downloaded", async ({ expect, tmpDir }) => {
      const { events, result } = await checkForUpdates(tmpDir, windowsExecutable(["1.1.0"]))
      await expect(result?.downloadPromise).resolves.toBeDefined()
      expect(events).toEqual(["checking-for-update", "update-available", "update-downloaded"])
    })
  })
})
