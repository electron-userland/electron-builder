import { hashFile } from "builder-util-runtime"
import type { UpdateFileInfo, UpdateInfo } from "builder-util-runtime"
import { EventEmitter } from "events"
import { outputFile, pathExists } from "fs-extra"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DebUpdater, NsisUpdater } from "electron-updater"
import type { AppAdapter, CancellableQuitEvent } from "electron-updater/src/AppAdapter"
import { CommandExitError } from "electron-updater/src/BaseUpdater"
import { ElevationDeniedError } from "electron-updater/src/LinuxUpdater"
import { DownloadedUpdateHelper } from "electron-updater/src/DownloadedUpdateHelper"
import { ElectronAppAdapter } from "electron-updater/src/ElectronAppAdapter"
import type { Logger, VerifyUpdateFileResult } from "electron-updater/src/types"
import { makeLogger } from "../helpers/updaterTestUtil"

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
    log = makeLogger()
    helper = new DownloadedUpdateHelper(await context.tmpDir.getTempDir({ prefix: "install-on-quit" }), log)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** `checksum: "sha2"`: update info written for legacy clients, with a sha2 (SHA-256) checksum and no sha512. */
  async function seedDownloadedUpdate(fileName = "TestApp-1.0.1.deb", version = "1.0.1", checksum: "sha512" | "sha2" = "sha512"): Promise<void> {
    const installerPath = path.join(helper.cacheDirForPendingUpdate, fileName)
    await outputFile(installerPath, `installer binary content ${version}`)
    let fileInfo: UpdateFileInfo
    if (checksum === "sha512") {
      fileInfo = { url: fileName, sha512: await hashFile(installerPath), size: 1024 }
    } else {
      // the type requires a sha512, which such update info does not have
      fileInfo = { url: fileName, sha2: await hashFile(installerPath, "sha256", "hex"), size: 1024 } as unknown as UpdateFileInfo
    }
    const updateInfo: UpdateInfo = { version, files: [fileInfo], path: fileName, sha512: fileInfo.sha512, releaseDate: "" }
    await helper.setDownloadedFile(installerPath, null, updateInfo, { url: new URL(`https://example.com/${fileName}`), info: fileInfo }, fileName, true)
  }

  /** The update install failure that the updater's own "error" listener logged, once per failure. */
  function loggedInstallErrors(message: string): string[] {
    return log.errors.filter(it => it.startsWith("Error: ") && it.includes(message))
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
      // visible in the log, since an "error" listener has no window left to show it in: logged once, by the updater's own listener
      expect(loggedInstallErrors("Command pkexec exited with code 126").length).toBe(1)
      expect(log.errors.some(it => it.includes("Cannot install update"))).toBe(false)
      expect(log.warns.some(it => it.includes("the app quits without it"))).toBe(true)
      expect(log.warns.some(it => it.includes("the quit is cancelled"))).toBe(false)
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
      expect(loggedInstallErrors("Command pkexec exited with code 126").length).toBe(1)
      expect(log.errors.some(it => it.includes("Cannot install update"))).toBe(false)
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

  describe("where the install on quit runs", () => {
    /** A will-quit listener that the app registers after the updater's, recording what it sees. */
    function addLaterWillQuitListener(app: StubApp, onWillQuit: (event: CancellableQuitEvent) => void): void {
      expect(app.willQuitHandlerCount()).toBe(1)
      app.onWillQuit?.(onWillQuit)
    }

    test("by default, in the quit handler, once every will-quit listener let the quit through", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 0)
      const pkexecCallCountOnWillQuit: number[] = []
      addLaterWillQuitListener(app, () => pkexecCallCountOnWillQuit.push(pkexecCalls.length))

      expect(app.quitApp()).toBe(true)

      expect(pkexecCallCountOnWillQuit).toEqual([0])
      expect(pkexecCalls.length).toBe(1)
      expect(errors).toEqual([])
    })

    test("by default, installs nothing when a will-quit listener registered after the updater's cancels the quit", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 0)
      addLaterWillQuitListener(app, event => event.preventDefault())

      // quit is not emitted
      expect(app.quitApp()).toBe(false)
      expect(app.quitApp()).toBe(false)

      expect(pkexecCalls).toEqual([])
      expect(errors).toEqual([])
      expect(log.infos).not.toContain("Auto install update on quit")
    })

    test("with cancelQuitOnInstallFailure, in will-quit: a listener registered after the updater's runs after the install", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 0, { cancelQuitOnInstallFailure: true })
      const pkexecCallCountOnWillQuit: number[] = []
      addLaterWillQuitListener(app, event => {
        pkexecCallCountOnWillQuit.push(pkexecCalls.length)
        event.preventDefault()
      })

      expect(app.quitApp()).toBe(false)

      // documented on cancelQuitOnInstallFailure: register the app's will-quit listeners before checking for updates
      expect(pkexecCallCountOnWillQuit).toEqual([1])
      expect(errors).toEqual([])
    })

    test("with cancelQuitOnInstallFailure, installs nothing when a will-quit listener registered before the updater's cancels the quit", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      app.onWillQuit?.(event => event.preventDefault())
      const { errors, pkexecCalls } = createDebUpdater(app, 0, { cancelQuitOnInstallFailure: true })

      expect(app.quitApp()).toBe(false)

      expect(pkexecCalls).toEqual([])
      expect(errors).toEqual([])
    })
  })

  describe("update info with only a legacy sha2 checksum", () => {
    test("identifies the downloaded update by it", async () => {
      await seedDownloadedUpdate("TestApp-1.0.1.deb", "1.0.1", "sha2")
      const id = helper.downloadedUpdateId
      expect(id).toMatch(/^sha2:[0-9a-f]{64}$/)

      await seedDownloadedUpdate("TestApp-1.0.1.deb", "1.0.1", "sha2")
      expect(helper.downloadedUpdateId).toBe(id)

      await seedDownloadedUpdate("TestApp-1.0.1.deb", "1.0.2", "sha2")
      expect(helper.downloadedUpdateId).toMatch(/^sha2:/)
      expect(helper.downloadedUpdateId).not.toBe(id)

      await helper.clear()
      expect(helper.downloadedUpdateId).toBeNull()
    })

    test("with cancelQuitOnInstallFailure, a failed install on quit cancels only that quit, and is not retried", async () => {
      await seedDownloadedUpdate("TestApp-1.0.1.deb", "1.0.1", "sha2")
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })

      expect(app.quitApp()).toBe(false)
      expect(app.quitApp()).toBe(true)
      expect(app.quitApp()).toBe(true)

      expect(pkexecCalls.length).toBe(1)
      expect(errors.length).toBe(1)
      expect(log.infos.some(it => it.includes("installing it failed earlier in this session"))).toBe(true)
    })

    test("a failed install on quit is not retried when the cached re-check announces the same update again", async () => {
      await seedDownloadedUpdate("TestApp-1.0.1.deb", "1.0.1", "sha2")
      const app = makeStubApp()
      const { pkexecCalls, setPkexecExitCode } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      expect(app.quitApp()).toBe(false)

      await seedDownloadedUpdate("TestApp-1.0.1.deb", "1.0.1", "sha2")
      setPkexecExitCode(0)

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls.length).toBe(1)
    })

    test("a newer update downloaded later, under the same installer file name, is installed on quit", async () => {
      await seedDownloadedUpdate("TestApp.deb", "1.0.1", "sha2")
      const app = makeStubApp()
      const { pkexecCalls, setPkexecExitCode } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      expect(app.quitApp()).toBe(false)

      await seedDownloadedUpdate("TestApp.deb", "1.0.2", "sha2")
      setPkexecExitCode(0)

      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls.length).toBe(2)
    })

    test("a quit that waited for a failing quitAndInstall does not install it on quit", async () => {
      await seedDownloadedUpdate("TestApp-1.0.1.deb", "1.0.1", "sha2")
      const app = makeStubApp()
      const { updater, pkexecCalls } = createDebUpdater(app, 126)
      let finish: (isInstalled: boolean) => void = () => {}
      vi.spyOn(updater as any, "doInstallAsync").mockReturnValue(new Promise<boolean>(resolve => (finish = resolve)))

      updater.quitAndInstall({ isSilent: true })
      await flush()
      expect(app.quitApp()).toBe(false)
      finish(false)
      await flush()
      await flush()

      expect(app.quitCalls).toBe(1)
      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls).toEqual([])
    })
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
      expect(log.infos.some(it => it.includes("cancelled by another will-quit listener"))).toBe(true)
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
      expect(log.warns.some(it => it.includes("the quit that waited for the install proceeds without it"))).toBe(true)
      expect(log.infos).not.toContain("The update install finished, quitting")
      // the quit that follows does not show the authentication dialog again
      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls).toEqual([])
    })

    test("with cancelQuitOnInstallFailure, a quit that waited for a failing quitAndInstall stays cancelled", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater, pkexecCalls } = createDebUpdater(app, 126, { cancelQuitOnInstallFailure: true })
      const { finish } = deferredInstall(updater)

      updater.quitAndInstall({ isSilent: true })
      await flush()
      expect(app.quitApp()).toBe(false)

      finish(false)
      await flush()
      await flush()

      expect(app.quitCalls).toBe(0)
      expect(log.warns.some(it => it.includes("the quit that waited for the install stays cancelled (cancelQuitOnInstallFailure)"))).toBe(true)
      expect(log.infos).not.toContain("The update install finished, quitting")
      // the next quit is not cancelled, and does not show the authentication dialog again
      expect(app.quitApp()).toBe(true)
      expect(pkexecCalls).toEqual([])
    })

    test("quits once when a will-quit listener registered after the updater's cancels the waiting quit too", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 0)
      const { finish } = deferredInstall(updater)
      const installed = updater.installAsync(true, false)
      // the app, say, asks for confirmation and quits again by itself
      app.onWillQuit?.(event => event.preventDefault())

      expect(app.quitApp()).toBe(false)
      expect(app.quitApp()).toBe(false)

      finish(true)
      await expect(installed).resolves.toBe(true)
      await flush()

      // one app.quit(), which emits will-quit again: that listener can cancel it as well
      expect(app.quitCalls).toBe(1)
      expect(log.infos.filter(it => it === "The update install finished, quitting").length).toBe(1)
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
      await vi.waitFor(() => expect((updater as any).installState.kind).toBe("installing"))
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

  describe("the install state", () => {
    type Trigger = "install" | "quitAndInstall" | "launch"

    function createNsisUpdater(app: StubApp) {
      const updater = new NsisUpdater(null, app)
      updater.logger = log
      ;(updater as any).downloadedUpdateHelper = helper
      const errors: Error[] = []
      updater.on("error", (error: Error) => errors.push(error))
      ;(updater as any).addQuitHandler()
      return { updater, errors }
    }

    function stateOf(updater: DebUpdater | NsisUpdater): { kind: string; updateId?: string | null; isQuitDeferred?: boolean } {
      return (updater as any).installState
    }

    test("beginInstall moves idle to installing, and refuses while an install runs or once it handed off", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 0)
      expect(stateOf(updater)).toEqual({ kind: "idle" })

      const started = (updater as any).beginInstall(true, false)
      expect(started.options).toEqual({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false })
      expect(stateOf(updater)).toEqual({ kind: "installing", updateId: helper.downloadedUpdateId, isQuitDeferred: false })
      expect(stateOf(updater)).toBe(started.install)

      expect((updater as any).beginInstall(true, false)).toBeNull()
      expect(stateOf(updater)).toBe(started.install)
      expect(log.warns).toContain("install call ignored: quitAndInstallCalled is set to true")

      ;(updater as any).endInstall(started.install, true, "install")
      expect(stateOf(updater)).toEqual({ kind: "handedOff" })
      expect((updater as any).beginInstall(true, false)).toBeNull()
      expect(stateOf(updater)).toEqual({ kind: "handedOff" })
    })

    test("beginInstall stays idle and emits error when no update finished downloading", () => {
      const app = makeStubApp()
      const { updater, errors } = createDebUpdater(app, 0)

      expect((updater as any).beginInstall(true, false)).toBeNull()
      expect(stateOf(updater)).toEqual({ kind: "idle" })
      expect(errors.map(it => it.message)).toEqual(["No update filepath provided, can't quit and install"])
    })

    // target, trigger, installed, quit deferred → state, update skipped on quit, quit scheduled
    test.each<[string, Trigger, boolean, boolean, string, boolean, boolean]>([
      ["deb", "install", true, false, "handedOff", false, false],
      ["deb", "install", false, false, "idle", true, false],
      ["nsis", "install", true, false, "handedOff", false, false],
      ["nsis", "install", false, false, "idle", false, false],
      ["deb", "quitAndInstall", false, false, "idle", false, false],
      ["nsis", "quitAndInstall", false, false, "idle", false, false],
      ["deb", "launch", false, false, "idle", false, false],
      ["deb", "install", true, true, "handedOff", false, true],
      ["deb", "install", false, true, "idle", true, true],
      ["deb", "quitAndInstall", true, true, "handedOff", false, false],
      ["deb", "launch", true, true, "handedOff", false, false],
      ["deb", "quitAndInstall", false, true, "idle", true, true],
      ["deb", "launch", false, true, "idle", true, true],
    ])("endInstall: %s, %s, installed %s, quit deferred %s → %s, skipped on quit %s, quits %s", async (target, trigger, isInstalled, isQuitDeferred, kind, isSkipped, isQuit) => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const updater = target === "deb" ? createDebUpdater(app, 0).updater : createNsisUpdater(app).updater
      const started = (updater as any).beginInstall(true, false)
      started.install.isQuitDeferred = isQuitDeferred

      ;(updater as any).endInstall(started.install, isInstalled, trigger)
      await flush()

      expect(stateOf(updater).kind).toBe(kind)
      expect((updater as any).skipInstallOnQuitUpdateId).toBe(isSkipped ? helper.downloadedUpdateId : null)
      expect(app.quitCalls).toBe(isQuit ? 1 : 0)
    })

    // with cancelQuitOnInstallFailure: trigger, installed → quit scheduled (the quit was deferred)
    test.each<[Trigger, boolean, boolean]>([
      ["install", true, true],
      ["install", false, false],
      ["quitAndInstall", false, false],
      ["launch", false, false],
    ])("endInstall with cancelQuitOnInstallFailure: deb, %s, installed %s, quit deferred → quits %s", async (trigger, isInstalled, isQuit) => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 0, { cancelQuitOnInstallFailure: true })
      const started = (updater as any).beginInstall(true, false)
      started.install.isQuitDeferred = true

      ;(updater as any).endInstall(started.install, isInstalled, trigger)
      await flush()

      expect(stateOf(updater).kind).toBe(isInstalled ? "handedOff" : "idle")
      expect((updater as any).skipInstallOnQuitUpdateId).toBe(isInstalled ? null : helper.downloadedUpdateId)
      expect(app.quitCalls).toBe(isQuit ? 1 : 0)
      expect(log.infos.includes("The update install finished, quitting")).toBe(isInstalled)
      expect(log.warns.some(it => it.includes("stays cancelled (cancelQuitOnInstallFailure)"))).toBe(!isInstalled)
    })

    test("endInstall leaves a state that moved on meanwhile", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { updater } = createDebUpdater(app, 0)
      const started = (updater as any).beginInstall(true, false)
      ;(updater as any).quitAndInstallCalled = false

      ;(updater as any).endInstall(started.install, true, "install")

      expect(stateOf(updater)).toEqual({ kind: "idle" })
    })

    describe.each(["install", "installAsync"] as const)("a failed %s()", method => {
      test("returns to idle, and the next quit installs the update (NSIS)", async () => {
        await seedDownloadedUpdate("TestApp-Setup-1.0.1.exe")
        const app = makeStubApp()
        const { updater } = createNsisUpdater(app)
        const doInstall = vi
          .spyOn(updater as any, "doInstall")
          .mockReturnValueOnce(false)
          .mockReturnValue(true)

        expect(await updater[method](true, false)).toBe(false)
        expect(stateOf(updater)).toEqual({ kind: "idle" })

        expect(app.quitApp()).toBe(true)
        expect(doInstall).toHaveBeenCalledTimes(2)
        expect(log.infos).toContain("Auto install update on quit")
        expect(log.infos).not.toContain("Update installer has already been triggered. Quitting application.")
        expect(stateOf(updater)).toEqual({ kind: "handedOff" })
      })

      test("returns to idle; the next quit does not show the authentication dialog again for that update (deb)", async () => {
        await seedDownloadedUpdate()
        const app = makeStubApp()
        const { updater, pkexecCalls, setPkexecExitCode } = createDebUpdater(app, 126)
        // the async install's spawns are covered by linuxUpdaterUnitTest: here it fails as a dismissed dialog would
        const doInstallAsync = vi.spyOn(updater as any, "doInstallAsync").mockResolvedValue(false)

        expect(await updater[method](true, false)).toBe(false)
        expect(stateOf(updater)).toEqual({ kind: "idle" })
        const installCount = pkexecCalls.length + doInstallAsync.mock.calls.length
        setPkexecExitCode(0)

        expect(app.quitApp()).toBe(true)
        expect(pkexecCalls.length + doInstallAsync.mock.calls.length).toBe(installCount)
        expect(log.infos).toContain("Update will not be installed on quit because installing it failed earlier in this session")
        expect(log.infos).not.toContain("Update installer has already been triggered. Quitting application.")

        // the app can still install it itself
        expect(updater.install(true, false)).toBe(true)
        expect(stateOf(updater)).toEqual({ kind: "handedOff" })
      })

      test("lets the next quit install a different update downloaded later (deb)", async () => {
        await seedDownloadedUpdate()
        const app = makeStubApp()
        const { updater, pkexecCalls, setPkexecExitCode } = createDebUpdater(app, 126)
        vi.spyOn(updater as any, "doInstallAsync").mockResolvedValue(false)

        expect(await updater[method](true, false)).toBe(false)
        await seedDownloadedUpdate("TestApp-1.0.2.deb", "1.0.2")
        setPkexecExitCode(0)
        const pkexecCallCount = pkexecCalls.length

        expect(app.quitApp()).toBe(true)
        expect(pkexecCalls.slice(pkexecCallCount)).toEqual([["--disable-internal-agent", "/usr/bin/dpkg", "-i", path.join(helper.cacheDirForPendingUpdate, "TestApp-1.0.2.deb")]])
      })
    })

    describe("the deprecated quitAndInstallCalled", () => {
      test("reads whether an install started: running or handed off", async () => {
        await seedDownloadedUpdate()
        const app = makeStubApp()
        const { updater } = createDebUpdater(app, 0)
        let finish: (isInstalled: boolean) => void = () => {}
        vi.spyOn(updater as any, "doInstallAsync").mockReturnValue(new Promise<boolean>(resolve => (finish = resolve)))
        expect((updater as any).quitAndInstallCalled).toBe(false)

        const installed = updater.installAsync(true, false)
        expect((updater as any).quitAndInstallCalled).toBe(true)

        finish(true)
        await expect(installed).resolves.toBe(true)
        expect((updater as any).quitAndInstallCalled).toBe(true)
        expect(stateOf(updater)).toEqual({ kind: "handedOff" })
      })

      test("set to true, stops every later install, also on quit", async () => {
        await seedDownloadedUpdate()
        const app = makeStubApp()
        const { updater, pkexecCalls } = createDebUpdater(app, 0)

        ;(updater as any).quitAndInstallCalled = true

        expect(stateOf(updater)).toEqual({ kind: "handedOff" })
        expect(updater.install(true, false)).toBe(false)
        expect(app.quitApp()).toBe(true)
        expect(pkexecCalls).toEqual([])
        expect(log.infos).toContain("Update installer has already been triggered. Quitting application.")
      })

      test("set to false, lets an install start again", async () => {
        await seedDownloadedUpdate()
        const app = makeStubApp()
        const { updater, pkexecCalls } = createDebUpdater(app, 0)
        ;(updater as any).quitAndInstallCalled = true

        ;(updater as any).quitAndInstallCalled = false

        expect(stateOf(updater)).toEqual({ kind: "idle" })
        expect(updater.install(true, false)).toBe(true)
        expect(pkexecCalls.length).toBe(1)
      })
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

  // the downloaded update sits in the pending directory, which the user can write to, until it is installed
  describe("the downloaded update is hashed again right before it is installed", () => {
    const debInstaller = () => path.join(helper.cacheDirForPendingUpdate, "TestApp-1.0.1.deb")
    const nsisInstaller = () => path.join(helper.cacheDirForPendingUpdate, "TestApp-Setup-1.0.1.exe")

    function createNsisUpdater(app: StubApp) {
      const updater = new NsisUpdater(null, app)
      updater.logger = log
      ;(updater as any).downloadedUpdateHelper = helper
      const errors: Error[] = []
      updater.on("error", (error: Error) => errors.push(error))
      const spawnLog = vi.spyOn(updater as any, "spawnLog").mockResolvedValue(true)
      ;(updater as any).addQuitHandler()
      return { updater, errors, spawnLog }
    }

    async function expectRemoved(installerPath: string) {
      expect(await pathExists(installerPath)).toBe(false)
      expect(await pathExists(path.join(helper.cacheDirForPendingUpdate, "update-info.json"))).toBe(false)
    }

    test("deb on quit: an installer overwritten after update-downloaded is not installed, and is removed", async () => {
      await seedDownloadedUpdate()
      const app = makeStubApp()
      const { errors, pkexecCalls } = createDebUpdater(app, 0)
      await outputFile(debInstaller(), "another package")

      expect(app.quitApp()).toBe(true)

      expect(pkexecCalls).toEqual([])
      expect(errors.map(it => (it as any).code)).toEqual(["ERR_UPDATER_UPDATE_FILE_CHANGED"])
      await expectRemoved(debInstaller())
    })

    test("deb, async install: an untouched installer is installed", async () => {
      await seedDownloadedUpdate()
      const { updater, errors } = createDebUpdater(makeStubApp(), 0)
      const spawnAsyncLog = vi.spyOn(updater as any, "spawnAsyncLog").mockResolvedValue(undefined)

      await expect(updater.installAsync(true, false)).resolves.toBe(true)

      expect(spawnAsyncLog).toHaveBeenCalledWith("pkexec", ["--disable-internal-agent", "/usr/bin/dpkg", "-i", debInstaller()], {}, false)
      expect(errors).toEqual([])
    })

    test("deb, async install: an installer overwritten after update-downloaded is not installed, and is removed", async () => {
      await seedDownloadedUpdate()
      const { updater, errors } = createDebUpdater(makeStubApp(), 0)
      const spawnAsyncLog = vi.spyOn(updater as any, "spawnAsyncLog").mockResolvedValue(undefined)
      await outputFile(debInstaller(), "another package")

      await expect(updater.installAsync(true, false)).resolves.toBe(false)

      expect(spawnAsyncLog).not.toHaveBeenCalled()
      expect(errors.map(it => (it as any).code)).toEqual(["ERR_UPDATER_UPDATE_FILE_CHANGED"])
      await expectRemoved(debInstaller())
    })

    test("NSIS on quit: an untouched installer is started", async () => {
      await seedDownloadedUpdate("TestApp-Setup-1.0.1.exe")
      const app = makeStubApp()
      const { errors, spawnLog } = createNsisUpdater(app)

      expect(app.quitApp()).toBe(true)

      expect(spawnLog).toHaveBeenCalledWith(nsisInstaller(), ["--updated", "/S"])
      expect(errors).toEqual([])
    })

    test("NSIS on quit: an installer overwritten after update-downloaded is not started, and is removed", async () => {
      await seedDownloadedUpdate("TestApp-Setup-1.0.1.exe")
      const app = makeStubApp()
      const { errors, spawnLog } = createNsisUpdater(app)
      await outputFile(nsisInstaller(), "another installer")

      expect(app.quitApp()).toBe(true)

      expect(spawnLog).not.toHaveBeenCalled()
      expect(errors.map(it => (it as any).code)).toEqual(["ERR_UPDATER_UPDATE_FILE_CHANGED"])
      await expectRemoved(nsisInstaller())
    })

    test("NSIS, async install: the signature is verified again right before the installer starts", async () => {
      await seedDownloadedUpdate("TestApp-Setup-1.0.1.exe")
      const { updater, errors, spawnLog } = createNsisUpdater(makeStubApp())
      const verifySignature = vi.spyOn(updater as any, "verifySignature").mockResolvedValue({ response: "success" })

      await expect(updater.installAsync(true, false)).resolves.toBe(true)

      expect(verifySignature).toHaveBeenCalledWith(nsisInstaller(), null)
      expect(spawnLog).toHaveBeenCalledWith(nsisInstaller(), ["--updated", "/S"])
      expect(errors).toEqual([])
    })

    test("NSIS, async install: an installer whose signature is rejected is not started, and is removed", async () => {
      await seedDownloadedUpdate("TestApp-Setup-1.0.1.exe")
      const { updater, errors, spawnLog } = createNsisUpdater(makeStubApp())
      vi.spyOn(updater as any, "verifySignature").mockResolvedValue({ response: "failure", message: "signed by someone else" })

      await expect(updater.installAsync(true, false)).resolves.toBe(false)

      expect(spawnLog).not.toHaveBeenCalled()
      expect(errors).toEqual([expect.objectContaining({ code: "ERR_UPDATER_INVALID_SIGNATURE", message: expect.stringContaining("signed by someone else") })])
      await expectRemoved(nsisInstaller())
    })

    test("NSIS, async install: an installer overwritten while its signature is verified is not started", async () => {
      await seedDownloadedUpdate("TestApp-Setup-1.0.1.exe")
      const { updater, errors, spawnLog } = createNsisUpdater(makeStubApp())
      vi.spyOn(updater as unknown as { verifySignature: () => Promise<VerifyUpdateFileResult> }, "verifySignature").mockImplementation(async () => {
        await outputFile(nsisInstaller(), "another installer")
        return { response: "success" }
      })

      await expect(updater.installAsync(true, false)).resolves.toBe(false)

      expect(spawnLog).not.toHaveBeenCalled()
      expect(errors.map(it => (it as any).code)).toEqual(["ERR_UPDATER_UPDATE_FILE_CHANGED"])
    })
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
