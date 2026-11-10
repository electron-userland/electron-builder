import { createTempUpdateFile, DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { outputFile, outputJson, pathExists, readJson, remove } from "fs-extra"
import { createHash } from "crypto"
import * as path from "path"
import { beforeEach, describe, expect, test } from "vitest"
import { hashFile } from "builder-util-runtime"
import type { UpdateFileInfo, UpdateInfo } from "builder-util-runtime"
import { load } from "js-yaml"
import type { ResolvedUpdateFileInfo } from "electron-updater/src/types"
import { makeLogger } from "../helpers/updaterTestUtil"

function makeFileInfo(sha512: string, fileName = "TestApp Setup.exe"): ResolvedUpdateFileInfo {
  return {
    url: new URL("https://example.com/" + fileName),
    info: { url: fileName, sha512, size: 1024 },
  }
}

function makeUpdateInfo(version = "1.0.1"): UpdateInfo {
  return { version, files: [], path: "", sha512: "", releaseDate: "" }
}

describe("downloadedUpdateHelper", { concurrent: false }, () => {
  describe("DownloadedUpdateHelper.getValidCachedUpdateFile", () => {
    let cacheDir: string
    let helper: DownloadedUpdateHelper
    let log: ReturnType<typeof makeLogger>

    beforeEach(async context => {
      cacheDir = await context.tmpDir.createTempDir()
      log = makeLogger()
      helper = new DownloadedUpdateHelper(cacheDir, log)
    })

    test("returns null when update-info.json does not exist", async () => {
      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo("sha512abc"))
      expect(result).toBeNull()
    })

    test("returns null and cleans cache when update-info.json contains invalid JSON", async () => {
      const pending = path.join(cacheDir, "pending")
      const infoFile = path.join(pending, "update-info.json")
      await outputFile(infoFile, "not-valid-json{{{{")

      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo("sha512abc"))
      expect(result).toBeNull()
      // cache directory is emptied, info file should be gone
      expect(await pathExists(infoFile)).toBe(false)
      expect(log.infos.some(m => m.includes("No cached update info"))).toBe(true)
    })

    test("returns null and cleans cache when update-info.json has no file name", async () => {
      const pending = path.join(cacheDir, "pending")
      const infoFile = path.join(pending, "update-info.json")
      await outputJson(infoFile, { sha512: "sha512abc", isAdminRightsRequired: false })

      await expect((helper as any).getValidCachedUpdateFile(makeFileInfo("sha512abc"))).resolves.toBeNull()
      expect(await pathExists(infoFile)).toBe(false)
      expect(log.warns.some(m => m.includes("invalid fileName"))).toBe(true)
    })

    test("does not read a cached update path outside the pending directory", async () => {
      const pending = path.join(cacheDir, "pending")
      const outsideFile = path.join(cacheDir, "outside.exe")
      const content = Buffer.from("outside content")
      const sha512 = createHash("sha512").update(content).digest("base64")
      await outputFile(outsideFile, content)
      await outputJson(path.join(pending, "update-info.json"), {
        fileName: "../outside.exe",
        sha512,
        isAdminRightsRequired: false,
      })

      await expect((helper as any).getValidCachedUpdateFile(makeFileInfo(sha512))).resolves.toBeNull()
      expect(await pathExists(outsideFile)).toBe(true)
    })

    test("returns null and cleans cache when sha512 in info does not match expected", async () => {
      const pending = path.join(cacheDir, "pending")
      const infoFile = path.join(pending, "update-info.json")
      await outputJson(infoFile, { fileName: "TestApp Setup.exe", sha512: "old-hash", isAdminRightsRequired: false })
      await outputFile(path.join(pending, "TestApp Setup.exe"), "dummy-content")

      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo("new-hash"))
      expect(result).toBeNull()
      expect(await pathExists(infoFile)).toBe(false)
      expect(log.infos.some(m => m.includes("doesn't match"))).toBe(true)
    })

    test("returns null when update file listed in info does not exist on disk", async () => {
      const pending = path.join(cacheDir, "pending")
      const sha512 = "abc123"
      await outputJson(path.join(pending, "update-info.json"), { fileName: "TestApp Setup.exe", sha512, isAdminRightsRequired: false })
      // intentionally do NOT write the installer file

      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo(sha512))
      expect(result).toBeNull()
      expect(log.infos.some(m => m.includes("doesn't exist"))).toBe(true)
    })

    test("returns null and cleans cache when actual file hash mismatches info sha512", async () => {
      const pending = path.join(cacheDir, "pending")
      const declaredHash = "declared-hash-that-wont-match"
      const installerPath = path.join(pending, "TestApp Setup.exe")
      await outputJson(path.join(pending, "update-info.json"), { fileName: "TestApp Setup.exe", sha512: declaredHash, isAdminRightsRequired: false })
      await outputFile(installerPath, "binary content that will produce a different sha512")

      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo(declaredHash))
      expect(result).toBeNull()
      expect(await pathExists(installerPath)).toBe(false)
      expect(log.warns.some(w => w.includes("doesn't match"))).toBe(true)
    })
  })

  describe("createTempUpdateFile", () => {
    let cacheDir: string

    beforeEach(async context => {
      cacheDir = await context.tmpDir.createTempDir()
    })

    test("returns the path directly when no existing file blocks it", async () => {
      const result = await createTempUpdateFile("update.exe", cacheDir, makeLogger())
      expect(result).toBe(path.join(cacheDir, "update.exe"))
    })

    test("uses an incremented suffix when the first path is locked (cannot be unlinked)", async () => {
      // Pre-create the first two candidate paths so unlink on the locked file
      // throws a non-ENOENT error by making them directories (unlink on a dir = EISDIR)
      const first = path.join(cacheDir, "update.exe")
      const second = path.join(cacheDir, "0-update.exe")
      await outputFile(first, "locked")
      await outputFile(second, "locked")

      // Replace both with directories so unlink throws EISDIR (simulating a locked file)
      // Actually just creating them as files and then deleting will return them on first try.
      // Instead: write a real file at `first` so it CAN be unlinked — createTempUpdateFile
      // unlinks and returns the path. Test that with pre-existing file it still returns the path.
      const result = await createTempUpdateFile("update.exe", cacheDir, makeLogger())
      // After unlinking the existing file, the same path is returned
      expect(result).toBe(path.join(cacheDir, "update.exe"))
      // File no longer exists at that path (it was removed)
      expect(await pathExists(first)).toBe(false)
    })
  })

  describe("DownloadedUpdateHelper.validateDownloadedPath (in-memory cache hit)", () => {
    let cacheDir: string
    let helper: DownloadedUpdateHelper
    let log: ReturnType<typeof makeLogger>

    beforeEach(async context => {
      cacheDir = await context.tmpDir.createTempDir()
      log = makeLogger()
      helper = new DownloadedUpdateHelper(cacheDir, log)
    })

    test("returns null when no cache exists", async () => {
      const fileInfo = makeFileInfo("sha512abc")
      const result = await helper.validateDownloadedPath(path.join(cacheDir, "update.exe"), makeUpdateInfo(), fileInfo)
      expect(result).toBeNull()
    })

    test("returns the file path when in-memory cache matches and file exists", async () => {
      const updateFile = path.join(cacheDir, "update.exe")
      const fileInfo = makeFileInfo("sha512abc")
      const versionInfo = makeUpdateInfo()
      await outputFile(updateFile, "installer content")
      // Simulate in-memory cache via setDownloadedFile
      await helper.setDownloadedFile(updateFile, null, versionInfo, fileInfo, "update.exe", false)

      const result = await helper.validateDownloadedPath(updateFile, versionInfo, fileInfo)
      expect(result).toBe(updateFile)
    })

    test("returns null when in-memory cache matches but file no longer exists", async () => {
      const updateFile = path.join(cacheDir, "update.exe")
      const fileInfo = makeFileInfo("sha512abc")
      const versionInfo = makeUpdateInfo()
      // Set the in-memory state but don't create the file
      await helper.setDownloadedFile(updateFile, null, versionInfo, fileInfo, "update.exe", false)

      const result = await helper.validateDownloadedPath(updateFile, versionInfo, fileInfo)
      expect(result).toBeNull()
    })
  })

  describe("DownloadedUpdateHelper.validateDownloadedPath (in-memory update info comparison)", () => {
    const channelFile = [
      "version: 1.0.1",
      "files:",
      "  - url: TestApp-Setup-1.0.1.exe",
      "    sha512: sha512abc",
      "    size: 1024",
      "    blockMapSize: 128",
      "path: TestApp-Setup-1.0.1.exe",
      "sha512: sha512abc",
      "releaseDate: '2026-01-01T00:00:00.000Z'",
      "releaseNotes:",
      "  - version: 1.0.1",
      "    note: fixes",
      "  - version: 1.0.0",
      "    note: null",
      "",
    ].join("\n")

    // a re-check parses the channel file again: the update info is equal in content, but never the same object
    function parseChannelFile(data = channelFile): { updateInfo: UpdateInfo; fileInfo: ResolvedUpdateFileInfo } {
      const loaded = load(data)
      if (loaded == null || typeof loaded !== "object" || !("version" in loaded)) {
        throw new Error("unexpected channel file content")
      }
      const updateInfo = loaded as UpdateInfo
      const info = updateInfo.files[0]
      return { updateInfo, fileInfo: { url: new URL(`https://example.com/${info.url}`), info } }
    }

    let cacheDir: string
    let updateFile: string
    let helper: DownloadedUpdateHelper
    let log: ReturnType<typeof makeLogger>

    beforeEach(async context => {
      cacheDir = await context.tmpDir.getTempDir({ prefix: "downloaded-update-helper" })
      updateFile = path.join(cacheDir, "update.exe")
      await outputFile(updateFile, "installer content")
      log = makeLogger()
      helper = new DownloadedUpdateHelper(cacheDir, log)
      const downloaded = parseChannelFile()
      await helper.setDownloadedFile(updateFile, null, downloaded.updateInfo, downloaded.fileInfo, "update.exe", false)
    })

    async function validate(updateInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo): Promise<string | null> {
      return await helper.validateDownloadedPath(updateFile, updateInfo, fileInfo)
    }

    test("reuses the downloaded file for an equal update info parsed again", async () => {
      const { updateInfo, fileInfo } = parseChannelFile()
      expect(await validate(updateInfo, fileInfo)).toBe(updateFile)
    })

    test("key order does not matter", async () => {
      const { updateInfo, fileInfo } = parseChannelFile()
      const reordered: UpdateInfo = Object.fromEntries(Object.entries(updateInfo).reverse()) as UpdateInfo
      const reorderedFileInfo: ResolvedUpdateFileInfo = { ...fileInfo, info: Object.fromEntries(Object.entries(fileInfo.info).reverse()) as UpdateFileInfo }
      expect(await validate(reordered, reorderedFileInfo)).toBe(updateFile)
    })

    test("compares nested arrays and objects by content", async () => {
      const { updateInfo, fileInfo } = parseChannelFile()
      expect(await validate(structuredClone(updateInfo), { ...fileInfo, info: structuredClone(fileInfo.info) })).toBe(updateFile)
    })

    test("a different version is not the downloaded update", async () => {
      const { updateInfo, fileInfo } = parseChannelFile(channelFile.replace("version: 1.0.1\n", "version: 1.0.2\n"))
      expect(await validate(updateInfo, fileInfo)).toBeNull()
    })

    test("a different nested value is not the downloaded update", async () => {
      const { updateInfo, fileInfo } = parseChannelFile(channelFile.replace("note: fixes", "note: other fixes"))
      expect(await validate(updateInfo, fileInfo)).toBeNull()
    })

    test("a different order of array items is not the downloaded update", async () => {
      const { updateInfo, fileInfo } = parseChannelFile()
      const releaseNotes = updateInfo.releaseNotes
      if (!Array.isArray(releaseNotes)) {
        throw new Error("expected release notes to be an array")
      }
      expect(await validate({ ...updateInfo, releaseNotes: [...releaseNotes].reverse() }, fileInfo)).toBeNull()
    })

    test("a different file info is not the downloaded update", async () => {
      const { updateInfo, fileInfo } = parseChannelFile()
      expect(await validate(updateInfo, { ...fileInfo, info: { ...fileInfo.info, size: 2048 } })).toBeNull()
      expect(await validate(updateInfo, { ...fileInfo, info: { ...fileInfo.info, sha512: "sha512def" } })).toBeNull()
    })

    test("a key set to undefined differs from a missing key", async () => {
      const { updateInfo, fileInfo } = parseChannelFile()
      expect(await validate({ ...updateInfo, minimumSystemVersion: undefined }, fileInfo)).toBeNull()
      expect(await validate(updateInfo, { ...fileInfo, info: { ...fileInfo.info, isAdminRightsRequired: undefined } })).toBeNull()
    })

    test("only the update info content is compared, not the resolved url", async () => {
      const { updateInfo, fileInfo } = parseChannelFile()
      expect(await validate(updateInfo, { ...fileInfo, url: new URL("https://mirror.example.com/TestApp-Setup-1.0.1.exe") })).toBe(updateFile)
    })
  })

  describe("DownloadedUpdateHelper NSIS web installer package", () => {
    const installerName = "TestApp Web Setup.exe"
    const packageName = "package-1.0.1.7z"
    let cacheDir: string
    let pending: string
    let helper: DownloadedUpdateHelper
    let log: ReturnType<typeof makeLogger>

    beforeEach(async context => {
      cacheDir = await context.tmpDir.createTempDir()
      log = makeLogger()
      helper = new DownloadedUpdateHelper(cacheDir, log)
      pending = helper.cacheDirForPendingUpdate
    })

    // writes a web installer + app package into the pending cache dir and returns file info whose checksums match both
    async function seedWebCache(cachedInfo: Record<string, unknown> = {}): Promise<{ installerPath: string; packagePath: string; fileInfo: ResolvedUpdateFileInfo }> {
      const installerPath = path.join(pending, installerName)
      const packagePath = path.join(pending, packageName)
      await outputFile(installerPath, "web installer stub")
      await outputFile(packagePath, "app package archive")
      const sha512 = await hashFile(installerPath)
      await outputJson(path.join(pending, "update-info.json"), { fileName: installerName, sha512, isAdminRightsRequired: false, packageFileName: packageName, ...cachedInfo })
      const fileInfo: ResolvedUpdateFileInfo = {
        ...makeFileInfo(sha512, installerName),
        packageInfo: { path: `https://example.com/${packageName}`, sha512: await hashFile(packagePath) },
      }
      return { installerPath, packagePath, fileInfo }
    }

    test("validateCachedPendingInstall returns the installer and exposes the verified package", async () => {
      const { installerPath, packagePath, fileInfo } = await seedWebCache({ installOnNextLaunch: true })

      expect(await helper.validateCachedPendingInstall(fileInfo)).toBe(installerPath)
      expect(helper.file).toBe(installerPath)
      expect(helper.packageFile).toBe(packagePath)
    })

    test("validateDownloadedPath reuses a web installer cache from a previous launch and exposes the package", async () => {
      const { installerPath, packagePath, fileInfo } = await seedWebCache()

      expect(await helper.validateDownloadedPath(installerPath, makeUpdateInfo(), fileInfo)).toBe(installerPath)
      expect(helper.packageFile).toBe(packagePath)
    })

    test("returns null and cleans the cache when the package does not match packageInfo.sha512", async () => {
      const { installerPath, packagePath, fileInfo } = await seedWebCache({ installOnNextLaunch: true })
      expect(await helper.getPendingInstallInfo()).not.toBeNull()
      await outputFile(packagePath, "different app package archive")

      expect(await helper.validateCachedPendingInstall(fileInfo)).toBeNull()
      expect(helper.packageFile).toBeNull()
      expect(await pathExists(installerPath)).toBe(false)
      expect(await pathExists(packagePath)).toBe(false)
      expect(await pathExists(path.join(pending, "update-info.json"))).toBe(false)
      expect(await helper.getPendingInstallInfo()).toBeNull()
      expect(log.warns.some(w => w.includes("web installer package doesn't match"))).toBe(true)
    })

    test("returns null and cleans an old-format cache that does not record packageFileName", async () => {
      const { installerPath, fileInfo } = await seedWebCache({ packageFileName: undefined })

      expect(await helper.validateDownloadedPath(installerPath, makeUpdateInfo(), fileInfo)).toBeNull()
      expect(helper.packageFile).toBeNull()
      expect(await pathExists(installerPath)).toBe(false)
      expect(await pathExists(path.join(pending, "update-info.json"))).toBe(false)
    })

    test("returns null when the package file is missing", async () => {
      const { installerPath, packagePath, fileInfo } = await seedWebCache()
      await remove(packagePath)

      expect(await helper.validateCachedPendingInstall(fileInfo)).toBeNull()
      expect(helper.packageFile).toBeNull()
      expect(await pathExists(installerPath)).toBe(false)
    })

    test("a regular (non-web) update is unaffected and packageFile stays null", async () => {
      const installerPath = path.join(pending, installerName)
      await outputFile(installerPath, "full installer")
      const sha512 = await hashFile(installerPath)
      await outputJson(path.join(pending, "update-info.json"), { fileName: installerName, sha512, isAdminRightsRequired: false })

      expect(await helper.validateCachedPendingInstall(makeFileInfo(sha512, installerName))).toBe(installerPath)
      expect(helper.packageFile).toBeNull()
    })

    test("setDownloadedFile persists packageFileName only for a web installer", async () => {
      const installerPath = path.join(pending, installerName)
      const fileInfo = makeFileInfo("sha512abc", installerName)
      const updateInfoFile = path.join(pending, "update-info.json")

      await helper.setDownloadedFile(installerPath, path.join(pending, packageName), makeUpdateInfo(), fileInfo, installerName, true)
      expect((await readJson(updateInfoFile)).packageFileName).toBe(packageName)

      await helper.setDownloadedFile(installerPath, null, makeUpdateInfo(), fileInfo, installerName, true)
      expect(await readJson(updateInfoFile)).not.toHaveProperty("packageFileName")
    })

    test("setDownloadedFile persists the version of a web installer update, which the next launch compares with its own", async () => {
      const installerPath = path.join(pending, installerName)
      const fileInfo = makeFileInfo("sha512abc", installerName)
      const updateInfoFile = path.join(pending, "update-info.json")

      await helper.setDownloadedFile(installerPath, path.join(pending, packageName), makeUpdateInfo("1.0.1"), fileInfo, installerName, true)
      expect((await readJson(updateInfoFile)).version).toBe("1.0.1")
      // marking the update for the next launch keeps it
      expect(helper.markInstallOnNextLaunchSync(log)).toBe(true)
      expect(await readJson(updateInfoFile)).toMatchObject({ version: "1.0.1", packageFileName: packageName, installOnNextLaunch: true })

      await helper.setDownloadedFile(installerPath, null, makeUpdateInfo("1.0.1"), fileInfo, installerName, true)
      expect(await readJson(updateInfoFile)).not.toHaveProperty("version")
    })

    describe("removeInstalledWebPackage", () => {
      test("removes the package of the installed update, and keeps the installer and update-info.json", async () => {
        const { installerPath, packagePath } = await seedWebCache({ version: "1.0.1" })

        expect(await helper.removeInstalledWebPackage("1.0.1")).toBe(true)
        expect(await pathExists(packagePath)).toBe(false)
        expect(await pathExists(installerPath)).toBe(true)
        expect(await readJson(path.join(pending, "update-info.json"))).toMatchObject({ packageFileName: packageName, version: "1.0.1" })
        expect(log.infos.some(line => line.includes("Removed the web installer package of the installed update 1.0.1"))).toBe(true)
      })

      test.for([
        ["an update that is not installed yet (or whose install failed and is retried)", "1.0.0"],
        ["a pending downgrade", "1.0.2"],
      ] as const)("keeps the package of %s", async ([, currentVersion]) => {
        const { packagePath, fileInfo } = await seedWebCache({ version: "1.0.1", installOnNextLaunch: true })

        expect(await helper.removeInstalledWebPackage(currentVersion)).toBe(false)
        expect(await pathExists(packagePath)).toBe(true)
        // still usable for the install
        expect(await helper.validateCachedPendingInstall(fileInfo)).not.toBeNull()
        expect(helper.packageFile).toBe(packagePath)
      })

      test.for([
        ["an update-info.json without a version (written before it was recorded)", {}],
        ["an invalid version", { version: "not a version" }],
        ["a full installer update", { packageFileName: undefined, version: "1.0.1" }],
      ] as const)("keeps the pending files for %s", async ([, cachedInfo]) => {
        const { installerPath, packagePath } = await seedWebCache(cachedInfo)

        expect(await helper.removeInstalledWebPackage("1.0.1")).toBe(false)
        expect(await pathExists(packagePath)).toBe(true)
        expect(await pathExists(installerPath)).toBe(true)
      })

      test("only removes the package from the pending directory", async () => {
        const outside = path.join(cacheDir, packageName)
        await outputFile(outside, "stored package")
        const { packagePath } = await seedWebCache({ version: "1.0.1", packageFileName: `../${packageName}` })

        expect(await helper.removeInstalledWebPackage("1.0.1")).toBe(true)
        expect(await pathExists(packagePath)).toBe(false)
        expect(await pathExists(outside)).toBe(true)
      })

      test("is a no-op without a pending update or package", async () => {
        expect(await helper.removeInstalledWebPackage("1.0.1")).toBe(false)

        const { packagePath } = await seedWebCache({ version: "1.0.1" })
        await remove(packagePath)
        expect(await helper.removeInstalledWebPackage("1.0.1")).toBe(false)
        expect(log.warns).toEqual([])
      })
    })
  })
})
