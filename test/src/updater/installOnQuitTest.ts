import { hashFile } from "builder-util-runtime"
import type { UpdateInfo } from "builder-util-runtime"
import { EventEmitter } from "events"
import { outputFile } from "fs-extra"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DebUpdater, NsisUpdater } from "electron-updater"
import type { AppAdapter, CancellableQuitEvent } from "electron-updater/src/AppAdapter"
import { CommandExitError } from "electron-updater/src/BaseUpdater"
import { ElevationDeniedError } from "electron-updater/src/LinuxUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { ElectronAppAdapter } from "electron-updater/src/ElectronAppAdapter"
import type { Logger } from "electron-updater/src/types"

function makeLogger(): Logger & { infos: string[]; warns: string[]; errors: string[] } {
  const infos: string[] = []
  const warns: string[] = []
  const errors: string[] = []
  return {
    info: (msg: string) => infos.push(msg),
    warn: (msg: string) => warns.push(msg),
    error: (msg: string) => errors.push(msg),
    infos,
    warns,
    errors,
  }
}

interface StubApp extends AppAdapter {
  quitCalls: number
  willQuitHandlerCount: () => number
  /** The event of the `will-quit` being emitted, or emitted last. */
  lastWillQuitEvent: CancellableQuitEvent | null
  /**
   * Emits `will-quit`, then `quit` unless a handler cancelled it, like Electron's `app.quit()` once all windows closed.
   * `isCancelledEarlier`: a `will-quit` listener added by the app before the updater's has cancelled it already. Returns whether the app quit.
   */
  quitApp: (options?: { isCancelledEarlier?: boolean }) => boolean
  emitQuit: (exitCode: number) => void
  emitSessionEnd: () => void
}

function makeStubApp(options: { isWillQuitSupported?: boolean } = {}): StubApp {
  const quitHandlers: Array<(exitCode: number) => void> = []
  const willQuitHandlers: Array<(event: CancellableQuitEvent) => void> = []
  const sessionEndHandlers: Array<() => void> = []
  const app: StubApp = {
    name: "TestApp",
    version: "1.0.0",
    isPackaged: false,
    appUpdateConfigPath: "/tmp/app-update.yml",
    userDataPath: "/tmp",
    baseCachePath: "/tmp",
    quitCalls: 0,
    lastWillQuitEvent: null,
    whenReady: () => Promise.resolve(),
    relaunch: () => {},
    quit: () => {
      app.quitCalls++
    },
    onQuit: handler => {
      quitHandlers.push(handler)
    },
    onSessionEnd: handler => {
      sessionEndHandlers.push(handler)
    },
    willQuitHandlerCount: () => willQuitHandlers.length,
    quitApp: ({ isCancelledEarlier = false } = {}) => {
      let isPrevented = isCancelledEarlier
      const event: CancellableQuitEvent = {
        preventDefault: () => {
          isPrevented = true
        },
        get defaultPrevented() {
          return isPrevented
        },
      }
      app.lastWillQuitEvent = event
      willQuitHandlers.forEach(it => it(event))
      if (isPrevented) {
        return false
      }
      quitHandlers.forEach(it => it(0))
      return true
    },
    emitQuit: exitCode => quitHandlers.forEach(it => it(exitCode)),
    emitSessionEnd: () => sessionEndHandlers.forEach(it => it()),
  }
  if (options.isWillQuitSupported !== false) {
    app.onWillQuit = handler => {
      willQuitHandlers.push(handler)
    }
  }
  return app
}

const flush = () => new Promise(resolve => setImmediate(resolve))

function throwingLogger(): Logger {
  const fail = () => {
    throw new Error("logger failure")
  }
  return { info: fail, warn: fail, error: fail }
}

describe("install on quit", { concurrent: false }, () => {
  let helper: DownloadedUpdateHelper
  let log: ReturnType<typeof makeLogger>

  beforeEach(async context => {
    helper = new DownloadedUpdateHelper(await context.tmpDir.getTempDir({ prefix: "install-on-quit" }))
    log = makeLogger()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function seedDownloadedUpdate(fileName = "TestApp-1.0.1.deb", version = "1.0.1"): Promise<void> {
    const installerPath = path.join(helper.cacheDirForPendingUpdate, fileName)
    await outputFile(installerPath, `installer binary content ${version}`)
    const sha512 = await hashFile(installerPath)
    const updateInfo: UpdateInfo = { version, files: [{ url: fileName, sha512 }], path: fileName, sha512, releaseDate: "" }
    await helper.setDownloadedFile(
      installerPath,
      null,
      updateInfo,
      { url: new URL(`https://example.com/${fileName}`), info: { url: fileName, sha512, size: 1024 } },
      fileName,
      true
    )
  }

  /**
   * A DebUpdater whose update finished downloading, installing with dpkg through pkexec. `pkexecExitCode` is what every
   * pkexec command exits with: 126 is the authentication dialog dismissed, 127 authorization not obtained, 1 a dpkg failure.
   */
  function createDebUpdater(app: StubApp, pkexecExitCode: number, options: { cancelQuitOnInstallFailure?: boolean } = {}) {
    const updater = new DebUpdater(null, app)
    updater.logger = log
    updater.cancelQuitOnInstallFailure = options.cancelQuitOnInstallFailure ?? false
    ;(updater as any).downloadedUpdateHelper = helper
    const errors: Error[] = []
    updater.on("error", (error: Error) => errors.push(error))
    vi.spyOn(updater as any, "isRunningAsRoot").mockReturnValue(false)
    vi.spyOn(updater as any, "hasCommand").mockImplementation((...args: unknown[]) => args[0] === "dpkg" || args[0] === "pkexec")
    vi.spyOn(updater as any, "resolveTrustedCommand").mockImplementation((...args: unknown[]) => `/usr/bin/${String(args[0])}`)
    const pkexecCalls: string[][] = []
    const pkexec = { exitCode: pkexecExitCode }
    vi.spyOn(updater as any, "spawnSyncLog").mockImplementation((...args: unknown[]) => {
      const [cmd, cmdArgs] = args
      if (cmd === "pkexec") {
        pkexecCalls.push(Array.isArray(cmdArgs) ? cmdArgs.map(String) : [])
        if (pkexec.exitCode !== 0) {
          throw new CommandExitError(`Command pkexec exited with code ${pkexec.exitCode}`, "pkexec", pkexec.exitCode, null)
        }
      }
      return ""
    })
    ;(updater as any).addQuitHandler()
    return { updater, errors, pkexecCalls, setPkexecExitCode: (exitCode: number) => (pkexec.exitCode = exitCode) }
  }

  describe("a failed install on quit (deb, pkexec)", () => {
    test("lets the quit proceed, emits error and logs it: the app exits without the update", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, errors, pkexecCalls } = createDebUpdater(app, 126)
      const isCancelledOnError: boolean[] = []
      updater.on("error", (error: Error) => {
        expect(error).toBeInstanceOf(ElevationDeniedError)
        isCancelledOnError.push(app.lastWillQuitEvent?.defaultPrevented ?? true)
      })

      // the quit handlers ran: the app quits
      expect(app.quitApp()).toBe(true)

      expect(app.lastWillQuitEvent?.defaultPrevented).toBe(false)
      expect(isCancelledOnError).toEqual([false])
      // dpkg only: the apt-get repair would show the dismissed authentication dialog a second time
      expect(pkexecCalls.length).toBe(1)
      expect(errors.map(it => it.message)).toEqual(["Command pkexec exited with code 126 (the authentication dialog was dismissed), the update is not installed"])
      // visible in the log, since an "error" listener has no window left to show it in
      expect(log.errors.some(it => it.includes("Cannot install update: Command pkexec exited with code 126"))).toBe(true)
      expect(log.warns.some(it => it.includes("the app quits without it"))).toBe(true)
      expect(log.warns.some(it => it.includes("the quit is cancelled"))).toBe(false)
      // the quit handler that runs next does not install either
      expect(log.infos.some(it => it.includes("installing it failed earlier in this session"))).toBe(true)
      expect((updater as any).quitAndInstallCalled).toBe(false)
    })

    test("does not repair with apt-get when authorization was not obtained (pkexec exit code 127)", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 127)

      expect(app.quitApp()).toBe(true)

      expect(pkexecCalls.length).toBe(1)
      expect(errors.map(it => it.message)).toEqual(["Command pkexec exited with code 127 (authorization was not obtained), the update is not installed"])
    })

    test("still repairs with apt-get when dpkg itself fails", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 1)

      expect(app.quitApp()).toBe(true)

      expect(pkexecCalls.map(it => it.slice(1, 3))).toEqual([
        ["/usr/bin/dpkg", "-i"],
        ["/usr/bin/apt-get", "install"],
      ])
      expect(errors.map(it => it.message)).toEqual(["Command pkexec exited with code 1"])
      expect(log.warns.some(it => it.includes("trying to fix broken dependencies with apt-get"))).toBe(true)
    })

    test("does not show the dialog again on a later quit, should the app keep running", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 126)
      expect(app.quitApp()).toBe(true)

      expect(app.quitApp()).toBe(true)

      expect(pkexecCalls.length).toBe(1)
      expect(errors.length).toBe(1)
    })

    test("lets the quit proceed when an 'error' listener throws", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, pkexecCalls } = createDebUpdater(app, 126)
      updater.on("error", () => {
        throw new Error("error listener failure")
      })

      expect(app.quitApp()).toBe(true)
      expect(log.errors.some(it => it.includes("Cannot install update on quit") && it.includes("error listener failure"))).toBe(true)
      expect(pkexecCalls.length).toBe(1)
    })

    test("lets the quit proceed when a throwing logger is set", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, errors } = createDebUpdater(app, 126)
      updater.logger = throwingLogger()

      let isQuit = false
      expect(() => (isQuit = app.quitApp())).not.toThrow()
      expect(isQuit).toBe(true)
      expect(errors.length).toBeLessThanOrEqual(1)
    })
  })

  describe("a failed install on quit with cancelQuitOnInstallFailure (deb, pkexec)", () => {
    test("is off by default", () => {
      expect(new DebUpdater(null, makeStubApp()).cancelQuitOnInstallFailure).toBe(false)
    })

    test("cancels the quit, emits error and logs it", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, errors, pkexecCalls } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })

      expect(app.quitApp()).toBe(false)

      expect(pkexecCalls.length).toBe(1)
      expect(errors.map(it => it.message)).toEqual(["Command pkexec exited with code 126 (the authentication dialog was dismissed), the update is not installed"])
      expect(log.errors.some(it => it.includes("Cannot install update: Command pkexec exited with code 126"))).toBe(true)
      expect(log.warns.some(it => it.includes("the quit is cancelled"))).toBe(true)
      // an explicit quitAndInstall() can still install
      expect((updater as any).quitAndInstallCalled).toBe(false)
    })

    test("does not repair with apt-get when authorization was not obtained (pkexec exit code 127)", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 127, { cancelQuitOnInstallFailure: true })

      expect(app.quitApp()).toBe(false)

      expect(pkexecCalls.length).toBe(1)
      expect(errors.map(it => it.message)).toEqual(["Command pkexec exited with code 127 (authorization was not obtained), the update is not installed"])
    })

    test("lets the next quit proceed without trying to install again", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      expect(app.quitApp()).toBe(false)
      const pkexecCallCount = pkexecCalls.length

      expect(app.quitApp()).toBe(true)
      // app.exit() skips will-quit: the quit handler does not install either
      app.emitQuit(0)

      expect(pkexecCalls.length).toBe(pkexecCallCount)
      expect(errors.length).toBe(1)
      expect(log.infos.some(it => it.includes("installing it failed earlier in this session"))).toBe(true)
    })

    test("emits error while the quit can still be cancelled, before cancelling it", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      const isCancelledOnError: boolean[] = []
      updater.on("error", (error: Error) => {
        expect(error).toBeInstanceOf(ElevationDeniedError)
        // an app reopens a window here, or schedules app.quit()
        isCancelledOnError.push(app.lastWillQuitEvent?.defaultPrevented ?? true)
      })

      expect(app.quitApp()).toBe(false)

      expect(isCancelledOnError).toEqual([false])
    })

    test("does not show the dialog again when the cached re-check announces the same update again", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls, setPkexecExitCode } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      expect(app.quitApp()).toBe(false)
      const pkexecCallCount = pkexecCalls.length

      // a later check finds the same update cached: the download helper is set to it again
      await seedDownloadedUpdate()
      setPkexecExitCode(0)

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls.length).toBe(pkexecCallCount)
      expect(errors.length).toBe(1)
    })

    test("installs a different update downloaded later on the next quit", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls, setPkexecExitCode } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      expect(app.quitApp()).toBe(false)
      expect(pkexecCalls.length).toBe(1)

      await seedDownloadedUpdate("TestApp-1.0.2.deb", "1.0.2")
      setPkexecExitCode(0)

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls.slice(1)).toEqual([["--disable-internal-agent", "/usr/bin/dpkg", "-i", path.join(helper.cacheDirForPendingUpdate, "TestApp-1.0.2.deb")]])
      expect(errors.length).toBe(1)
    })

    test("lets an explicit quitAndInstall install the same update", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      expect(app.quitApp()).toBe(false)
      // left running: once it succeeds, quitAndInstall emits before-quit-for-update on Electron's autoUpdater
      const doInstallAsync = vi.spyOn(updater as any, "doInstallAsync").mockReturnValue(new Promise<boolean>(() => {}))

      updater.quitAndInstall({ isSilent: true })
      await flush()

      expect(doInstallAsync).toHaveBeenCalledTimes(1)
      expect(log.warns).not.toContain("install call ignored: quitAndInstallCalled is set to true")
    })

    test("cancels the quit when an 'error' listener throws", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, pkexecCalls } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      updater.on("error", () => {
        throw new Error("error listener failure")
      })

      expect(app.quitApp()).toBe(false)
      expect(log.errors.some(it => it.includes("Cannot install update on quit") && it.includes("error listener failure"))).toBe(true)

      const pkexecCallCount = pkexecCalls.length
      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls.length).toBe(pkexecCallCount)
    })

    test("cancels the quit when a throwing logger is set", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, errors } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      updater.logger = throwingLogger()

      let isQuit = true
      expect(() => (isQuit = app.quitApp())).not.toThrow()
      expect(isQuit).toBe(false)
      expect(errors.length).toBeLessThanOrEqual(1)
    })
  })

  test("a successful install on quit does not cancel the quit, and runs once", async () => {
    await seedDownloadedUpdate()
    const app = makeStubApp()
    const { errors, pkexecCalls } = createDebUpdater(app, 0)

    expect(app.quitApp()).toBe(true)

    expect(pkexecCalls).toEqual([["--disable-internal-agent", "/usr/bin/dpkg", "-i", path.join(helper.cacheDirForPendingUpdate, "TestApp-1.0.1.deb")]])
    expect(errors).toEqual([])
  })

  describe("does not cancel the quit", () => {
    test("when no update finished downloading", () => {
      const app = makeStubApp()
      const { pkexecCalls } = createDebUpdater(app, 126)

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls).toEqual([])
    })

    test("while the update is downloading and verifying", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, pkexecCalls } = createDebUpdater(app, 126)
      ;(updater as any).isDownloadInProgress = true

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls).toEqual([])
      expect(log.infos.some(it => it.includes("has not finished downloading and verifying"))).toBe(true)
    })

    test("when autoInstallEvent is 'manual'", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, pkexecCalls } = createDebUpdater(app, 126)
      updater.autoInstallEvent = "manual"

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls).toEqual([])
    })

    test("when autoInstallEvent is 'onNextLaunch', and the quit marks the update for the next launch", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, pkexecCalls } = createDebUpdater(app, 126)
      updater.autoInstallEvent = "onNextLaunch"

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls).toEqual([])
      expect(await helper.getPendingInstallInfo()).toMatchObject({ installOnNextLaunch: true })
    })

    test("when the OS session is ending", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { pkexecCalls } = createDebUpdater(app, 126)

      app.emitSessionEnd()

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls).toEqual([])
    })

    test("when quitAndInstall is already installing and the OS session is ending", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 126)
      vi.spyOn(updater as any, "doInstallAsync").mockReturnValue(new Promise<boolean>(() => {}))

      updater.quitAndInstall({ isSilent: true })
      app.emitSessionEnd()

      expect(app.quitApp()).toBe(true)
    })
  })

  describe("a quit that another will-quit listener cancelled already", () => {
    test("installs nothing, and the quit that follows installs", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 0)

      // the app finishes its async cleanup before it quits again
      expect(app.quitApp({ isCancelledEarlier: true })).toBe(false)
      expect(pkexecCalls).toEqual([])
      expect(log.infos.some(it => it.includes("cancelled by another will-quit listener"))).toBe(true)

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls.length).toBe(1)
      expect(errors).toEqual([])
    })

    test("does not try to install the update again when installing it failed", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { pkexecCalls } = createDebUpdater(app, 126)

      expect(app.quitApp({ isCancelledEarlier: true })).toBe(false)
      expect(pkexecCalls).toEqual([])
      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls.length).toBe(1)
      expect(app.quitApp({ isCancelledEarlier: true })).toBe(false)
      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls.length).toBe(1)
    })

    test("with cancelQuitOnInstallFailure, does not try to install the update again when installing it failed", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { pkexecCalls } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })

      expect(app.quitApp({ isCancelledEarlier: true })).toBe(false)
      expect(pkexecCalls).toEqual([])
      expect(app.quitApp()).toBe(false)
      expect(pkexecCalls.length).toBe(1)
      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls.length).toBe(1)
    })

    test("while an install runs, does not schedule a quit for when it finished", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 0)
      let finish: (isInstalled: boolean) => void = () => {}
      vi.spyOn(updater as any, "doInstallAsync").mockReturnValue(new Promise<boolean>(resolve => (finish = resolve)))

      const installed = updater.installAsync(true, false)
      expect(app.quitApp({ isCancelledEarlier: true })).toBe(false)
      expect(log.infos).not.toContain("Waiting for the update install to finish before quitting")

      finish(true)
      await expect(installed).resolves.toBe(true)
      await flush()

      expect(app.quitCalls).toBe(0)
    })
  })

  test("app.exit() (no will-quit) installs in the quit handler as before", async () => {
    await seedDownloadedUpdate()
    const app = makeStubApp()
    const { pkexecCalls } = createDebUpdater(app, 0)

    app.emitQuit(0)

    expect(pkexecCalls.length).toBe(1)
  })

  test("an app adapter without onWillQuit installs in the quit handler as before", async () => {
    await seedDownloadedUpdate()
    const app = makeStubApp({ isWillQuitSupported: false })
    const { errors, pkexecCalls } = createDebUpdater(app, 126)

    expect(app.quitApp()).toBe(true)
    expect(pkexecCalls.length).toBe(1)
    expect(errors.length).toBe(1)
  })

  describe("a quit while an install runs", () => {
    function deferredInstall(updater: DebUpdater) {
      let finish: (isInstalled: boolean) => void = () => {}
      const doInstallAsync = vi.spyOn(updater as any, "doInstallAsync").mockReturnValue(new Promise<boolean>(resolve => (finish = resolve)))
      return { doInstallAsync, finish: (isInstalled: boolean) => finish(isInstalled) }
    }

    test("waits for a failing quitAndInstall, then quits without installing on quit", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, pkexecCalls } = createDebUpdater(app, 126)
      const { finish } = deferredInstall(updater)

      updater.quitAndInstall({ isSilent: true })
      await flush()
      expect(app.quitApp()).toBe(false)
      expect(app.quitApp()).toBe(false)
      expect(log.infos.filter(it => it === "Waiting for the update install to finish before quitting").length).toBe(1)
      expect(app.quitCalls).toBe(0)

      finish(false)
      await flush()
      await flush()

      expect(app.quitCalls).toBe(1)
      // the quit that follows does not show the authentication dialog again
      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls).toEqual([])
    })

    test("waits for the install on launch, which quits once it succeeded, and quits only once", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 0)
      updater.forceDevUpdateConfig = true
      const { finish } = deferredInstall(updater)
      helper.markInstallOnNextLaunchSync(log)
      const sha512 = helper.downloadedFileInfo?.sha512 ?? ""
      vi.spyOn(updater as any, "getUpdateInfoAndProvider").mockResolvedValue({
        info: { version: "1.0.1", files: [{ url: "TestApp-1.0.1.deb", sha512 }], path: "TestApp-1.0.1.deb", sha512, releaseDate: "" },
        provider: {
          resolveFiles: (info: UpdateInfo) => info.files.map(it => ({ url: new URL(`https://example.com/${it.url}`), info: { url: it.url, sha512: it.sha512, size: 1024 } })),
        },
      })

      const installed = updater.installPendingUpdateIfAvailable()
      // validating the cached installer takes a few file reads
      await vi.waitFor(() => expect((updater as any).isInstallInFlight).toBe(true))
      expect(app.quitApp()).toBe(false)

      finish(true)
      await expect(installed).resolves.toBe(true)
      await flush()
      await flush()

      expect(app.quitCalls).toBe(1)
    })

    test("waits for an installAsync called by the app, and quits once it succeeded", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 0)
      const { finish } = deferredInstall(updater)

      const installed = updater.installAsync(true, false)
      expect(app.quitApp()).toBe(false)

      finish(true)
      await expect(installed).resolves.toBe(true)
      await flush()

      expect(app.quitCalls).toBe(1)
    })

    test("does not wait once the install settled", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 0)
      const { finish } = deferredInstall(updater)

      const installed = updater.installAsync(true, false)
      finish(true)
      await installed
      await flush()

      expect(app.quitApp()).toBe(true)
      expect(app.quitCalls).toBe(0)
    })
  })

  test("NSIS keeps installing in the quit handler, which never cancels the quit", async () => {
    await seedDownloadedUpdate("TestApp-Setup-1.0.1.exe")
    const app = makeStubApp()
    const updater = new NsisUpdater(null, app)
    updater.logger = log
    ;(updater as any).downloadedUpdateHelper = helper
    const doInstall = vi.spyOn(updater as any, "doInstall").mockReturnValue(false)
    ;(updater as any).addQuitHandler()

    expect(app.willQuitHandlerCount()).toBe(0)
    expect(app.quitApp()).toBe(true)
    expect(doInstall).toHaveBeenCalledTimes(1)
  })

  test("ElectronAppAdapter forwards every will-quit event, so a cancelled quit can be followed by another", () => {
    const electronApp = new EventEmitter()
    const adapter = new ElectronAppAdapter(electronApp)
    const events: CancellableQuitEvent[] = []
    adapter.onWillQuit(event => events.push(event))

    const preventDefault = vi.fn()
    electronApp.emit("will-quit", { preventDefault })
    events[0]?.preventDefault()
    electronApp.emit("will-quit", { preventDefault: () => {} })

    expect(events.length).toBe(2)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  test("ElectronAppAdapter forwards defaultPrevented, read when asked", () => {
    const electronApp = new EventEmitter()
    const adapter = new ElectronAppAdapter(electronApp)
    const seen: boolean[] = []
    adapter.onWillQuit(event => {
      seen.push(event.defaultPrevented)
      event.preventDefault()
      seen.push(event.defaultPrevented)
    })

    const electronEvent = {
      defaultPrevented: false,
      preventDefault() {
        electronEvent.defaultPrevented = true
      },
    }
    electronApp.emit("will-quit", electronEvent)
    // cancelled by a listener that ran earlier
    electronApp.emit("will-quit", { defaultPrevented: true, preventDefault: () => {} })
    // an Electron version, or an emitter, without it
    electronApp.emit("will-quit", { preventDefault: () => {} })
    electronApp.emit("will-quit", { defaultPrevented: "yes", preventDefault: () => {} })

    expect(seen).toEqual([false, true, true, true, false, false, false, false])
  })
})
