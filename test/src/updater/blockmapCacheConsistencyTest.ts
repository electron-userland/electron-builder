import { CancellationToken } from "builder-util-runtime"
import { AppImageUpdater } from "electron-updater"
import type { DownloadExecutorResult } from "electron-updater"
import { AppUpdater, isBlockMapOfFile } from "electron-updater/src/AppUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import type { DownloadExecutorTask } from "electron-updater/src/AppUpdater"
import { GenericDifferentialDownloader } from "electron-updater/src/differentialDownloader/GenericDifferentialDownloader"
import { copyFile, outputFile, pathExists, readFile } from "fs-extra"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { gzipSync } from "zlib"

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
describe("executeDownload blockmap cache consistency", { concurrent: false }, () => {
  const OLD_BINARY_FILE_NAME = "update.zip"
  let cacheDir: string
  let pendingDir: string
  let updater: AppImageUpdater
  let helper: DownloadedUpdateHelper

  const cachedBlockMapFile = () => path.join(cacheDir, "current.blockmap")
  const pendingBlockMapFile = () => path.join(pendingDir, "current.blockmap")
  const cachedBinaryFile = () => path.join(cacheDir, OLD_BINARY_FILE_NAME)

  beforeEach(async context => {
    cacheDir = await context.tmpDir.createTempDir({ prefix: "blockmap-cache" })
    updater = new AppImageUpdater(null, stubApp)
    updater.logger = null
    helper = new DownloadedUpdateHelper(cacheDir)
    pendingDir = helper.cacheDirForPendingUpdate
    // inject the helper directly so getOrCreateDownloadHelper does not need app-update.yml
    ;(updater as any).downloadedUpdateHelper = helper
  })

  function executeDownload(options: { disableDifferentialDownload?: boolean; writePendingBlockMap?: string; onDone?: () => Promise<void> } = {}): Promise<DownloadExecutorResult> {
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
          provider: { feedBaseUrl: null } as any,
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
        await options.onDone?.()
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

  test("blockmap is cached before update-downloaded is announced", async () => {
    // `done` emits update-downloaded; an app that calls quitAndInstall() from that listener exits before anything after it runs
    let cachedAtDone: string | null = null
    await executeDownload({
      writePendingBlockMap: "blockmap of 2.0.0",
      onDone: async () => {
        cachedAtDone = (await pathExists(cachedBlockMapFile())) ? (await readFile(cachedBlockMapFile())).toString() : null
      },
    })

    expect(cachedAtDone).toBe("blockmap of 2.0.0")
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

// NSIS replaces the cached installer.exe only when an update is installed, while executeDownload promotes the new blockmap as
// soon as a download finishes. When release N+1 is found before N is installed, the cache holds N's blockmap next to N-1's
// installer, and a differential download planned on that pair fetches every byte and then fails the sha512 check.
describe("differentialDownloadInstaller cached blockmap / installer pairing", { concurrent: false }, () => {
  const OLD_INSTALLER_FILE_NAME = "installer.exe"
  const OLD_BLOCKMAP_URL = "https://example.com/TestApp-Setup-1.0.0.exe.blockmap"
  const NEW_BLOCKMAP_URL = "https://example.com/TestApp-Setup-2.0.0.exe.blockmap"
  let cacheDir: string
  let updater: AppImageUpdater
  let requestedUrls: Array<string>
  let plannedOldBlockMap: any
  let infoMessages: Array<string>

  const blockMap = (sizes: Array<number>, tag: string) => ({ version: "2" as const, files: [{ name: "file", offset: 0, checksums: sizes.map((_, i) => `${tag}-${i}`), sizes }] })
  const serverOldBlockMap = blockMap([600, 400], "server-1.0.0")
  const serverNewBlockMap = blockMap([700, 400], "server-2.0.0")
  // what the server answers for the old blockmap URL (a test may serve another release's map there)
  let servedOldBlockMap: ReturnType<typeof blockMap>

  beforeEach(async context => {
    cacheDir = await context.tmpDir.createTempDir({ prefix: "blockmap-pairing" })
    updater = new AppImageUpdater(null, stubApp)
    infoMessages = []
    updater.logger = { info: (message: string) => infoMessages.push(message), warn: () => {}, error: () => {} }
    ;(updater as any).downloadedUpdateHelper = new DownloadedUpdateHelper(cacheDir)
    requestedUrls = []
    plannedOldBlockMap = null
    servedOldBlockMap = serverOldBlockMap
    ;(updater as any).httpExecutor = {
      downloadToBuffer: (url: URL) => {
        requestedUrls.push(url.href)
        const data = url.href === OLD_BLOCKMAP_URL ? servedOldBlockMap : serverNewBlockMap
        return Promise.resolve(gzipSync(JSON.stringify(data)))
      },
    }
    vi.spyOn(GenericDifferentialDownloader.prototype, "download").mockImplementation((oldBlockMap: any) => {
      plannedOldBlockMap = oldBlockMap
      return Promise.resolve()
    })
    // the running release's installer, 1000 bytes
    await outputFile(path.join(cacheDir, OLD_INSTALLER_FILE_NAME), Buffer.alloc(1000))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const ignoredMessage = `Cached blockmap does not describe the cached "${OLD_INSTALLER_FILE_NAME}" (malformed, or its blocks do not end at the file size): ignoring it`

  function differentialDownloadInstaller(options: { blockMapUrlInManifest?: boolean; oldBlockMapUrl?: string } = {}): Promise<boolean> {
    const provider = {
      getBlockMapFiles: () => Promise.resolve([new URL(options.oldBlockMapUrl ?? OLD_BLOCKMAP_URL), new URL(NEW_BLOCKMAP_URL)]),
      isUseMultipleRangeRequest: true,
    } as any
    const fileInfo = {
      url: new URL("https://example.com/TestApp-Setup-2.0.0.exe"),
      info: { url: "TestApp-Setup-2.0.0.exe", sha512: "sha512-of-2.0.0", size: 1100 },
      // the manifest names the new blockmap, so without previousBlockmapBaseUrlOverride the old one cannot be derived
      ...(options.blockMapUrlInManifest === true ? { blockMapUrl: new URL(NEW_BLOCKMAP_URL) } : {}),
    }
    const downloadUpdateOptions = {
      updateInfoAndProvider: { info: { version: "2.0.0", files: [], path: "", sha512: "", releaseDate: "" }, provider },
      requestHeaders: {},
      cancellationToken: new CancellationToken(),
    }
    return (AppUpdater.prototype as any).differentialDownloadInstaller.call(
      updater,
      fileInfo,
      downloadUpdateOptions,
      path.join(cacheDir, "new.exe"),
      provider,
      OLD_INSTALLER_FILE_NAME
    )
  }

  test("a cached blockmap of another release is replaced by the installed release's blockmap from the server", async () => {
    // N's blockmap (1200 bytes) was promoted, but installer.exe is still N-1 (1000 bytes)
    await outputFile(path.join(cacheDir, "current.blockmap"), gzipSync(JSON.stringify(blockMap([800, 400], "cached-1.5.0"))))

    expect(await differentialDownloadInstaller()).toBe(false)

    expect(requestedUrls).toContain(OLD_BLOCKMAP_URL)
    expect(plannedOldBlockMap).toEqual(serverOldBlockMap)
    expect(infoMessages).toContain(ignoredMessage)
  })

  test("a malformed cached blockmap is ignored and the installed release's blockmap is fetched from the server", async () => {
    // well-formed JSON, wrong shape: reading `files` used to throw a TypeError, which ended in a full download
    await outputFile(path.join(cacheDir, "current.blockmap"), gzipSync(JSON.stringify({ version: "2" })))

    expect(await differentialDownloadInstaller()).toBe(false)

    expect(requestedUrls).toContain(OLD_BLOCKMAP_URL)
    expect(plannedOldBlockMap).toEqual(serverOldBlockMap)
    expect(infoMessages).toContain(ignoredMessage)
  })

  test("with blockMapUrl in the manifest and no override, a cached blockmap of another release leads to a full download", async () => {
    await outputFile(path.join(cacheDir, "current.blockmap"), gzipSync(JSON.stringify(blockMap([800, 400], "cached-1.5.0"))))

    // true: the caller downloads the full update
    expect(await differentialDownloadInstaller({ blockMapUrlInManifest: true })).toBe(true)

    expect(requestedUrls).not.toContain(OLD_BLOCKMAP_URL)
    expect(plannedOldBlockMap).toBeNull()
    expect(infoMessages).toContain(ignoredMessage)
  })

  test("without a cached blockmap, an old blockmap URL equal to the new one (artifact name without version) leads to a full download without requesting it", async () => {
    // "TestApp Setup.exe": replacing the version in the new URL changes nothing
    expect(await differentialDownloadInstaller({ oldBlockMapUrl: NEW_BLOCKMAP_URL })).toBe(true)

    expect(requestedUrls).toEqual([NEW_BLOCKMAP_URL])
    expect(plannedOldBlockMap).toBeNull()
    expect(infoMessages.some(it => it.includes("because the artifact name has no version: downloading the full update"))).toBe(true)
    // the new blockmap is cached with the update, so the next update can be differential
    expect(await pathExists(path.join(cacheDir, "pending", "current.blockmap"))).toBe(true)
  })

  test("without a cached blockmap, a downloaded old blockmap that does not describe the cached installer leads to a full download", async () => {
    // the server answers the derived old URL with another release's map (1100 bytes, the installed installer is 1000)
    servedOldBlockMap = serverNewBlockMap

    expect(await differentialDownloadInstaller()).toBe(true)

    expect(requestedUrls).toContain(OLD_BLOCKMAP_URL)
    expect(plannedOldBlockMap).toBeNull()
    expect(infoMessages).toContain(
      `The blockmap downloaded from "${OLD_BLOCKMAP_URL}" does not describe the cached "${OLD_INSTALLER_FILE_NAME}" (malformed, or its blocks do not end at the file size): downloading the full update`
    )
  })

  test("a cached blockmap that matches the cached installer is used without downloading the old blockmap", async () => {
    const cached = blockMap([500, 500], "cached-1.0.0")
    await outputFile(path.join(cacheDir, "current.blockmap"), gzipSync(JSON.stringify(cached)))

    expect(await differentialDownloadInstaller()).toBe(false)

    expect(requestedUrls).not.toContain(OLD_BLOCKMAP_URL)
    expect(plannedOldBlockMap).toEqual(cached)
    expect(infoMessages).not.toContain(ignoredMessage)
  })
})

describe("isBlockMapOfFile", () => {
  test("compares where the blocks end with the file size", async context => {
    const file = path.join(await context.tmpDir.createTempDir({ prefix: "blockmap-of-file" }), "installer.exe")
    await outputFile(file, Buffer.alloc(1000))
    const map = (sizes: Array<number>, offset = 0) => ({ version: "2" as const, files: [{ name: "file", offset, checksums: sizes.map(String), sizes }] })

    expect(await isBlockMapOfFile(map([600, 400]), file)).toBe(true)
    expect(await isBlockMapOfFile(map([600, 401]), file)).toBe(false)
    expect(await isBlockMapOfFile(map([600, 300]), file)).toBe(false)
    expect(await isBlockMapOfFile(map([500], 500), file)).toBe(true)
  })

  test("rejects a malformed blockmap, even when the file is missing", async context => {
    const file = path.join(await context.tmpDir.createTempDir({ prefix: "blockmap-of-file" }), "installer.exe")
    await outputFile(file, Buffer.alloc(1000))
    const missing = path.join(path.dirname(file), "missing.exe")
    const malformed: Array<unknown> = [
      null,
      "blockmap",
      {},
      { files: "file" },
      { files: [null] },
      { files: [{ offset: "0", checksums: ["a"], sizes: [1000] }] },
      { files: [{ offset: 0, checksums: ["a"], sizes: ["1000"] }] },
      { files: [{ offset: 0, checksums: ["a"], sizes: [-1, 1001] }] },
      { files: [{ offset: 0, checksums: ["a", "b"], sizes: [1000] }] },
      { files: [{ offset: 0, sizes: [1000] }] },
    ]
    for (const blockMap of malformed) {
      expect(await isBlockMapOfFile(blockMap, file), JSON.stringify(blockMap)).toBe(false)
      expect(await isBlockMapOfFile(blockMap, missing), JSON.stringify(blockMap)).toBe(false)
    }
  })

  test("does not reject when the file is missing", async context => {
    const missing = path.join(await context.tmpDir.createTempDir({ prefix: "blockmap-of-file" }), "missing.exe")
    expect(await isBlockMapOfFile({ version: "2", files: [{ name: "file", offset: 0, checksums: ["a"], sizes: [1] }] }, missing)).toBe(true)
  })
})
