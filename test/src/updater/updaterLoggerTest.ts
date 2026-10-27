import type { UpdateInfo } from "builder-util-runtime"
import { DebUpdater, NoOpLogger, type Logger } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import { describe, test, vi } from "vitest"

// isPackaged: false and no forceDevUpdateConfig, so checkForUpdates() logs why it skips and resolves to null
const stubApp: AppAdapter = {
  name: "TestApp",
  version: "1.0.0",
  isPackaged: false,
  appUpdateConfigPath: "/tmp/does-not-exist-app-update.yml",
  userDataPath: "/tmp",
  baseCachePath: "/tmp",
  whenReady: () => Promise.resolve(),
  relaunch: () => {},
  quit: () => {},
  onQuit: () => {},
}

const SKIP_MESSAGE = "Skip checkForUpdates because application is not packed"
const VERIFICATION_DISABLED = "update manifest signature verification is disabled"
const NO_DOWNLOAD_DEBUG = "checkForUpdatesAndNotify called, downloadPromise is null"

const newUpdater = (logger: Logger | null) => {
  const updater = new DebUpdater(null, stubApp)
  updater.logger = logger
  return updater
}

describe("AppUpdater logger", () => {
  test("the getter hands back the app's own logger, so logger-specific settings (electron-log transports) keep working", ({ expect }) => {
    const electronLogLike = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), transports: { file: { level: "warn" } } }
    const updater = newUpdater(electronLogLike)

    // the documented `autoUpdater.logger.transports.file.level = "info"` pattern
    ;(updater.logger as typeof electronLogLike).transports.file.level = "info"

    expect(updater.logger).toBe(electronLogLike)
    expect(electronLogLike.transports.file.level).toBe("info")
  })

  test("the default logger is console", ({ expect }) => {
    expect(new DebUpdater(null, stubApp).logger).toBe(console)
  })

  test("a throwing logger does not interrupt the update logic", async ({ expect }) => {
    const fail = () => {
      throw new Error("logger failure")
    }
    const throwing = { info: vi.fn(fail), warn: vi.fn(fail), error: vi.fn(fail), debug: vi.fn(fail) }
    const updater = newUpdater(throwing)

    await expect(updater.checkForUpdates()).resolves.toBeNull()
    await expect(updater.checkForUpdatesAndNotify()).resolves.toBeNull()

    expect(throwing.info).toHaveBeenCalledWith(expect.stringContaining(SKIP_MESSAGE))
    expect(throwing.debug).toHaveBeenCalledWith(NO_DOWNLOAD_DEBUG)
  })

  test("a throwing logger does not reject a check that reaches a limited log site", async ({ expect }) => {
    const userDataPath = await mkdtemp(path.join(tmpdir(), "updater-logger-"))
    try {
      const fail = () => {
        throw new Error("logger failure")
      }
      const throwing = { info: vi.fn(fail), warn: vi.fn(fail), error: vi.fn(fail), debug: vi.fn(fail) }
      // packaged, so the check runs; no manifest key, so verifyManifestSignature warns through limitedLogger
      const updater = new DebUpdater(null, { ...stubApp, isPackaged: true, userDataPath })
      updater.logger = throwing
      updater.updateManifestPublicKey = null
      updater.autoDownload = false
      const latest: UpdateInfo = {
        version: "2.0.0",
        files: [{ url: "App-2.0.0.deb", sha512: "hash", size: 100 }],
        path: "App-2.0.0.deb",
        sha512: "hash",
        releaseDate: "2026-01-01T00:00:00.000Z",
      }
      ;(updater as any).clientPromise = Promise.resolve({ setRequestHeaders: () => {}, getLatestVersion: () => Promise.resolve(latest) })

      await expect(updater.checkForUpdates()).resolves.toMatchObject({ isUpdateAvailable: true, updateInfo: { version: "2.0.0" } })
      expect(throwing.warn).toHaveBeenCalledWith(expect.stringContaining(VERIFICATION_DISABLED))
    } finally {
      await rm(userDataPath, { recursive: true, force: true })
    }
  })

  test("debug messages reach a logger that has debug(), and are dropped for one without it", async ({ expect }) => {
    const withDebug = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    await expect(newUpdater(withDebug).checkForUpdatesAndNotify()).resolves.toBeNull()
    expect(withDebug.debug).toHaveBeenCalledWith(NO_DOWNLOAD_DEBUG)

    const withoutDebug = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    await expect(newUpdater(withoutDebug).checkForUpdatesAndNotify()).resolves.toBeNull()
    expect(withoutDebug.info).toHaveBeenCalledWith(expect.stringContaining(SKIP_MESSAGE))
  })

  test("setting the logger to null disables logging", async ({ expect }) => {
    const updater = newUpdater(null)

    expect(updater.logger).toBeInstanceOf(NoOpLogger)
    await expect(updater.checkForUpdatesAndNotify()).resolves.toBeNull()
  })
})
