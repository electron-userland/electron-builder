import { CancellationToken } from "builder-util-runtime"
import { AppImageUpdater } from "electron-updater"
import { AppUpdater } from "electron-updater/src/AppUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import type { DownloadExecutorResult, DownloadExecutorTask } from "electron-updater/src/AppUpdater"
import { TmpDir } from "builder-util/out/util"
import { copyFile, outputFile, pathExists, readFile } from "fs-extra"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

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

// executeDownload keeps two "old side" files at the updater cache root for the next differential
// download: the old binary (e.g. update.zip, copied there by the platform updater's `done`) and
// current.blockmap describing it. These tests cover the cache-consistency contract from
// https://github.com/electron-userland/electron-builder/issues/10097: the cached blockmap must never
// survive a download round that refreshed the cached binary without producing a new blockmap.
describe("executeDownload blockmap cache consistency", { sequential: true }, () => {
  const OLD_BINARY_FILE_NAME = "update.zip"
  let cacheDir: string
  let pendingDir: string
  let updater: AppImageUpdater
  let helper: DownloadedUpdateHelper

  const cachedBlockMapFile = () => path.join(cacheDir, "current.blockmap")
  const pendingBlockMapFile = () => path.join(pendingDir, "current.blockmap")
  const cachedBinaryFile = () => path.join(cacheDir, OLD_BINARY_FILE_NAME)

  const tmpDir = new TmpDir("blockmap-cache-consistency")

  afterEach(() => tmpDir.cleanup())

  beforeEach(async () => {
    cacheDir = await tmpDir.getTempDir({ prefix: "cache" })
    updater = new AppImageUpdater(null, stubApp)
    updater.logger = null
    helper = new DownloadedUpdateHelper(cacheDir)
    pendingDir = helper.cacheDirForPendingUpdate
    // inject the helper directly so getOrCreateDownloadHelper does not need app-update.yml
    ;(updater as any).downloadedUpdateHelper = helper
  })

  function executeDownload(options: { disableDifferentialDownload?: boolean; writePendingBlockMap?: string } = {}): Promise<DownloadExecutorResult> {
    const disableDifferentialDownload = options.disableDifferentialDownload === true
    const taskOptions: DownloadExecutorTask = {
      fileExtension: "zip",
      fileInfo: {
        url: new URL("https://example.com/TestApp-2.0.0.zip"),
        info: { url: "TestApp-2.0.0.zip", sha512: "sha512-of-2.0.0", size: 1024 },
      },
      downloadUpdateOptions: {
        updateInfoAndProvider: {
          info: { version: "2.0.0", files: [], path: "", sha512: "", releaseDate: "" },
          provider: null as any,
        },
        requestHeaders: {},
        cancellationToken: new CancellationToken(),
        disableDifferentialDownload,
      },
      task: async destinationFile => {
        // simulates the platform updater's task: a differential download writes pending/current.blockmap
        // (in differentialDownloadInstaller), a full download does not
        if (options.writePendingBlockMap != null) {
          await outputFile(pendingBlockMapFile(), options.writePendingBlockMap)
        }
        await outputFile(destinationFile, "new installer bytes for 2.0.0")
      },
      done: async event => {
        // mimics MacUpdater's done: refresh the cached old binary unless differential download is disabled
        if (!disableDifferentialDownload) {
          await copyFile(event.downloadedFile, cachedBinaryFile())
        }
      },
    }
    // call AppUpdater's implementation directly — BaseUpdater.executeDownload would replace `done`
    return (AppUpdater.prototype as any).executeDownload.call(updater, taskOptions)
  }

  test("stale cached blockmap is removed when a full download produced no new blockmap", async () => {
    // the split from #10097: the cached binary was evicted, the small blockmap survived
    await outputFile(cachedBlockMapFile(), "stale blockmap describing an old release")

    await executeDownload()

    expect(await pathExists(cachedBinaryFile())).toBe(true)
    expect(await pathExists(cachedBlockMapFile())).toBe(false)
  })

  test("blockmap left over in the pending dir from a previous round is not promoted next to a fresh binary", async () => {
    await outputFile(pendingBlockMapFile(), "leftover blockmap of a previous update round")
    await outputFile(cachedBlockMapFile(), "stale blockmap describing an old release")

    await executeDownload()

    expect(await pathExists(pendingBlockMapFile())).toBe(false)
    expect(await pathExists(cachedBlockMapFile())).toBe(false)
  })

  test("blockmap produced by this download round replaces the cached one", async () => {
    await outputFile(cachedBlockMapFile(), "stale blockmap describing an old release")

    await executeDownload({ writePendingBlockMap: "blockmap of 2.0.0" })

    expect((await readFile(cachedBlockMapFile())).toString()).toBe("blockmap of 2.0.0")
  })

  test("cached blockmap is kept when differential download is disabled", async () => {
    // with differential download disabled the platform updaters do not refresh the cached binary either,
    // so the pair stays consistent and must not be touched
    await outputFile(cachedBinaryFile(), "old installer bytes for 1.0.0")
    await outputFile(cachedBlockMapFile(), "blockmap of 1.0.0")

    await executeDownload({ disableDifferentialDownload: true })

    expect((await readFile(cachedBinaryFile())).toString()).toBe("old installer bytes for 1.0.0")
    expect((await readFile(cachedBlockMapFile())).toString()).toBe("blockmap of 1.0.0")
  })
})
