import { CancellationToken } from "builder-util-runtime"
import { MacUpdater } from "electron-updater/internal"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import type { DownloadExecutorTask, DownloadUpdateOptions } from "electron-updater/src/AppUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { EventEmitter } from "events"
import { outputFile } from "fs-extra"
import * as path from "path"
import { describe, expect, test, vi } from "vitest"
import { mockForNodeRequire } from "vitest-mock-commonjs"
import type { ResolvedUpdateFileInfo } from "electron-updater/src/types"
import { makeLogger } from "../helpers/updaterTestUtil.js"

// MacUpdater is in skipPerOSTests.darwin (requires live Electron), but
// filterFilesForArch is a protected static with no Electron dependency — it
// can be called directly via (MacUpdater as any).filterFilesForArch without
// constructing an instance.

function filterFilesForArch(files: ResolvedUpdateFileInfo[], isArm64Mac: boolean): ResolvedUpdateFileInfo[] {
  return (MacUpdater as any).filterFilesForArch(files, isArm64Mac)
}

function makeFile(filename: string): ResolvedUpdateFileInfo {
  return {
    url: new URL(`https://example.com/${filename}`),
    info: { url: filename, sha512: "abc", size: 1024 },
  }
}

describe("MacUpdater.filterFilesForArch", () => {
  test("arm64 Mac with arm64 files: only arm64 files returned", () => {
    const files = [makeFile("app-x64.zip"), makeFile("app-arm64.zip")]
    const result = filterFilesForArch(files, true)
    expect(result).toHaveLength(1)
    expect(result[0].info.url).toBe("app-arm64.zip")
  })

  test("x64 Mac: arm64 files are filtered out", () => {
    const files = [makeFile("app-x64.zip"), makeFile("app-arm64.zip")]
    const result = filterFilesForArch(files, false)
    expect(result).toHaveLength(1)
    expect(result[0].info.url).toBe("app-x64.zip")
  })

  test("arm64 Mac with no arm64 files: all files returned unchanged", () => {
    // isArm64Mac=true but files.some(isArm64File) is false → else branch → filter arm64 out (none present)
    const files = [makeFile("app-x64.zip"), makeFile("app-universal.zip")]
    const result = filterFilesForArch(files, true)
    expect(result).toHaveLength(2)
    expect(result.map(f => f.info.url)).toEqual(["app-x64.zip", "app-universal.zip"])
  })

  test("x64 Mac with only non-arm64 files: all returned", () => {
    const files = [makeFile("app-x64.zip"), makeFile("app-universal.zip")]
    expect(filterFilesForArch(files, false)).toHaveLength(2)
  })

  test("arm64 detected via info.url field (not URL pathname)", () => {
    const file: ResolvedUpdateFileInfo = {
      url: new URL("https://example.com/download"),
      info: { url: "release-arm64.zip", sha512: "abc", size: 100 },
    }
    expect(filterFilesForArch([file], false)).toHaveLength(0) // x64 → arm64 excluded
    expect(filterFilesForArch([file], true)).toHaveLength(1) // arm64 → arm64 kept
  })

  test("arm64 detected via URL pathname (not info.url)", () => {
    const file: ResolvedUpdateFileInfo = {
      url: new URL("https://example.com/releases/v1/app-arm64.zip"),
      info: { url: "app.zip", sha512: "abc", size: 100 },
    }
    expect(filterFilesForArch([file], false)).toHaveLength(0)
    expect(filterFilesForArch([file], true)).toHaveLength(1)
  })
})

describe("MacUpdater differential download logging", () => {
  const stubApp: AppAdapter = {
    name: "TestApp",
    version: "1.0.0",
    isPackaged: false,
    appUpdateConfigPath: "/tmp/app-update.yml",
    userDataPath: "/tmp",
    baseCachePath: "/tmp",
    whenReady: () => Promise.resolve(),
    relaunch: () => {},
    quit: () => {},
    onQuit: () => {},
  }

  interface Scenario {
    cacheDir: string
    hasCachedZip: boolean
    disableDifferentialDownload: boolean
    // resolved value of differentialDownloadInstaller: true means the differential download failed
    differentialDownloadFailed?: boolean
  }

  // Runs only the download task of doDownloadUpdate: executeDownload is stubbed to invoke the task directly, the native
  // Squirrel.Mac autoUpdater is replaced by an EventEmitter, and the differential/full downloads are stubbed out.
  async function runDownloadTask({ cacheDir, hasCachedZip, disableDifferentialDownload, differentialDownloadFailed = false }: Scenario) {
    mockForNodeRequire("electron", { autoUpdater: new EventEmitter() })
    const updater = new MacUpdater(undefined, stubApp)
    const logger = makeLogger()
    updater.logger = logger
    // @ts-expect-error accessing a protected property
    updater.downloadedUpdateHelper = new DownloadedUpdateHelper(cacheDir, makeLogger())
    if (hasCachedZip) {
      await outputFile(path.join(cacheDir, "update.zip"), "previous update bytes")
    }

    const differentialDownloadInstaller = vi.spyOn(updater, "differentialDownloadInstaller").mockResolvedValue(differentialDownloadFailed)
    // with an explicit AppAdapter, AppUpdater leaves httpExecutor unset, so supply one that stubs the full download
    const fullDownload = vi.fn().mockResolvedValue("")
    Object.defineProperty(updater, "httpExecutor", { value: { download: fullDownload } })
    // @ts-expect-error spying on a protected method
    vi.spyOn(updater, "executeDownload").mockImplementation(async (taskOptions: DownloadExecutorTask) => {
      await taskOptions.task(path.join(cacheDir, "pending.zip"), { headers: {}, cancellationToken: new CancellationToken() }, null, () => Promise.resolve())
      return []
    })

    const zipFile = makeFile("TestApp-2.0.0-mac.zip")
    const downloadUpdateOptions: DownloadUpdateOptions = {
      updateInfoAndProvider: {
        info: { version: "2.0.0", files: [], path: "", sha512: "", releaseDate: "" },
        // @ts-expect-error doDownloadUpdate only needs resolveFiles from the provider (the downloads themselves are stubbed)
        provider: { resolveFiles: () => [zipFile] },
      },
      requestHeaders: {},
      cancellationToken: new CancellationToken(),
      disableDifferentialDownload,
    }
    // @ts-expect-error calling a protected method
    await updater.doDownloadUpdate(downloadUpdateOptions)

    const resultLogs = logger.infos.filter(it => it.startsWith("Differential download "))
    return { resultLogs, differentialDownloadInstaller, fullDownload }
  }

  test("no cached update.zip: no differential download result is logged", async ({ tmpDir }) => {
    const cacheDir = await tmpDir.getTempDir({ prefix: "mac-updater-no-cache" })
    const { resultLogs, differentialDownloadInstaller, fullDownload } = await runDownloadTask({ cacheDir, hasCachedZip: false, disableDifferentialDownload: false })
    expect(differentialDownloadInstaller).not.toHaveBeenCalled()
    expect(resultLogs).toEqual([])
    expect(fullDownload).toHaveBeenCalledTimes(1)
  })

  test("disableDifferentialDownload: no differential download result is logged", async ({ tmpDir }) => {
    const cacheDir = await tmpDir.getTempDir({ prefix: "mac-updater-disabled" })
    const { resultLogs, differentialDownloadInstaller, fullDownload } = await runDownloadTask({ cacheDir, hasCachedZip: true, disableDifferentialDownload: true })
    expect(differentialDownloadInstaller).not.toHaveBeenCalled()
    expect(resultLogs).toEqual([])
    expect(fullDownload).toHaveBeenCalledTimes(1)
  })

  test("differential download attempted and failed: logs failed and falls back to a full download", async ({ tmpDir }) => {
    const cacheDir = await tmpDir.getTempDir({ prefix: "mac-updater-diff-failed" })
    const { resultLogs, differentialDownloadInstaller, fullDownload } = await runDownloadTask({
      cacheDir,
      hasCachedZip: true,
      disableDifferentialDownload: false,
      differentialDownloadFailed: true,
    })
    expect(differentialDownloadInstaller).toHaveBeenCalledTimes(1)
    expect(resultLogs).toEqual(["Differential download failed"])
    expect(fullDownload).toHaveBeenCalledTimes(1)
  })

  test("differential download attempted and succeeded: logs succeeded and skips the full download", async ({ tmpDir }) => {
    const cacheDir = await tmpDir.getTempDir({ prefix: "mac-updater-diff-succeeded" })
    const { resultLogs, differentialDownloadInstaller, fullDownload } = await runDownloadTask({
      cacheDir,
      hasCachedZip: true,
      disableDifferentialDownload: false,
      differentialDownloadFailed: false,
    })
    expect(differentialDownloadInstaller).toHaveBeenCalledTimes(1)
    expect(resultLogs).toEqual(["Differential download succeeded"])
    expect(fullDownload).not.toHaveBeenCalled()
  })
})
