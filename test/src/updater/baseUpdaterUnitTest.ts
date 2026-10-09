import * as path from "path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { CancellationError, CancellationToken } from "builder-util-runtime"
import { AppImageUpdater, DebUpdater, type VerifyUpdateFile } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import type { InstallOptions } from "electron-updater/src/BaseUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import type { DownloadExecutorTask } from "electron-updater/src/AppUpdater"
import { outputFile, pathExists, stat } from "fs-extra"
import { createVerifyUpdateFileMock, expectVerifyUpdateFileFailure } from "../helpers/updaterTestUtil.js"

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

const installOpts: InstallOptions = { isSilent: false, isForceRunAfter: false, isAdminRightsRequired: false }

it("handles a failed checkForUpdatesAndNotify background download", async () => {
  const updater = new DebUpdater(null, stubApp)
  const result = {
    updateInfo: { version: "2.0.0" },
    downloadPromise: Promise.reject(new Error("download failed")),
  } as any
  vi.spyOn(updater, "checkForUpdates").mockResolvedValue(result)

  await expect(updater.checkForUpdatesAndNotify()).resolves.toBe(result)
  await new Promise(resolve => setImmediate(resolve))
})

it("preserves fractional staged rollout percentages", async () => {
  const updater = new DebUpdater(null, stubApp)
  Object.defineProperty(updater, "stagingUserIdPromise", {
    value: { value: Promise.resolve("1aa70172-80f8-5cc4-8131-28f500800000") },
  })

  await expect((updater as any).isStagingMatch({ stagingPercentage: 0.5 })).resolves.toBe(true)
})

// ─── BaseUpdater.sanitizeEnvPath — PATH sanitization ─────────────────────────
// Tests the extracted helper directly (vi.spyOn on ESM module exports is not
// possible; testing the pure function avoids that limitation entirely).

describe.ifNotWindows("BaseUpdater sanitizeEnvPath PATH handling", () => {
  let updater: DebUpdater

  beforeEach(() => {
    updater = new DebUpdater(null, stubApp)
    vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const sanitize = (p: string) => (updater as any).sanitizeEnvPath(p)

  it("removes a relative prefix from a mixed PATH", () => {
    const result = sanitize("./evil:/usr/bin:/usr/local/bin")
    const entries = result.split(path.delimiter)
    expect(entries).not.toContain("./evil")
    expect(entries).toContain("/usr/bin")
    expect(entries).toContain("/usr/local/bin")
  })

  it("removes a bare dot entry", () => {
    const result = sanitize(".:/usr/local/bin")
    expect(result.split(path.delimiter)).not.toContain(".")
    expect(result).toContain("/usr/local/bin")
  })

  it("removes a parent-traversal relative entry", () => {
    const result = sanitize("../bin:/usr/bin")
    expect(result.split(path.delimiter)).not.toContain("../bin")
    expect(result).toContain("/usr/bin")
  })

  it("keeps all absolute entries intact and in order", () => {
    expect(sanitize("/usr/sbin:/usr/bin:/sbin:/bin")).toBe("/usr/sbin:/usr/bin:/sbin:/bin")
  })

  it("produces an empty string when all entries are relative", () => {
    expect(sanitize("./a:../b:relative/c")).toBe("")
  })

  it("handles an already-empty PATH", () => {
    expect(sanitize("")).toBe("")
  })
})

// ─── AppImageUpdater.doInstall — APPIMAGE env var validation ─────────────────

describe("AppImageUpdater doInstall APPIMAGE env handling", () => {
  let updater: AppImageUpdater
  const originalAppimage = process.env.APPIMAGE

  beforeEach(() => {
    updater = new AppImageUpdater(null, stubApp)
    // Prevent real subprocess calls
    vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalAppimage == null) {
      delete process.env.APPIMAGE
    } else {
      process.env.APPIMAGE = originalAppimage
    }
  })

  it("throws when APPIMAGE is not set", () => {
    delete process.env.APPIMAGE
    expect(() => (updater as any).doInstall(installOpts)).toThrow()
  })

  it("throws when APPIMAGE is a relative path", () => {
    process.env.APPIMAGE = "relative/path/app.AppImage"
    expect(() => (updater as any).doInstall(installOpts)).toThrow(/not a valid absolute path/)
  })

  it("throws when APPIMAGE is a bare filename", () => {
    process.env.APPIMAGE = "app.AppImage"
    expect(() => (updater as any).doInstall(installOpts)).toThrow(/not a valid absolute path/)
  })

  it("proceeds past validation when APPIMAGE is a valid absolute path", () => {
    process.env.APPIMAGE = "/opt/app/myapp.AppImage"
    // It should fail AFTER the validation check (on unlinkSync since the file doesn't exist)
    // but NOT with our validation error message
    expect(() => (updater as any).doInstall(installOpts)).not.toThrow(/not a valid absolute path/)
  })
})

type SetupOptions = {
  cacheDir: string
  verifyUpdateFile: VerifyUpdateFile
  cancellationToken?: CancellationToken
  afterVerification?: (destinationFile: string) => Promise<void>
}

/**
 * Drives `executeDownload` on an AppImage updater with a caller-supplied verifier.
 *
 * `updateDownloaded` resolves with the `update-downloaded` payload if the download is ever announced as ready to
 * install — the public signal, rather than `taskOptions.done`, which `BaseUpdater.executeDownload` replaces with its
 * own closure (so a `done` mock passed in here would never be called on any path).
 */
function setupAppImageDownload({ cacheDir, verifyUpdateFile, cancellationToken = new CancellationToken(), afterVerification }: SetupOptions) {
  const helper = new DownloadedUpdateHelper(cacheDir)
  const updater = new AppImageUpdater(null, stubApp)
  updater.logger = null
  // @ts-expect-error accessing a protected property
  updater.downloadedUpdateHelper = helper
  updater.verifyUpdateFile = verifyUpdateFile

  const updateDownloaded = vi.fn()
  updater.on("update-downloaded", updateDownloaded)

  const taskOptions: DownloadExecutorTask = {
    fileExtension: "AppImage",
    fileInfo: {
      url: new URL("https://example.com/TestApp-2.0.0.AppImage"),
      info: { url: "TestApp-2.0.0.AppImage", sha512: "sha512-of-2.0.0", size: 1024 },
    },
    downloadUpdateOptions: {
      updateInfoAndProvider: {
        info: { version: "2.0.0", files: [], path: "", sha512: "", releaseDate: "" },
        // @ts-expect-error the provider only supplies the feed origin for the download headers, so a stub without one is enough
        provider: { feedBaseUrl: null },
      },
      requestHeaders: {},
      cancellationToken,
    },
    task: async destinationFile => {
      await outputFile(destinationFile, "new AppImage bytes")
    },
    afterVerification,
  }
  // @ts-expect-error accessing a protected method
  const downloadPromise: Promise<unknown> = updater.executeDownload(taskOptions)
  return { updater, helper, updateDownloaded, downloadPromise, finalFilePath: path.join(helper.cacheDirForPendingUpdate, "TestApp-2.0.0.AppImage") }
}

describe("BaseUpdater verifyUpdateFile integration", () => {
  it("removes the temp download and aborts before restoring original filename when verifyUpdateFile fails", async context => {
    const { mock, observations } = createVerifyUpdateFileMock(() => ({ response: "failure", message: "custom verification failed" }))
    const { updateDownloaded, downloadPromise } = setupAppImageDownload({ cacheDir: await context.tmpDir.createTempDir(), verifyUpdateFile: mock })

    const observation = await expectVerifyUpdateFileFailure({
      expect,
      downloadPromise,
      verifyUpdateFile: mock,
      observations,
      expectedErrorMessageSubstring: "custom verification failed",
    })

    expect(observation.originalUpdateFileName).toBe("TestApp-2.0.0.AppImage")
    expect(observation.packageFilePath).toBeUndefined()
    expect(updateDownloaded).not.toHaveBeenCalled()
  })

  it("fails closed when verifyUpdateFile returns a malformed result", async context => {
    // @ts-expect-error intentionally violating the verifier contract to cover fail-closed behavior
    const { mock, observations } = createVerifyUpdateFileMock(() => null)
    const { updateDownloaded, downloadPromise } = setupAppImageDownload({ cacheDir: await context.tmpDir.createTempDir(), verifyUpdateFile: mock })

    await expectVerifyUpdateFileFailure({
      expect,
      downloadPromise,
      verifyUpdateFile: mock,
      observations,
      expectedErrorMessageSubstring: "unknown error",
    })

    expect(updateDownloaded).not.toHaveBeenCalled()
  })

  it("fails closed when verifyUpdateFile reports failure without a message", async context => {
    // @ts-expect-error intentionally violating the verifier contract to cover fail-closed behavior
    const { mock, observations } = createVerifyUpdateFileMock(() => ({ response: "failure" }))
    const { updateDownloaded, downloadPromise } = setupAppImageDownload({ cacheDir: await context.tmpDir.createTempDir(), verifyUpdateFile: mock })

    await expectVerifyUpdateFileFailure({
      expect,
      downloadPromise,
      verifyUpdateFile: mock,
      observations,
      expectedErrorMessageSubstring: "unknown error",
    })

    expect(updateDownloaded).not.toHaveBeenCalled()
  })

  it("aborts after verification when the verifier cancels before rename", async context => {
    const cancellationToken = new CancellationToken()
    const { mock } = createVerifyUpdateFileMock(params => {
      params.cancellationToken?.cancel()
      return { response: "success" }
    })
    const { updateDownloaded, downloadPromise, finalFilePath } = setupAppImageDownload({
      cacheDir: await context.tmpDir.createTempDir(),
      verifyUpdateFile: mock,
      cancellationToken,
    })

    await expect(downloadPromise).rejects.toBeInstanceOf(CancellationError)
    expect(updateDownloaded).not.toHaveBeenCalled()
    expect(await pathExists(finalFilePath)).toBe(false)
  })

  it("skips verification entirely when the download was already cancelled", async context => {
    const cancellationToken = new CancellationToken()
    cancellationToken.cancel()
    const { mock } = createVerifyUpdateFileMock(() => ({ response: "success" }))
    const { updateDownloaded, downloadPromise } = setupAppImageDownload({
      cacheDir: await context.tmpDir.createTempDir(),
      verifyUpdateFile: mock,
      cancellationToken,
    })

    await expect(downloadPromise).rejects.toBeInstanceOf(CancellationError)
    expect(mock).not.toHaveBeenCalled()
    expect(updateDownloaded).not.toHaveBeenCalled()
  })

  it("runs afterVerification between a successful verification and the rename", async context => {
    const order: Array<string> = []
    const { mock } = createVerifyUpdateFileMock(() => {
      order.push("verify")
      return { response: "success" }
    })
    let finalFileExistedInAfterVerification: boolean | undefined
    const { updateDownloaded, downloadPromise, finalFilePath } = setupAppImageDownload({
      cacheDir: await context.tmpDir.createTempDir(),
      verifyUpdateFile: mock,
      afterVerification: async destinationFile => {
        order.push("afterVerification")
        expect(path.basename(destinationFile)).toBe("temp-TestApp-2.0.0.AppImage")
        finalFileExistedInAfterVerification = await pathExists(finalFilePath)
      },
    })

    await downloadPromise
    expect(order).toEqual(["verify", "afterVerification"])
    // it still operates on the temporary name — the rename has not happened yet
    expect(finalFileExistedInAfterVerification).toBe(false)
    expect(updateDownloaded).toHaveBeenCalledTimes(1)
    expect(await pathExists(finalFilePath)).toBe(true)
  })

  it("defers the AppImage executable bit out of the download task and into afterVerification", async context => {
    const updater = new AppImageUpdater(null, stubApp)
    updater.logger = null
    const originalAppimage = process.env.APPIMAGE
    process.env.APPIMAGE = "/opt/app/myapp.AppImage"
    try {
      let captured: DownloadExecutorTask | undefined
      // @ts-expect-error stubbing a protected method to capture what doDownloadUpdate hands to the shared pipeline
      updater.executeDownload = async (taskOptions: DownloadExecutorTask) => {
        captured = taskOptions
        return { updateFile: "" }
      }
      ;(updater as any).httpExecutor = { download: async (_url: URL, destination: string) => outputFile(destination, "new AppImage bytes") }

      // @ts-expect-error accessing a protected method
      await updater.doDownloadUpdate({
        updateInfoAndProvider: {
          info: { version: "2.0.0", files: [{ url: "TestApp-2.0.0.AppImage", sha512: "sha512-of-2.0.0", size: 1024 }], path: "", sha512: "", releaseDate: "" },
          // only resolveFiles is reached before executeDownload is stubbed out
          provider: {
            resolveFiles: () => [{ url: new URL("https://example.com/TestApp-2.0.0.AppImage"), info: { url: "TestApp-2.0.0.AppImage", sha512: "sha512-of-2.0.0", size: 1024 } }],
          } as any,
        },
        requestHeaders: {},
        cancellationToken: new CancellationToken(),
        disableDifferentialDownload: true,
      })

      expect(captured!.afterVerification).toBeDefined()

      const destinationFile = path.join(await context.tmpDir.createTempDir(), "temp-TestApp-2.0.0.AppImage")
      await captured!.task(destinationFile, {} as any, null, () => Promise.resolve())
      expect(await pathExists(destinationFile)).toBe(true)

      // Windows carries no POSIX permission bits (`fs.chmod` only toggles the read-only attribute there, and
      // `stat().mode & 0o111` is always 0), so the executable-bit half of this test is guarded inline and the
      // rest — that AppImageUpdater supplies `afterVerification` at all, and that the task writes the file —
      // keeps running everywhere.
      if (process.platform !== "win32") {
        // the downloaded, not-yet-verified file must not be runnable
        expect((await stat(destinationFile)).mode & 0o111).toBe(0)
      }

      await captured!.afterVerification!(destinationFile)

      if (process.platform !== "win32") {
        expect((await stat(destinationFile)).mode & 0o111).not.toBe(0)
      }
    } finally {
      if (originalAppimage == null) {
        delete process.env.APPIMAGE
      } else {
        process.env.APPIMAGE = originalAppimage
      }
    }
  })

  it("never runs afterVerification when verification fails", async context => {
    const afterVerification = vi.fn(() => Promise.resolve())
    const { mock, observations } = createVerifyUpdateFileMock(() => ({ response: "failure", message: "nope" }))
    const { downloadPromise } = setupAppImageDownload({
      cacheDir: await context.tmpDir.createTempDir(),
      verifyUpdateFile: mock,
      afterVerification,
    })

    await expectVerifyUpdateFileFailure({ expect, downloadPromise, verifyUpdateFile: mock, observations, expectedErrorMessageSubstring: "nope" })
    expect(afterVerification).not.toHaveBeenCalled()
  })
})
