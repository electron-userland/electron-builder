import * as path from "path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { CancellationToken } from "builder-util-runtime"
import { AppImageUpdater, DebUpdater } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import type { InstallOptions } from "electron-updater/src/BaseUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import type { DownloadExecutorTask } from "electron-updater/src/AppUpdater"
import { outputFile, pathExists } from "fs-extra"

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

describe("BaseUpdater verifyUpdateFile integration", () => {
  it("removes the temp download and aborts before restoring original filename when verifyUpdateFile fails", async context => {
    const cacheDir = await context.tmpDir.createTempDir()
    const helper = new DownloadedUpdateHelper(cacheDir)
    const updater = new AppImageUpdater(null, stubApp)
    updater.logger = null
    // @ts-expect-error accessing a protected property
    updater.downloadedUpdateHelper = helper

    let observedTempPath = ""
    const verifyUpdateFile = vi.fn(async (updateFile: string) => {
      observedTempPath = updateFile
      return { success: false, error: "custom verification failed" }
    })
    updater.verifyUpdateFile = verifyUpdateFile

    const done = vi.fn()
    const taskOptions: DownloadExecutorTask = {
      fileExtension: "AppImage",
      fileInfo: {
        url: new URL("https://example.com/TestApp-2.0.0.AppImage"),
        info: { url: "TestApp-2.0.0.AppImage", sha512: "sha512-of-2.0.0", size: 1024 },
      },
      downloadUpdateOptions: {
        updateInfoAndProvider: {
          info: { version: "2.0.0", files: [], path: "", sha512: "", releaseDate: "" },
          // @ts-expect-error the provider does not come into play, so we can have it null
          provider: null,
        },
        requestHeaders: {},
        cancellationToken: new CancellationToken(),
      },
      task: async destinationFile => {
        await outputFile(destinationFile, "new AppImage bytes")
      },
      done,
    }
    // @ts-expect-error accessing a protected property
    const downloadPromise = updater.executeDownload(taskOptions)

    /*
     Test the external behavior: the download flow, observed from outside, aborts early with the verification error.
    */
    await expect(downloadPromise).rejects.toMatchObject({
      code: "ERR_UPDATER_INVALID_UPDATE_FILE",
      message: expect.stringContaining("custom verification failed"),
    })

    /*
     Test the internal behaviors:
    */
    expect(done).not.toHaveBeenCalled()
    expect(verifyUpdateFile).toHaveBeenCalledTimes(1)
    // The temporary update file was present before its verification, but then deleted.
    expect(observedTempPath).not.toBe("")
    expect(await pathExists(observedTempPath)).toBe(false)
    // Most importantly, the temporary update file was never restored to the original filename as an executable binary.
    expect(await pathExists(path.join(helper.cacheDirForPendingUpdate, "TestApp-2.0.0.AppImage"))).toBe(false)
  })
})
