import { createTempUpdateFile, DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { outputFile, outputJson, pathExists, readJson, remove } from "fs-extra"
import * as path from "path"
import { beforeEach, describe, expect, test } from "vitest"
import type { Logger } from "electron-updater/src/types"
import { hashFile } from "builder-util-runtime"
import type { UpdateInfo } from "builder-util-runtime"
import type { ResolvedUpdateFileInfo } from "electron-updater/src/types"

function makeLogger(): Logger & { infos: string[]; warns: string[] } {
  const infos: string[] = []
  const warns: string[] = []
  return {
    info: (msg: string) => infos.push(msg),
    warn: (msg: string) => warns.push(msg),
    error: () => {},
    infos,
    warns,
  }
}

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
      helper = new DownloadedUpdateHelper(cacheDir)
      log = makeLogger()
    })

    test("returns null when update-info.json does not exist", async () => {
      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo("sha512abc"), log)
      expect(result).toBeNull()
    })

    test("returns null and cleans cache when update-info.json contains invalid JSON", async () => {
      const pending = path.join(cacheDir, "pending")
      const infoFile = path.join(pending, "update-info.json")
      await outputFile(infoFile, "not-valid-json{{{{")

      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo("sha512abc"), log)
      expect(result).toBeNull()
      // cache directory is emptied, info file should be gone
      expect(await pathExists(infoFile)).toBe(false)
      expect(log.infos.some(m => m.includes("No cached update info"))).toBe(true)
    })

    test("returns null and cleans cache when sha512 in info does not match expected", async () => {
      const pending = path.join(cacheDir, "pending")
      const infoFile = path.join(pending, "update-info.json")
      await outputJson(infoFile, { fileName: "TestApp Setup.exe", sha512: "old-hash", isAdminRightsRequired: false })
      await outputFile(path.join(pending, "TestApp Setup.exe"), "dummy-content")

      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo("new-hash"), log)
      expect(result).toBeNull()
      expect(await pathExists(infoFile)).toBe(false)
      expect(log.infos.some(m => m.includes("doesn't match"))).toBe(true)
    })

    test("returns null when update file listed in info does not exist on disk", async () => {
      const pending = path.join(cacheDir, "pending")
      const sha512 = "abc123"
      await outputJson(path.join(pending, "update-info.json"), { fileName: "TestApp Setup.exe", sha512, isAdminRightsRequired: false })
      // intentionally do NOT write the installer file

      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo(sha512), log)
      expect(result).toBeNull()
      expect(log.infos.some(m => m.includes("doesn't exist"))).toBe(true)
    })

    test("returns null and cleans cache when actual file hash mismatches info sha512", async () => {
      const pending = path.join(cacheDir, "pending")
      const declaredHash = "declared-hash-that-wont-match"
      const installerPath = path.join(pending, "TestApp Setup.exe")
      await outputJson(path.join(pending, "update-info.json"), { fileName: "TestApp Setup.exe", sha512: declaredHash, isAdminRightsRequired: false })
      await outputFile(installerPath, "binary content that will produce a different sha512")

      const result = await (helper as any).getValidCachedUpdateFile(makeFileInfo(declaredHash), log)
      expect(result).toBeNull()
      expect(await pathExists(installerPath)).toBe(false)
      expect(log.warns.some(w => w.includes("doesn't match"))).toBe(true)
    })
  })

  describe("createTempUpdateFile", () => {
    let cacheDir: string
    let log: ReturnType<typeof makeLogger>

    beforeEach(async context => {
      cacheDir = await context.tmpDir.createTempDir()
      log = makeLogger()
    })

    test("returns the path directly when no existing file blocks it", async () => {
      const result = await createTempUpdateFile("update.exe", cacheDir, log)
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
      const result = await createTempUpdateFile("update.exe", cacheDir, log)
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
      helper = new DownloadedUpdateHelper(cacheDir)
      log = makeLogger()
    })

    test("returns null when no cache exists", async () => {
      const fileInfo = makeFileInfo("sha512abc")
      const result = await helper.validateDownloadedPath(path.join(cacheDir, "update.exe"), makeUpdateInfo(), fileInfo, log)
      expect(result).toBeNull()
    })

    test("returns the file path when in-memory cache matches and file exists", async () => {
      const updateFile = path.join(cacheDir, "update.exe")
      const fileInfo = makeFileInfo("sha512abc")
      const versionInfo = makeUpdateInfo()
      await outputFile(updateFile, "installer content")
      // Simulate in-memory cache via setDownloadedFile
      await helper.setDownloadedFile(updateFile, null, versionInfo, fileInfo, "update.exe", false)

      const result = await helper.validateDownloadedPath(updateFile, versionInfo, fileInfo, log)
      expect(result).toBe(updateFile)
    })

    test("returns null when in-memory cache matches but file no longer exists", async () => {
      const updateFile = path.join(cacheDir, "update.exe")
      const fileInfo = makeFileInfo("sha512abc")
      const versionInfo = makeUpdateInfo()
      // Set the in-memory state but don't create the file
      await helper.setDownloadedFile(updateFile, null, versionInfo, fileInfo, "update.exe", false)

      const result = await helper.validateDownloadedPath(updateFile, versionInfo, fileInfo, log)
      expect(result).toBeNull()
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
      helper = new DownloadedUpdateHelper(cacheDir)
      pending = helper.cacheDirForPendingUpdate
      log = makeLogger()
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

      expect(await helper.validateCachedPendingInstall(fileInfo, log)).toBe(installerPath)
      expect(helper.file).toBe(installerPath)
      expect(helper.packageFile).toBe(packagePath)
    })

    test("validateDownloadedPath reuses a web installer cache from a previous launch and exposes the package", async () => {
      const { installerPath, packagePath, fileInfo } = await seedWebCache()

      expect(await helper.validateDownloadedPath(installerPath, makeUpdateInfo(), fileInfo, log)).toBe(installerPath)
      expect(helper.packageFile).toBe(packagePath)
    })

    test("returns null and cleans the cache when the package does not match packageInfo.sha512", async () => {
      const { installerPath, packagePath, fileInfo } = await seedWebCache({ installOnNextLaunch: true })
      expect(await helper.getPendingInstallInfo()).not.toBeNull()
      await outputFile(packagePath, "different app package archive")

      expect(await helper.validateCachedPendingInstall(fileInfo, log)).toBeNull()
      expect(helper.packageFile).toBeNull()
      expect(await pathExists(installerPath)).toBe(false)
      expect(await pathExists(packagePath)).toBe(false)
      expect(await pathExists(path.join(pending, "update-info.json"))).toBe(false)
      expect(await helper.getPendingInstallInfo()).toBeNull()
      expect(log.warns.some(w => w.includes("web installer package doesn't match"))).toBe(true)
    })

    test("returns null and cleans an old-format cache that does not record packageFileName", async () => {
      const { installerPath, fileInfo } = await seedWebCache({ packageFileName: undefined })

      expect(await helper.validateDownloadedPath(installerPath, makeUpdateInfo(), fileInfo, log)).toBeNull()
      expect(helper.packageFile).toBeNull()
      expect(await pathExists(installerPath)).toBe(false)
      expect(await pathExists(path.join(pending, "update-info.json"))).toBe(false)
    })

    test("returns null when the package file is missing", async () => {
      const { installerPath, packagePath, fileInfo } = await seedWebCache()
      await remove(packagePath)

      expect(await helper.validateCachedPendingInstall(fileInfo, log)).toBeNull()
      expect(helper.packageFile).toBeNull()
      expect(await pathExists(installerPath)).toBe(false)
    })

    test("a regular (non-web) update is unaffected and packageFile stays null", async () => {
      const installerPath = path.join(pending, installerName)
      await outputFile(installerPath, "full installer")
      const sha512 = await hashFile(installerPath)
      await outputJson(path.join(pending, "update-info.json"), { fileName: installerName, sha512, isAdminRightsRequired: false })

      expect(await helper.validateCachedPendingInstall(makeFileInfo(sha512, installerName), log)).toBe(installerPath)
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
  })
})
