import { hashFile } from "builder-util-runtime"
import type { UpdateInfo } from "builder-util-runtime"
import { outputFile, pathExists, readJson } from "fs-extra"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DebUpdater, NsisUpdater } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import type { Logger, ResolvedUpdateFileInfo } from "electron-updater/src/types"

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

function makeStubApp(overrides: Partial<AppAdapter> = {}): AppAdapter & { quitCalls: number; emitQuit: (exitCode: number) => void; emitSessionEnd: () => void } {
  let quitHandler: ((exitCode: number) => void) | null = null
  const sessionEndHandlers: Array<() => void> = []
  const app: any = {
    name: "TestApp",
    version: "1.0.0",
    isPackaged: false,
    appUpdateConfigPath: "/tmp/app-update.yml",
    userDataPath: "/tmp",
    baseCachePath: "/tmp",
    quitCalls: 0,
    whenReady: () => Promise.resolve(),
    relaunch: () => {},
    quit: () => {
      app.quitCalls++
    },
    onQuit: (handler: (exitCode: number) => void) => {
      quitHandler = handler
    },
    onSessionEnd: (handler: () => void) => {
      sessionEndHandlers.push(handler)
    },
    emitQuit: (exitCode: number) => quitHandler?.(exitCode),
    emitSessionEnd: () => sessionEndHandlers.forEach(it => it()),
    ...overrides,
  }
  return app
}

function makeUpdateInfo(version: string, sha512: string, fileName = "TestApp-Setup.deb"): UpdateInfo {
  return { version, files: [{ url: fileName, sha512 }], path: fileName, sha512, releaseDate: "" }
}

function makeResolvedFileInfo(sha512: string, fileName = "TestApp-Setup.deb"): ResolvedUpdateFileInfo {
  return {
    url: new URL(`https://example.com/${fileName}`),
    info: { url: fileName, sha512, size: 1024 },
  }
}

async function seedDownloadedUpdate(
  helper: DownloadedUpdateHelper,
  options: { version?: string; fileName?: string; content?: string } = {}
): Promise<{ installerPath: string; sha512: string; fileInfo: ResolvedUpdateFileInfo; updateInfo: UpdateInfo }> {
  const fileName = options.fileName ?? "TestApp-Setup.deb"
  const installerPath = path.join(helper.cacheDirForPendingUpdate, fileName)
  await outputFile(installerPath, options.content ?? "installer binary content")
  const sha512 = await hashFile(installerPath)
  const fileInfo = makeResolvedFileInfo(sha512, fileName)
  const updateInfo = makeUpdateInfo(options.version ?? "1.0.1", sha512, fileName)
  await helper.setDownloadedFile(installerPath, null, updateInfo, fileInfo, fileName, true)
  return { installerPath, sha512, fileInfo, updateInfo }
}

describe("install on next launch", { sequential: true }, () => {
  let cacheDir: string
  let helper: DownloadedUpdateHelper
  let log: ReturnType<typeof makeLogger>

  beforeEach(async context => {
    cacheDir = await context.tmpDir.createTempDir()
    helper = new DownloadedUpdateHelper(cacheDir)
    log = makeLogger()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("DownloadedUpdateHelper pending-install marker", () => {
    test("markInstallOnNextLaunchSync persists the marker into update-info.json", async () => {
      await seedDownloadedUpdate(helper)
      expect(helper.markInstallOnNextLaunchSync(log)).toBe(true)

      const persisted = await readJson(path.join(helper.cacheDirForPendingUpdate, "update-info.json"))
      expect(persisted.installOnNextLaunch).toBe(true)
      expect(persisted.fileName).toBe("TestApp-Setup.deb")
      expect(await helper.getPendingInstallInfo()).toMatchObject({ installOnNextLaunch: true })
    })

    test("markInstallOnNextLaunchSync fails when nothing was downloaded", () => {
      expect(helper.markInstallOnNextLaunchSync(log)).toBe(false)
      expect(log.warns.some(it => it.includes("no downloaded update info"))).toBe(true)
    })

    test("getPendingInstallInfo returns null without a marker", async () => {
      await seedDownloadedUpdate(helper)
      expect(await helper.getPendingInstallInfo()).toBeNull()
    })

    test("clearPendingInstallMarker removes the marker but keeps the cached installer", async () => {
      const { installerPath } = await seedDownloadedUpdate(helper)
      helper.markInstallOnNextLaunchSync(log)
      await helper.clearPendingInstallMarker(log)

      expect(await helper.getPendingInstallInfo()).toBeNull()
      expect(await pathExists(installerPath)).toBe(true)
      // the record itself survives, so the update can still be installed on quit
      const persisted = await readJson(path.join(helper.cacheDirForPendingUpdate, "update-info.json"))
      expect(persisted.fileName).toBe("TestApp-Setup.deb")
      expect(persisted.installOnNextLaunch).toBeUndefined()
    })

    test("validateCachedPendingInstall resolves the installer path and rejects a checksum mismatch", async () => {
      const { installerPath, fileInfo } = await seedDownloadedUpdate(helper)
      helper.markInstallOnNextLaunchSync(log)

      expect(await helper.validateCachedPendingInstall(fileInfo, log)).toBe(installerPath)
      expect(helper.file).toBe(installerPath)

      expect(await helper.validateCachedPendingInstall(makeResolvedFileInfo("different-sha512"), log)).toBeNull()
    })
  })

  describe("BaseUpdater quit handler", () => {
    function createUpdater(app = makeStubApp()) {
      const updater = new DebUpdater(null, app)
      updater.logger = log
      ;(updater as any).downloadedUpdateHelper = helper
      const doInstall = vi.spyOn(updater as any, "doInstall").mockReturnValue(true)
      ;(updater as any).addQuitHandler()
      return { updater, app, doInstall }
    }

    test("persists the pending-install marker instead of spawning the installer when autoInstallEvent is 'onNextLaunch'", async () => {
      const { updater, app, doInstall } = createUpdater()
      await seedDownloadedUpdate(helper)
      updater.autoInstallEvent = "onNextLaunch"

      app.emitQuit(0)

      expect(doInstall).not.toHaveBeenCalled()
      expect(await helper.getPendingInstallInfo()).toMatchObject({ installOnNextLaunch: true })
    })

    test("installs on quit as before with the default autoInstallEvent ('onQuit')", async () => {
      const { app, doInstall } = createUpdater()
      await seedDownloadedUpdate(helper)

      app.emitQuit(0)

      expect(doInstall).toHaveBeenCalledTimes(1)
      expect(await helper.getPendingInstallInfo()).toBeNull()
    })

    test("does not install on quit when autoInstallEvent is switched to 'manual' after registration", async () => {
      const { updater, app, doInstall } = createUpdater()
      await seedDownloadedUpdate(helper)
      updater.autoInstallEvent = "manual"

      app.emitQuit(0)

      expect(doInstall).not.toHaveBeenCalled()
      expect(await helper.getPendingInstallInfo()).toBeNull()
    })

    test("skips spawning the installer when the OS session is ending", async () => {
      const { app, doInstall } = createUpdater()
      await seedDownloadedUpdate(helper)

      app.emitSessionEnd()
      app.emitQuit(0)

      expect(doInstall).not.toHaveBeenCalled()
      expect(log.warns.some(it => it.includes("OS session is ending"))).toBe(true)
      // the download stays cached for the next quit
      expect(await helper.getPendingInstallInfo()).toBeNull()
    })

    test("persists the pending-install marker on session end when autoInstallEvent is 'onNextLaunch'", async () => {
      const { updater, app, doInstall } = createUpdater()
      await seedDownloadedUpdate(helper)
      updater.autoInstallEvent = "onNextLaunch"

      app.emitSessionEnd()
      app.emitQuit(0)

      expect(doInstall).not.toHaveBeenCalled()
      expect(await helper.getPendingInstallInfo()).toMatchObject({ installOnNextLaunch: true })
    })

    test("quitAndInstall with waitUntilNextLaunch persists the marker and quits without installing", async () => {
      const { updater, app, doInstall } = createUpdater()
      await seedDownloadedUpdate(helper)

      updater.quitAndInstall({ isSilent: true, isForceRunAfter: true, waitUntilNextLaunch: true })
      await new Promise(resolve => setImmediate(resolve))

      expect(doInstall).not.toHaveBeenCalled()
      expect(app.quitCalls).toBe(1)
      expect(await helper.getPendingInstallInfo()).toMatchObject({ installOnNextLaunch: true })
    })
  })

  describe("BaseUpdater.installPendingUpdateIfAvailable", () => {
    function createUpdater(latestUpdateInfo: UpdateInfo | null, UpdaterClass: new (options: null, app: AppAdapter) => DebUpdater | NsisUpdater = DebUpdater) {
      const app = makeStubApp()
      const updater = new UpdaterClass(null, app)
      updater.logger = log
      updater.forceDevUpdateConfig = true
      ;(updater as any).downloadedUpdateHelper = helper
      const doInstall = vi.spyOn(updater as any, "doInstall").mockReturnValue(true)
      const getUpdateInfoAndProvider = vi.spyOn(updater as any, "getUpdateInfoAndProvider")
      if (latestUpdateInfo == null) {
        getUpdateInfoAndProvider.mockRejectedValue(new Error("network must not be hit"))
      } else {
        getUpdateInfoAndProvider.mockResolvedValue({
          info: latestUpdateInfo,
          provider: {
            resolveFiles: (info: UpdateInfo) => info.files.map(it => makeResolvedFileInfo(it.sha512, it.url)),
          },
        })
      }
      return { updater, app, doInstall, getUpdateInfoAndProvider }
    }

    test("resolves false without a network request when no pending install is marked", async () => {
      const { updater, doInstall, getUpdateInfoAndProvider } = createUpdater(null)
      await seedDownloadedUpdate(helper)

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      expect(getUpdateInfoAndProvider).not.toHaveBeenCalled()
      expect(doInstall).not.toHaveBeenCalled()
    })

    test("installs a validated pending update and quits", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "1.0.1" })
      const { updater, app, doInstall } = createUpdater(seeded.updateInfo)
      helper.markInstallOnNextLaunchSync(log)

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(true)
      await new Promise(resolve => setImmediate(resolve))

      expect(doInstall).toHaveBeenCalledTimes(1)
      expect(doInstall).toHaveBeenCalledWith(expect.objectContaining({ isSilent: true, isForceRunAfter: true }))
      expect(app.quitCalls).toBe(1)
      // marker is cleared before the installer is spawned (loop guard for silently failing installs)
      expect(await helper.getPendingInstallInfo()).toBeNull()
    })

    test("clears the pending state and does not install when the latest version is not newer (loop guard)", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "1.0.0" })
      const { updater, doInstall } = createUpdater(makeUpdateInfo("1.0.0", seeded.sha512))
      helper.markInstallOnNextLaunchSync(log)

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      expect(doInstall).not.toHaveBeenCalled()
      expect(await helper.getPendingInstallInfo()).toBeNull()
    })

    test("clears the pending state and does not install when the cached file no longer matches the latest update info", async () => {
      await seedDownloadedUpdate(helper, { version: "1.0.1" })
      const { updater, doInstall } = createUpdater(makeUpdateInfo("1.0.2", "sha512-of-a-newer-file"))
      helper.markInstallOnNextLaunchSync(log)

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      expect(doInstall).not.toHaveBeenCalled()
      expect(await helper.getPendingInstallInfo()).toBeNull()
    })

    test("does not install when the cached installer content was tampered with", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "1.0.1" })
      const { updater, doInstall } = createUpdater(seeded.updateInfo)
      helper.markInstallOnNextLaunchSync(log)
      await outputFile(seeded.installerPath, "tampered content")

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      expect(doInstall).not.toHaveBeenCalled()
    })

    test("does not install when the launch-time signature re-verification fails", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "1.0.1" })
      const { updater, doInstall } = createUpdater(seeded.updateInfo)
      helper.markInstallOnNextLaunchSync(log)
      vi.spyOn(updater as any, "verifyInstallerSignatureOnLaunch").mockResolvedValue("invalid signature")
      const errors: Error[] = []
      updater.on("error", error => errors.push(error))

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      expect(doInstall).not.toHaveBeenCalled()
      expect(errors.some(it => it.message.includes("not signed"))).toBe(true)
    })

    test("automatic startup path installs a validated per-user pending update on a supporting target (NSIS)", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "1.0.1" })
      const { updater, app, doInstall } = createUpdater(seeded.updateInfo, NsisUpdater)
      helper.markInstallOnNextLaunchSync(log)
      vi.spyOn(updater as any, "verifyInstallerSignatureOnLaunch").mockResolvedValue(null)

      await expect((updater as any).installPendingUpdate(true)).resolves.toBe(true)
      await new Promise(resolve => setImmediate(resolve))

      expect(doInstall).toHaveBeenCalledTimes(1)
      expect(app.quitCalls).toBe(1)
    })

    test("automatic startup path skips per-machine installs but explicit call installs them", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "1.0.1" })
      const { updater, doInstall } = createUpdater(seeded.updateInfo, NsisUpdater)
      vi.spyOn(updater as any, "verifyInstallerSignatureOnLaunch").mockResolvedValue(null)
      // simulate a per-machine install record
      await helper.setDownloadedFile(
        seeded.installerPath,
        null,
        seeded.updateInfo,
        { ...seeded.fileInfo, info: { ...seeded.fileInfo.info, isAdminRightsRequired: true } },
        "TestApp-Setup.deb",
        true
      )
      helper.markInstallOnNextLaunchSync(log)

      await expect((updater as any).installPendingUpdate(true)).resolves.toBe(false)
      expect(doInstall).not.toHaveBeenCalled()
      expect(log.infos.some(it => it.includes("per-machine"))).toBe(true)
      // marker stays so an explicit call can still install it
      expect(await helper.getPendingInstallInfo()).toMatchObject({ installOnNextLaunch: true, isAdminRightsRequired: true })

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(true)
      expect(doInstall).toHaveBeenCalledTimes(1)
      expect(doInstall).toHaveBeenCalledWith(expect.objectContaining({ isAdminRightsRequired: true }))
    })

    test("automatic startup path skips targets that install via an elevating package manager (deb) but explicit call installs them", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "1.0.1" })
      const { updater, doInstall } = createUpdater(seeded.updateInfo, DebUpdater)
      helper.markInstallOnNextLaunchSync(log)

      await expect((updater as any).installPendingUpdate(true)).resolves.toBe(false)
      expect(doInstall).not.toHaveBeenCalled()
      expect(log.infos.some(it => it.includes("installPendingUpdateIfAvailable"))).toBe(true)
      // marker stays so an explicit call can still install it
      expect(await helper.getPendingInstallInfo()).toMatchObject({ installOnNextLaunch: true })

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(true)
      expect(doInstall).toHaveBeenCalledTimes(1)
    })

    test("installs a pending downgrade on the deferred path when allowDowngrade is enabled", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "0.9.0" })
      const { updater, app, doInstall } = createUpdater(seeded.updateInfo)
      updater.allowDowngrade = true
      helper.markInstallOnNextLaunchSync(log)

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(true)
      await new Promise(resolve => setImmediate(resolve))

      expect(doInstall).toHaveBeenCalledTimes(1)
      expect(app.quitCalls).toBe(1)
    })

    test("clears a pending downgrade without installing when allowDowngrade is disabled (default)", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "0.9.0" })
      const { updater, doInstall } = createUpdater(seeded.updateInfo)
      helper.markInstallOnNextLaunchSync(log)

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      expect(doInstall).not.toHaveBeenCalled()
      expect(await helper.getPendingInstallInfo()).toBeNull()
    })

    test("resets quitAndInstallCalled so a later install is not wedged when the launch-time install fails", async () => {
      const seeded = await seedDownloadedUpdate(helper, { version: "1.0.1" })
      const { updater, doInstall } = createUpdater(seeded.updateInfo)
      helper.markInstallOnNextLaunchSync(log)
      updater.on("error", () => {})
      // a throwing install (e.g. AppImage's sync unlink+mv on a read-only mount)
      doInstall.mockImplementationOnce(() => {
        throw new Error("mv: read-only file system")
      })

      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(false)
      // marker was cleared before the (failed) spawn and the flag must not stay latched
      expect(await helper.getPendingInstallInfo()).toBeNull()
      expect((updater as any).quitAndInstallCalled).toBe(false)

      // not wedged: a subsequent install of the still-cached update runs to completion
      helper.markInstallOnNextLaunchSync(log)
      await expect(updater.installPendingUpdateIfAvailable()).resolves.toBe(true)
      expect(doInstall).toHaveBeenCalledTimes(2)
    })
  })
})
