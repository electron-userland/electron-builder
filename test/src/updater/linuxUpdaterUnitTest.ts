import { mkdir, readdir, writeFile } from "fs/promises"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { spawn, spawnSync } from "child_process"
import type { TmpDir } from "builder-util"
import { DebUpdater, NoOpLogger, PacmanUpdater, RpmUpdater } from "electron-updater"
import { runInstallPlan, runInstallPlanAsync } from "electron-updater/src/LinuxUpdater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"

// pass-through: lets the spawn tests see how the command line reaches child_process
vi.mock("child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("child_process")>()
  return { ...actual, spawn: vi.fn(actual.spawn), spawnSync: vi.fn(actual.spawnSync) }
})

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

describe("LinuxUpdater unit tests", { concurrent: false }, () => {
  let updater: DebUpdater

  beforeEach(() => {
    updater = new DebUpdater(null, stubApp)
    // Prevent all real subprocess execution
    vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")
    delete process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER
  })

  describe("detectPackageManager", () => {
    it("returns override when it passes regex and hasCommand finds it", () => {
      process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "dpkg"
      vi.spyOn(updater as any, "hasCommand").mockReturnValue(true)
      expect((updater as any).detectPackageManager(["apt", "dpkg"])).toBe("dpkg")
    })

    it("ignores unsafe-char override with a warning and falls through to pms detection", () => {
      process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "dpkg;rm -rf /"
      const hasCommandSpy = vi.spyOn(updater as any, "hasCommand").mockImplementation((cmd: unknown) => cmd === "apt")
      const warnSpy = vi.spyOn((updater as any)._logger, "warn")
      const result = (updater as any).detectPackageManager(["dpkg", "apt"])
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unsafe characters"))
      // fell through to normal pms detection — found "apt"
      expect(result).toBe("apt")
      // did NOT call hasCommand with the raw unsafe string
      expect(hasCommandSpy).not.toHaveBeenCalledWith("dpkg;rm -rf /")
    })

    it("ignores a pipe in override with a warning", () => {
      process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "dpkg|bash"
      const warnSpy = vi.spyOn((updater as any)._logger, "warn")
      vi.spyOn(updater as any, "hasCommand").mockReturnValue(false)
      ;(updater as any).detectPackageManager(["dpkg"])
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unsafe characters"))
    })

    it("ignores a dollar-sign override with a warning", () => {
      process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "$IFS"
      const warnSpy = vi.spyOn((updater as any)._logger, "warn")
      vi.spyOn(updater as any, "hasCommand").mockReturnValue(false)
      ;(updater as any).detectPackageManager(["dpkg"])
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unsafe characters"))
    })

    it("falls through to default when override passes regex but is not found on system", () => {
      process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "dpkg"
      vi.spyOn(updater as any, "hasCommand").mockReturnValue(false)
      const warnSpy = vi.spyOn((updater as any)._logger, "warn")
      const result = (updater as any).detectPackageManager(["dpkg", "apt"])
      // returns pms[0] as the default fallback
      expect(result).toBe("dpkg")
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No package manager found"))
    })

    it("skips override when env var is only whitespace", () => {
      process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "   "
      const hasCommandSpy = vi.spyOn(updater as any, "hasCommand").mockReturnValue(true)
      ;(updater as any).detectPackageManager(["apt"])
      // hasCommand should not be called with the whitespace-only value
      expect(hasCommandSpy).not.toHaveBeenCalledWith("")
      expect(hasCommandSpy).not.toHaveBeenCalledWith("   ")
    })

    it("returns first detected PM from priority list when no override is set", () => {
      vi.spyOn(updater as any, "hasCommand").mockImplementation((cmd: unknown) => cmd === "apt")
      expect((updater as any).detectPackageManager(["dpkg", "apt"])).toBe("apt")
    })

    it("returns first PM in list with a warning when none are found on system", () => {
      vi.spyOn(updater as any, "hasCommand").mockReturnValue(false)
      const warnSpy = vi.spyOn((updater as any)._logger, "warn")
      const result = (updater as any).detectPackageManager(["dpkg", "apt"])
      expect(result).toBe("dpkg")
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No package manager found"))
    })
  })

  describe("installerPath escaping", () => {
    const setRawPath = (rawPath: string) => {
      ;(updater as any).downloadedUpdateHelper = { file: rawPath }
    }

    it("returns null when no download helper is set", () => {
      expect((updater as any).installerPath).toBeNull()
    })

    it("leaves clean paths unchanged", () => {
      setRawPath("/tmp/update-1.0.2.deb")
      expect((updater as any).installerPath).toBe("/tmp/update-1.0.2.deb")
    })

    it("escapes spaces with backslash", () => {
      setRawPath("/tmp/my app/update.deb")
      expect((updater as any).installerPath).toBe("/tmp/my\\ app/update.deb")
    })

    it("escapes backslashes before other metacharacters", () => {
      setRawPath("/tmp/path\\with/file.deb")
      expect((updater as any).installerPath).toBe("/tmp/path\\\\with/file.deb")
    })

    it("escapes dollar signs to prevent variable expansion", () => {
      setRawPath("/tmp/$HOME/update.deb")
      expect((updater as any).installerPath).toBe("/tmp/\\$HOME/update.deb")
    })

    it("escapes backticks to prevent command substitution", () => {
      setRawPath("/tmp/`whoami`/update.deb")
      expect((updater as any).installerPath).toBe("/tmp/\\`whoami\\`/update.deb")
    })

    it("escapes semicolons to prevent command chaining", () => {
      setRawPath("/tmp/path;rm/update.deb")
      expect((updater as any).installerPath).toBe("/tmp/path\\;rm/update.deb")
    })

    it("escapes pipe characters to prevent command piping", () => {
      setRawPath("/tmp/path|bash/update.deb")
      expect((updater as any).installerPath).toBe("/tmp/path\\|bash/update.deb")
    })

    it("escapes double-quotes", () => {
      setRawPath('/tmp/path"quoted"/update.deb')
      expect((updater as any).installerPath).toBe('/tmp/path\\"quoted\\"/update.deb')
    })

    it("strips newline characters", () => {
      setRawPath("/tmp/update\ndeb")
      expect((updater as any).installerPath).toBe("/tmp/updatedeb")
    })

    it("strips carriage return characters", () => {
      setRawPath("/tmp/update\rdeb")
      expect((updater as any).installerPath).toBe("/tmp/updatedeb")
    })
  })

  describe("determineSudoCommand", () => {
    it("prefers pkexec over the unmaintained helpers when both are installed", () => {
      vi.spyOn(updater as any, "hasCommand").mockImplementation((...args: unknown[]) => {
        const cmd = args[0] as string
        return cmd === "pkexec" || cmd === "gksudo"
      })

      expect((updater as any).determineSudoCommand()).toBe("pkexec")
    })

    it("falls back to a legacy helper when polkit is not available", () => {
      vi.spyOn(updater as any, "hasCommand").mockImplementation((...args: unknown[]) => (args[0] as string) === "gksudo")

      expect((updater as any).determineSudoCommand()).toBe("gksudo")
    })

    it("falls back to sudo when no graphical helper is installed", () => {
      vi.spyOn(updater as any, "hasCommand").mockReturnValue(false)

      expect((updater as any).determineSudoCommand()).toBe("sudo")
    })

    it("says once that pkexec is used when a legacy helper is installed too", () => {
      vi.spyOn(updater as any, "hasCommand").mockImplementation((...args: unknown[]) => ["pkexec", "kdesudo"].includes(args[0] as string))
      const info = vi.fn()
      updater.logger = { info, warn() {}, error() {} }

      ;(updater as any).determineSudoCommand()
      ;(updater as any).determineSudoCommand()

      const announcements = info.mock.calls.filter(([message]) => String(message).includes("polkit"))
      expect(announcements).toEqual([["Elevating the install with pkexec (polkit); kdesudo is only used on systems without polkit"]])
    })

    it("does not announce anything when pkexec is the only helper", () => {
      vi.spyOn(updater as any, "hasCommand").mockImplementation((...args: unknown[]) => args[0] === "pkexec")
      const info = vi.fn()
      updater.logger = { info, warn() {}, error() {} }

      ;(updater as any).determineSudoCommand()

      expect(info.mock.calls.filter(([message]) => String(message).includes("polkit"))).toEqual([])
    })
  })

  describe("resolveTrustedCommand", () => {
    it("keeps an absolute path", () => {
      expect((updater as any).resolveTrustedCommand("/opt/bin/dpkg")).toBe("/opt/bin/dpkg")
    })

    it.skipIf(process.platform === "win32")("finds a command in the system directories", () => {
      expect(["/usr/bin/sh", "/bin/sh", "/usr/sbin/sh", "/sbin/sh"]).toContain((updater as any).resolveTrustedCommand("sh"))
    })

    it.skipIf(process.platform === "win32")("ignores the caller's PATH, which can hold user-writable directories", async ({ tmpDir }) => {
      const dir = await tmpDir.getTempDir({ prefix: "user-bin" })
      await mkdir(dir, { recursive: true })
      const name = "electron-updater-test-package-manager"
      await writeFile(path.join(dir, name), "#!/bin/sh\n", { mode: 0o755 })
      vi.stubEnv("PATH", `${dir}${path.delimiter}${process.env.PATH ?? ""}`)
      try {
        expect(() => (updater as any).resolveTrustedCommand(name)).toThrow(`${name} not found in /usr/sbin:/usr/bin:/sbin:/bin`)
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })

  describe("async install", () => {
    const setRawPath = (rawPath: string) => {
      ;(updater as any).downloadedUpdateHelper = { file: rawPath }
    }

    beforeEach(() => {
      vi.spyOn(updater as any, "isRunningAsRoot").mockReturnValue(false)
      vi.spyOn(updater as any, "hasCommand").mockImplementation((...args: unknown[]) => {
        const cmd = args[0] as string
        return cmd === "dpkg" || cmd === "pkexec"
      })
      // independent of where the test machine has its package managers
      vi.spyOn(updater as any, "resolveTrustedCommand").mockImplementation((...args: unknown[]) => `/usr/bin/${args[0] as string}`)
    })

    it("passes the command to pkexec as argv, without a shell and without escaping the path", async () => {
      setRawPath("/tmp/a b/update-1.0.2.deb")
      const spawnAsyncLog = vi.spyOn(updater as any, "spawnAsyncLog").mockResolvedValue(undefined)

      await (updater as any).doInstallAsync({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false })

      // the dialog shows `/usr/bin/dpkg -i …` instead of `/bin/bash -c '…'`, and the space is not backslash-escaped
      expect(spawnAsyncLog).toHaveBeenCalledWith("pkexec", ["--disable-internal-agent", "/usr/bin/dpkg", "-i", "/tmp/a b/update-1.0.2.deb"], {}, false)
    })

    it("keeps the wrapped command string and the escaped path for helpers that cannot take argv", async () => {
      setRawPath("/tmp/a b/update-1.0.2.deb")
      vi.spyOn(updater as any, "determineSudoCommand").mockReturnValue("gksudo")
      const spawnAsyncLog = vi.spyOn(updater as any, "spawnAsyncLog").mockResolvedValue(undefined)

      await (updater as any).doInstallAsync({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false })

      // gksudo takes a single command string, so the bash wrapper, the shell and the escaping stay
      expect(spawnAsyncLog).toHaveBeenCalledWith("gksudo", ["--message", expect.any(String), `"/bin/bash`, "-c", `'dpkg -i /tmp/a\\ b/update-1.0.2.deb'"`], {}, true)
    })

    it("resolves the elevation helper once per install, for every command of the plan", async () => {
      setRawPath("/tmp/update-1.0.2.deb")
      const determineSudoCommand = vi.spyOn(updater as any, "determineSudoCommand")
      const spawnAsyncLog = vi
        .spyOn(updater as any, "spawnAsyncLog")
        .mockRejectedValueOnce(new Error("Command pkexec exited with code 1"))
        .mockResolvedValue(undefined)

      await (updater as any).doInstallAsync({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false })

      // dpkg, then the apt-get repair: two privileged commands, one helper resolution
      expect(spawnAsyncLog).toHaveBeenCalledTimes(2)
      expect(determineSudoCommand).toHaveBeenCalledTimes(1)
    })

    it("does not run a command that is not in the system directories", async () => {
      setRawPath("/tmp/update-1.0.2.deb")
      vi.spyOn(updater as any, "resolveTrustedCommand").mockImplementation((...args: unknown[]) => {
        throw new Error(`${args[0] as string} not found in /usr/sbin:/usr/bin:/sbin:/bin`)
      })
      const spawnAsyncLog = vi.spyOn(updater as any, "spawnAsyncLog").mockResolvedValue(undefined)
      const dispatchError = vi.spyOn(updater as any, "dispatchError").mockReturnValue(undefined)

      expect(await (updater as any).doInstallAsync({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false })).toBe(false)
      expect(spawnAsyncLog).not.toHaveBeenCalled()
      // like the wrapped form's `command not found`, a missing dpkg leads to the apt-get repair, which is not found either
      expect(dispatchError).toHaveBeenCalledWith(expect.objectContaining({ message: "apt-get not found in /usr/sbin:/usr/bin:/sbin:/bin" }))
    })

    it("never falls back to the blocking spawnSync path", async () => {
      setRawPath("/tmp/update-1.0.2.deb")
      const spawnSyncLog = vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")
      vi.spyOn(updater as any, "spawnAsyncLog").mockResolvedValue(undefined)

      await (updater as any).doInstallAsync({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false })

      // only the non-privileged `command -v` probes may be synchronous
      const privileged = spawnSyncLog.mock.calls.filter(([cmd]) => cmd !== "command")
      expect(privileged).toEqual([])
    })

    it("repairs dependencies with apt-get when dpkg fails, as a separate authenticated command", async () => {
      setRawPath("/tmp/update-1.0.2.deb")
      // first call is dpkg, second is the apt-get repair
      const spawnAsyncLog = vi
        .spyOn(updater as any, "spawnAsyncLog")
        .mockRejectedValueOnce(new Error("Command pkexec exited with code 1"))
        .mockResolvedValue(undefined)

      await (updater as any).doInstallAsync({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false })

      expect(spawnAsyncLog.mock.calls.map(([, argv]: any) => argv.slice(1))).toEqual([
        ["/usr/bin/dpkg", "-i", "/tmp/update-1.0.2.deb"],
        ["/usr/bin/apt-get", "install", "-f", "-y"],
      ])
    })

    it("reports the failure instead of relaunching when every command fails", async () => {
      setRawPath("/tmp/update-1.0.2.deb")
      vi.spyOn(updater as any, "spawnAsyncLog").mockRejectedValue(new Error("Command pkexec exited with code 126"))
      const dispatchError = vi.spyOn(updater as any, "dispatchError").mockReturnValue(undefined)
      const relaunch = vi.spyOn((updater as any).app, "relaunch")

      const installed = await (updater as any).doInstallAsync({ isSilent: true, isForceRunAfter: true, isAdminRightsRequired: false })

      expect(installed).toBe(false)
      expect(dispatchError).toHaveBeenCalled()
      expect(relaunch).not.toHaveBeenCalled()
    })

    it("relaunches after a successful install when isForceRunAfter is set", async () => {
      setRawPath("/tmp/update-1.0.2.deb")
      vi.spyOn(updater as any, "spawnAsyncLog").mockResolvedValue(undefined)
      const relaunch = vi.spyOn((updater as any).app, "relaunch")

      const installed = await (updater as any).doInstallAsync({ isSilent: true, isForceRunAfter: true, isAdminRightsRequired: false })

      expect(installed).toBe(true)
      expect(relaunch).toHaveBeenCalledTimes(1)
    })

    it("reports an unsupported package manager override instead of running anything", async () => {
      setRawPath("/tmp/update-1.0.2.deb")
      process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER = "zypper"
      vi.spyOn(updater as any, "hasCommand").mockReturnValue(true)
      const spawnAsyncLog = vi.spyOn(updater as any, "spawnAsyncLog").mockResolvedValue(undefined)
      const dispatchError = vi.spyOn(updater as any, "dispatchError").mockReturnValue(undefined)

      const installed = await (updater as any).doInstallAsync({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false })

      expect(installed).toBe(false)
      expect(spawnAsyncLog).not.toHaveBeenCalled()
      expect(dispatchError).toHaveBeenCalledWith(expect.objectContaining({ message: "Package manager zypper not supported" }))
    })

    it("refreshes the pacman database and retries, like the synchronous path", async () => {
      const pacman = new PacmanUpdater(null, stubApp)
      pacman.logger = new NoOpLogger()
      ;(pacman as any).downloadedUpdateHelper = { file: "/tmp/update-1.0.2.pacman" }
      vi.spyOn(pacman as any, "isRunningAsRoot").mockReturnValue(true)
      const spawnAsyncLog = vi
        .spyOn(pacman as any, "spawnAsyncLog")
        .mockRejectedValueOnce(new Error("Command pacman exited with code 1"))
        .mockResolvedValue(undefined)

      const installed = await (pacman as any).doInstallAsync({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false })

      expect(installed).toBe(true)
      // running as root: argv, no shell, no escaping
      expect(spawnAsyncLog.mock.calls).toEqual([
        ["pacman", ["-U", "--noconfirm", "/tmp/update-1.0.2.pacman"], {}, false],
        ["pacman", ["-Sy", "--noconfirm"], {}, false],
        ["pacman", ["-U", "--noconfirm", "/tmp/update-1.0.2.pacman"], {}, false],
      ])
    })
  })

  describe("quitAndInstall with the async install", () => {
    function prepareDownloadedUpdate() {
      updater.logger = { info() {}, warn() {}, error: vi.fn() }
      ;(updater as any).downloadedUpdateHelper = { file: "/tmp/update-1.0.2.deb", downloadedFileInfo: { isAdminRightsRequired: false } }
    }

    const flush = () => new Promise(resolve => setImmediate(resolve))

    it("does not quit before the install finished", async () => {
      prepareDownloadedUpdate()
      let finishInstall: (isInstalled: boolean) => void = () => {}
      vi.spyOn(updater as any, "doInstallAsync").mockReturnValue(new Promise<boolean>(resolve => (finishInstall = resolve)))
      const quit = vi.spyOn((updater as any).app, "quit")

      updater.quitAndInstall({ isSilent: true })
      await flush()

      expect(quit).not.toHaveBeenCalled()
      expect((updater as any).quitAndInstallCalled).toBe(true)

      finishInstall(false)
      await flush()
      expect(quit).not.toHaveBeenCalled()
      expect((updater as any).quitAndInstallCalled).toBe(false)
    })

    it("is not left stuck when reporting the install failure throws", async () => {
      prepareDownloadedUpdate()
      vi.spyOn(updater as any, "doInstallAsync").mockRejectedValue(new Error("boom"))
      // an "error" listener that throws makes dispatchError throw, which installAsync cannot catch
      vi.spyOn(updater as any, "dispatchError").mockImplementation(() => {
        throw new Error("error listener failure")
      })
      const quit = vi.spyOn((updater as any).app, "quit")

      updater.quitAndInstall({ isSilent: true })
      await flush()

      expect(quit).not.toHaveBeenCalled()
      expect((updater as any).quitAndInstallCalled).toBe(false)
      expect(updater.logger?.error).toHaveBeenCalledWith(expect.stringContaining("Cannot install update"))
    })
  })

  describe("on-quit install", () => {
    const options = { isSilent: true, isForceRunAfter: false, isAdminRightsRequired: false }

    function prepareDownloadedUpdate(rawPath: string) {
      ;(updater as any).downloadedUpdateHelper = { file: rawPath, downloadedFileInfo: { isAdminRightsRequired: false } }
    }

    function quitHandlerOf(target: DebUpdater): (exitCode: number) => void {
      let handler: ((exitCode: number) => void) | null = null
      ;(target as any).app = {
        ...stubApp,
        onQuit: (it: (exitCode: number) => void) => {
          handler = it
        },
      }
      ;(target as any).addQuitHandler()
      if (handler == null) {
        throw new Error("no quit handler registered")
      }
      return handler
    }

    beforeEach(() => {
      updater.logger = new NoOpLogger()
      vi.spyOn(updater as any, "isRunningAsRoot").mockReturnValue(false)
      vi.spyOn(updater as any, "hasCommand").mockImplementation((...args: unknown[]) => {
        const cmd = args[0] as string
        return cmd === "dpkg" || cmd === "pkexec"
      })
      vi.spyOn(updater as any, "resolveTrustedCommand").mockImplementation((...args: unknown[]) => `/usr/bin/${args[0] as string}`)
    })

    it("passes the command to pkexec as argv when the app quits, without a shell and without escaping the path", () => {
      prepareDownloadedUpdate("/tmp/a b/update-1.0.2.deb")
      const spawnSyncLog = vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")
      const doInstall = vi.spyOn(updater as any, "doInstall")

      quitHandlerOf(updater)(0)

      // the quit handler cannot await: the install stays synchronous, so the app exits only once pkexec returned
      expect(doInstall).toHaveBeenCalledTimes(1)
      const privileged = spawnSyncLog.mock.calls.filter(([cmd]) => cmd !== "command")
      expect(privileged).toEqual([["pkexec", ["--disable-internal-agent", "/usr/bin/dpkg", "-i", "/tmp/a b/update-1.0.2.deb"], {}, false]])
      expect(JSON.stringify(privileged)).not.toContain("/bin/bash")
    })

    it("spawns exactly what the async install spawns, for every command of the plan", async () => {
      prepareDownloadedUpdate("/tmp/a b/update-1.0.2.deb")
      const spawnSyncLog = vi.spyOn(updater as any, "spawnSyncLog").mockImplementation((...args: unknown[]) => {
        if (args[0] !== "command" && (args[1] as string[]).includes("-i")) {
          throw new Error("Command pkexec exited with code 1")
        }
        return ""
      })
      const spawnAsyncLog = vi
        .spyOn(updater as any, "spawnAsyncLog")
        .mockRejectedValueOnce(new Error("Command pkexec exited with code 1"))
        .mockResolvedValue(undefined)

      expect((updater as any).doInstall(options)).toBe(true)
      expect(await (updater as any).doInstallAsync(options)).toBe(true)

      const privileged = spawnSyncLog.mock.calls.filter(([cmd]) => cmd !== "command")
      expect(privileged).toHaveLength(2)
      expect(privileged).toEqual(spawnAsyncLog.mock.calls)
    })

    it("keeps the wrapped command string and the escaped path for helpers that cannot take argv", () => {
      prepareDownloadedUpdate("/tmp/a b/update-1.0.2.deb")
      vi.spyOn(updater as any, "determineSudoCommand").mockReturnValue("gksudo")
      const spawnSyncLog = vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")

      expect((updater as any).doInstall(options)).toBe(true)

      expect(spawnSyncLog.mock.calls.filter(([cmd]) => cmd !== "command")).toEqual([
        ["gksudo", ["--message", expect.any(String), `"/bin/bash`, "-c", `'dpkg -i /tmp/a\\ b/update-1.0.2.deb'"`], {}, true],
      ])
    })

    it("runs the command as argv, without a shell, when running as root", () => {
      prepareDownloadedUpdate("/tmp/a b/update-1.0.2.deb")
      vi.spyOn(updater as any, "isRunningAsRoot").mockReturnValue(true)
      const spawnSyncLog = vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")

      expect((updater as any).doInstall(options)).toBe(true)

      expect(spawnSyncLog.mock.calls.filter(([cmd]) => cmd !== "command")).toEqual([["dpkg", ["-i", "/tmp/a b/update-1.0.2.deb"], {}, false]])
    })

    it("does not run a command that is not in the system directories", () => {
      prepareDownloadedUpdate("/tmp/update-1.0.2.deb")
      vi.spyOn(updater as any, "resolveTrustedCommand").mockImplementation((...args: unknown[]) => {
        throw new Error(`${args[0] as string} not found in /usr/sbin:/usr/bin:/sbin:/bin`)
      })
      const spawnSyncLog = vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")
      const dispatchError = vi.spyOn(updater as any, "dispatchError").mockReturnValue(undefined)

      expect((updater as any).doInstall(options)).toBe(false)
      expect(spawnSyncLog.mock.calls.filter(([cmd]) => cmd !== "command")).toEqual([])
      expect(dispatchError).toHaveBeenCalledWith(expect.objectContaining({ message: "apt-get not found in /usr/sbin:/usr/bin:/sbin:/bin" }))
    })
  })

  describe("spawnAsyncLog", () => {
    // quoted: the command line goes through a shell, and the path may contain spaces
    const node = `"${process.execPath}"`

    function captureLogs() {
      const warnings: string[] = []
      const errors: string[] = []
      updater.logger = { info() {}, warn: (m?: any) => warnings.push(String(m)), error: (m?: any) => errors.push(String(m)) }
      return { warnings, errors }
    }

    // the directory the stderr temp file is created in, so that the tests can check it is removed
    async function captureStderrIn(tmpDir: TmpDir): Promise<string> {
      const dir = await tmpDir.createTempDir({ prefix: "stderr-capture" })
      vi.spyOn(updater as any, "commandStderrDir").mockReturnValue(dir)
      return dir
    }

    it("resolves when the command exits with code 0, and removes the stderr temp file", async ({ tmpDir }) => {
      captureLogs()
      const dir = await captureStderrIn(tmpDir)
      await expect((updater as any).spawnAsyncLog(node, ["-e", "\"process.stderr.write('warning');process.exit(0)\""])).resolves.toBeUndefined()
      expect(await readdir(dir)).toEqual([])
    })

    it("rejects with the exit code and the command's stderr, and removes the stderr temp file", async ({ tmpDir }) => {
      const { errors } = captureLogs()
      const dir = await captureStderrIn(tmpDir)
      await expect((updater as any).spawnAsyncLog(node, ["-e", `"process.stderr.write('boom\\n');process.exit(3)"`])).rejects.toThrow(/exited with code 3: boom$/)
      expect(await readdir(dir)).toEqual([])
      // reported once, by the error, not logged a second time
      expect(errors).toEqual([])
    })

    it.skipIf(process.platform === "win32")("gives the command a file as stderr, already removed while the command runs", async ({ tmpDir }) => {
      captureLogs()
      const dir = await captureStderrIn(tmpDir)
      // a pipe would tie the command to the app: SIGPIPE on its next write to stderr once the app quit
      const script = `"const fs=require('fs');process.stderr.write(fs.fstatSync(2).isFile()+' '+fs.readdirSync('${dir}').length);process.exit(1)"`
      await expect((updater as any).spawnAsyncLog(node, ["-e", script])).rejects.toThrow(/exited with code 1: true 0$/)
    })

    it("keeps only the end of a long stderr in the error message", async ({ tmpDir }) => {
      captureLogs()
      await captureStderrIn(tmpDir)
      const script = `"process.stderr.write('HEAD'+'x'.repeat(100000)+'é'.repeat(5000)+'TAIL!');process.exit(2)"`
      const error: Error = await (updater as any).spawnAsyncLog(node, ["-e", script]).then(
        () => null,
        (e: Error) => e
      )
      // 8 KiB from the end falls inside a two-byte "é": the partial character is dropped, not decoded as U+FFFD
      expect(error.message).toMatch(/^Command .* exited with code 2: …é+TAIL!$/)
      expect(error.message).not.toContain("HEAD")
      expect(error.message).not.toContain("\uFFFD")
      expect(Buffer.byteLength(error.message)).toBeLessThan(9 * 1024)
    })

    it("removes the stderr temp file when the command cannot be spawned", async ({ tmpDir }) => {
      captureLogs()
      const dir = await captureStderrIn(tmpDir)
      await expect((updater as any).spawnAsyncLog("echo\0", [])).rejects.toThrow(/null bytes/)
      expect(await readdir(dir)).toEqual([])
    })

    it("still runs the command when the stderr temp file cannot be created", async ({ tmpDir }) => {
      const { warnings } = captureLogs()
      vi.spyOn(updater as any, "commandStderrDir").mockReturnValue(path.join(await tmpDir.createTempDir({ prefix: "stderr-capture" }), "missing"))
      await expect((updater as any).spawnAsyncLog(node, ["-e", `"process.stderr.write('boom');process.exit(3)"`])).rejects.toThrow(/exited with code 3$/)
      expect(warnings).toEqual([expect.stringContaining("Cannot capture the command's stderr")])
    })

    it.skipIf(process.platform === "win32")("names the signal when the command is killed by one", async ({ tmpDir }) => {
      captureLogs()
      await captureStderrIn(tmpDir)
      // `$$` is the shell itself, so the process spawnAsyncLog waits for is the one killed
      await expect((updater as any).spawnAsyncLog("kill", ["-TERM", "$$"])).rejects.toThrow("exited with code null, signal SIGTERM")
    })

    it("still settles when the logger throws", async ({ tmpDir }) => {
      updater.logger = {
        info: () => {
          throw new Error("logger failure")
        },
        warn: () => {
          throw new Error("logger failure")
        },
        error: () => {
          throw new Error("logger failure")
        },
      }
      const dir = await captureStderrIn(tmpDir)
      await expect((updater as any).spawnAsyncLog(node, ["-e", `"process.stderr.write('boom');process.exit(4)"`])).rejects.toThrow(/exited with code 4: boom$/)
      expect(await readdir(dir)).toEqual([])
      // and when the stderr temp file cannot be created, which is logged as a warning
      vi.spyOn(updater as any, "commandStderrDir").mockReturnValue(path.join(dir, "missing"))
      await expect((updater as any).spawnAsyncLog(node, ["-e", '"process.exit(4)"'])).rejects.toThrow(/exited with code 4$/)
    })

    // Node joins the arguments itself when given `shell: true` and an argv array, and warns that they are not escaped (DEP0190)
    it("passes the shell one command line, as Node would have joined it, so that DEP0190 does not apply", async ({ tmpDir }) => {
      captureLogs()
      await captureStderrIn(tmpDir)
      vi.mocked(spawn).mockClear()
      await (updater as any).spawnAsyncLog(node, ["-e", '"process.exit(0)"'])
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(`${node} -e "process.exit(0)"`, [], expect.objectContaining({ shell: true }))
    })

    // argv mode (`useShell` false): the command and its arguments reach the program as they are, without a shell
    it("captures stderr into the error message without a shell too, and removes the stderr temp file", async ({ tmpDir }) => {
      captureLogs()
      const dir = await captureStderrIn(tmpDir)
      vi.mocked(spawn).mockClear()
      const script = "process.stderr.write('argv $HOME a b');process.exit(5)"
      await expect((updater as any).spawnAsyncLog(process.execPath, ["-e", script], {}, false)).rejects.toThrow(/exited with code 5: argv \$HOME a b$/)
      expect(vi.mocked(spawn)).toHaveBeenCalledWith(process.execPath, ["-e", script], expect.objectContaining({ shell: false }))
      expect(await readdir(dir)).toEqual([])
    })

    it("removes the stderr temp file when the program does not exist, without a shell", async ({ tmpDir }) => {
      captureLogs()
      const dir = await captureStderrIn(tmpDir)
      await expect((updater as any).spawnAsyncLog(path.join(dir, "missing-program"), [], {}, false)).rejects.toThrow(/ENOENT/)
      expect(await readdir(dir)).toEqual([])
    })
  })

  describe("spawnSyncLog", () => {
    function createRealUpdater(): DebUpdater {
      const realUpdater = new DebUpdater(null, stubApp)
      realUpdater.logger = { info() {}, warn() {}, error() {} }
      vi.mocked(spawnSync).mockClear()
      return realUpdater
    }

    it("passes the shell one command line, as Node would have joined it, so that DEP0190 does not apply", () => {
      const realUpdater = createRealUpdater()
      const node = `"${process.execPath}"`
      expect((realUpdater as any).spawnSyncLog(node, ["-e", `"process.stdout.write('a  b')"`])).toBe("a  b")
      expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(`${node} -e "process.stdout.write('a  b')"`, [], expect.objectContaining({ shell: true }))
    })

    it("passes the arguments as argv without a shell, so nothing in them is interpreted", () => {
      const realUpdater = createRealUpdater()
      const script = "process.stdout.write(process.argv.slice(1).join('|'))"
      expect((realUpdater as any).spawnSyncLog(process.execPath, ["-e", script, "a b", "$HOME", "'q'"], {}, false)).toBe("a b|$HOME|'q'")
      expect(vi.mocked(spawnSync)).toHaveBeenCalledWith(process.execPath, ["-e", script, "a b", "$HOME", "'q'"], expect.objectContaining({ shell: false }))
    })

    it("fails when the command is killed by a signal", () => {
      const realUpdater = createRealUpdater()
      expect(() => (realUpdater as any).spawnSyncLog(process.execPath, ["-e", "process.kill(process.pid, 'SIGTERM')"], {}, false)).toThrow(/exited with code null, signal SIGTERM$/)
    })
  })

  describe("install plans", () => {
    const pacmanPlan = PacmanUpdater.planInstall("/tmp/u.pacman")

    function failingRunner(failing: (command: string[], index: number) => boolean) {
      const calls: string[][] = []
      const runner = (command: string[]) => {
        calls.push(command)
        if (failing(command, calls.length - 1)) {
          throw new Error(`${command[0]} failed`)
        }
      }
      return { calls, runner }
    }

    it("does not run the recovery chain when the command succeeds", () => {
      const { calls, runner } = failingRunner(() => false)
      runInstallPlan(pacmanPlan, runner, new NoOpLogger())
      expect(calls).toEqual([["pacman", "-U", "--noconfirm", "/tmp/u.pacman"]])
    })

    it("runs the recovery chain in order after a failure and logs why", () => {
      const warnings: string[] = []
      const { calls, runner } = failingRunner((_command, index) => index === 0)
      runInstallPlan(pacmanPlan, runner, { info() {}, warn: (m?: any) => warnings.push(String(m)), error() {} })
      expect(calls).toEqual([
        ["pacman", "-U", "--noconfirm", "/tmp/u.pacman"],
        ["pacman", "-Sy", "--noconfirm"],
        ["pacman", "-U", "--noconfirm", "/tmp/u.pacman"],
      ])
      expect(warnings).toEqual(["pacman failed", "pacman installation failed, attempting to update package database and retry"])
    })

    it("fails with the recovery step's error and skips the rest of the chain", () => {
      const errors: string[] = []
      const { calls, runner } = failingRunner((_command, index) => index <= 1)
      expect(() => runInstallPlan(pacmanPlan, runner, { info() {}, warn() {}, error: (m?: any) => errors.push(String(m)) })).toThrow("pacman failed")
      expect(calls).toHaveLength(2)
      expect(errors).toEqual(["Recovery after pacman failed"])
    })

    it("fails with the command's error when the plan has no recovery chain", () => {
      const { runner } = failingRunner(() => true)
      expect(() => runInstallPlan({ execCommand: ["zypper", "install"] }, runner, new NoOpLogger())).toThrow("zypper failed")
    })

    it("recovers even when the logger throws", () => {
      const throwing = () => {
        throw new Error("logger failure")
      }
      const { calls, runner } = failingRunner((_command, index) => index === 0)
      runInstallPlan(pacmanPlan, runner, { info: throwing, warn: throwing, error: throwing })
      expect(calls).toHaveLength(3)
    })

    it("runs the same commands asynchronously as synchronously", async () => {
      const failFirst = (_command: string[], index: number) => index === 0
      const sync = failingRunner(failFirst)
      runInstallPlan(pacmanPlan, sync.runner, new NoOpLogger())

      const asyncCalls: string[][] = []
      await runInstallPlanAsync(
        pacmanPlan,
        command => {
          asyncCalls.push(command)
          return failFirst(command, asyncCalls.length - 1) ? Promise.reject(new Error("failed")) : Promise.resolve()
        },
        new NoOpLogger()
      )
      expect(asyncCalls).toEqual(sync.calls)
    })

    it("fails asynchronously with the recovery step's error", async () => {
      await expect(
        runInstallPlanAsync(DebUpdater.planInstall("dpkg", "/tmp/u.deb", new NoOpLogger()), command => Promise.reject(new Error(`${command[0]} failed`)), new NoOpLogger())
      ).rejects.toThrow("apt-get failed")
    })
  })

  describe("resolveElevation app name handling", () => {
    beforeEach(() => {
      vi.spyOn(updater as any, "isRunningAsRoot").mockReturnValue(false)
    })

    it("strips double-quote from app name so it cannot break shell quoting", () => {
      ;(updater as any).app = { ...stubApp, name: 'Evil"App' }
      const sudoWithArgsSpy = vi.spyOn(updater as any, "sudoWithArgs")
      ;(updater as any).resolveElevation()
      const installComment = sudoWithArgsSpy.mock.calls[0][0] as string
      // Only the two wrapping double-quotes from the template should remain
      expect((installComment.match(/"/g) ?? []).length).toBe(2)
      expect(installComment).toContain("EvilApp")
    })

    it("strips backtick from app name to prevent command substitution", () => {
      ;(updater as any).app = { ...stubApp, name: "Evil`whoami`App" }
      const sudoWithArgsSpy = vi.spyOn(updater as any, "sudoWithArgs")
      ;(updater as any).resolveElevation()
      const installComment = sudoWithArgsSpy.mock.calls[0][0] as string
      expect(installComment).not.toContain("`")
    })

    it("strips dollar sign from app name to prevent variable expansion", () => {
      ;(updater as any).app = { ...stubApp, name: "Evil$HOMEApp" }
      const sudoWithArgsSpy = vi.spyOn(updater as any, "sudoWithArgs")
      ;(updater as any).resolveElevation()
      const installComment = sudoWithArgsSpy.mock.calls[0][0] as string
      expect(installComment).not.toContain("$")
    })

    it("preserves benign characters in app name", () => {
      ;(updater as any).app = { ...stubApp, name: "My App 2.0" }
      const sudoWithArgsSpy = vi.spyOn(updater as any, "sudoWithArgs")
      ;(updater as any).resolveElevation()
      const installComment = sudoWithArgsSpy.mock.calls[0][0] as string
      expect(installComment).toContain("My App 2.0")
    })
  })
})

describe("Linux package signature-verification gating", () => {
  const noopLogger = new NoOpLogger()

  function capture() {
    const calls: string[][] = []
    return { runner: (args: string[]) => calls.push(args), calls }
  }

  function captureWarnings() {
    const warnings: string[] = []
    return { warnings, logger: { info() {}, warn: (m?: any) => warnings.push(String(m)), error() {} } }
  }

  it("AppUpdater defaults allowUnverifiedLinuxPackages to true (electron-builder does not sign Linux packages)", () => {
    expect(new DebUpdater(null, stubApp).allowUnverifiedLinuxPackages).toBe(true)
  })

  describe("DebUpdater apt branch", () => {
    it("omits --allow-unauthenticated when verification is enforced (allowUnverified=false)", () => {
      const { runner, calls } = capture()
      DebUpdater.installWithCommandRunner("apt", "/tmp/u.deb", runner, noopLogger, false)
      expect(calls[0]).toEqual(["apt", "install", "-y", "--allow-downgrades", "--allow-change-held-packages", "/tmp/u.deb"])
    })

    it("includes --allow-unauthenticated when opted in", () => {
      const { runner, calls } = capture()
      DebUpdater.installWithCommandRunner("apt", "/tmp/u.deb", runner, noopLogger, true)
      expect(calls[0]).toEqual(["apt", "install", "-y", "--allow-unauthenticated", "--allow-downgrades", "--allow-change-held-packages", "/tmp/u.deb"])
    })

    it("defaults allowUnverified to true when the argument is omitted (6.x call-site compatibility)", () => {
      const { runner, calls } = capture()
      DebUpdater.installWithCommandRunner("apt", "/tmp/u.deb", runner, noopLogger)
      expect(calls[0]).toContain("--allow-unauthenticated")
    })
  })

  describe("DebUpdater dpkg branch", () => {
    it.each([true, false])("installs with dpkg -i and falls back to apt-get -f on failure (allowUnverified=%s)", allow => {
      const calls: string[][] = []
      const runner = (args: string[]) => {
        calls.push(args)
        if (calls.length === 1) {
          throw new Error("simulated dpkg failure")
        }
      }
      DebUpdater.installWithCommandRunner("dpkg", "/tmp/u.deb", runner, noopLogger, allow)
      expect(calls[0]).toEqual(["dpkg", "-i", "/tmp/u.deb"])
      expect(calls[1]).toEqual(["apt-get", "install", "-f", "-y"])
    })

    it("warns that enforcement has no effect for dpkg when allowUnverified=false", () => {
      const { warnings, logger } = captureWarnings()
      const { runner } = capture()
      DebUpdater.installWithCommandRunner("dpkg", "/tmp/u.deb", runner, logger, false)
      expect(warnings.some(m => m.includes("has no effect"))).toBe(true)
    })
  })

  describe("RpmUpdater", () => {
    it("zypper omits --allow-unsigned-rpm when verification is enforced (allowUnverified=false)", () => {
      const { runner, calls } = capture()
      RpmUpdater.installWithCommandRunner("zypper", "/tmp/u.rpm", runner, noopLogger, false)
      expect(calls[0]).toEqual(["zypper", "--non-interactive", "--no-refresh", "install", "-f", "/tmp/u.rpm"])
    })

    it("zypper includes --allow-unsigned-rpm when opted in", () => {
      const { runner, calls } = capture()
      RpmUpdater.installWithCommandRunner("zypper", "/tmp/u.rpm", runner, noopLogger, true)
      expect(calls[0]).toEqual(["zypper", "--non-interactive", "--no-refresh", "install", "--allow-unsigned-rpm", "-f", "/tmp/u.rpm"])
    })

    it.each(["dnf", "yum"] as const)("%s enforces local-package GPG checking via --setopt=localpkg_gpgcheck=1 (allowUnverified=false)", pm => {
      const { runner, calls } = capture()
      RpmUpdater.installWithCommandRunner(pm, "/tmp/u.rpm", runner, noopLogger, false)
      expect(calls[0]).toEqual([pm, "install", "--setopt=localpkg_gpgcheck=1", "-y", "/tmp/u.rpm"])
    })

    it.each(["dnf", "yum"] as const)("%s includes --nogpgcheck when opted in", pm => {
      const { runner, calls } = capture()
      RpmUpdater.installWithCommandRunner(pm, "/tmp/u.rpm", runner, noopLogger, true)
      expect(calls[0]).toEqual([pm, "install", "--nogpgcheck", "-y", "/tmp/u.rpm"])
    })

    it("rpm fallback command is unchanged regardless of opt-in (--nodeps is a dependency bypass, not a signature bypass)", () => {
      const expected = ["rpm", "-Uvh", "--replacepkgs", "--replacefiles", "--nodeps", "/tmp/u.rpm"]
      const secure = capture()
      RpmUpdater.installWithCommandRunner("rpm", "/tmp/u.rpm", secure.runner, noopLogger, false)
      expect(secure.calls[0]).toEqual(expected)
      const opted = capture()
      RpmUpdater.installWithCommandRunner("rpm", "/tmp/u.rpm", opted.runner, noopLogger, true)
      expect(opted.calls[0]).toEqual(expected)
    })

    it("rpm fallback warns that enforcement cannot be applied via the CLI when allowUnverified=false", () => {
      const { warnings, logger } = captureWarnings()
      const { runner } = capture()
      RpmUpdater.installWithCommandRunner("rpm", "/tmp/u.rpm", runner, logger, false)
      expect(warnings.some(m => m.includes("cannot be enforced"))).toBe(true)
    })
  })

  describe("doInstall wiring of allowUnverifiedLinuxPackages", () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    // Stubs everything below installWithCommandRunner so doInstall drives the real dispatch
    // and we can assert that this.allowUnverifiedLinuxPackages is threaded through.
    function stubForDoInstall(updater: DebUpdater | RpmUpdater, packageManager: string, file: string): string[][] {
      updater.logger = new NoOpLogger()
      ;(updater as any).downloadedUpdateHelper = { file }
      vi.spyOn(updater as any, "spawnSyncLog").mockReturnValue("")
      vi.spyOn(updater as any, "hasCommand").mockReturnValue(true)
      vi.spyOn(updater as any, "detectPackageManager").mockReturnValue(packageManager)
      const commands: string[][] = []
      vi.spyOn(updater as any, "runCommandWithSudoIfNeeded").mockImplementation((...args: unknown[]) => {
        commands.push(args[0] as string[])
      })
      return commands
    }

    it.each([true, false])("DebUpdater.doInstall threads allowUnverifiedLinuxPackages=%s into the apt command", allow => {
      const updater = new DebUpdater(null, stubApp)
      updater.allowUnverifiedLinuxPackages = allow
      const commands = stubForDoInstall(updater, "apt", "/tmp/u.deb")
      expect((updater as any).doInstall({ isSilent: false, isForceRunAfter: false, isAdminRightsRequired: false })).toBe(true)
      expect(commands[0]).toEqual(["apt", "install", "-y", ...(allow ? ["--allow-unauthenticated"] : []), "--allow-downgrades", "--allow-change-held-packages", "/tmp/u.deb"])
    })

    it.each([true, false])("RpmUpdater.doInstall threads allowUnverifiedLinuxPackages=%s into the zypper command", allow => {
      const updater = new RpmUpdater(null, stubApp)
      updater.allowUnverifiedLinuxPackages = allow
      const commands = stubForDoInstall(updater, "zypper", "/tmp/u.rpm")
      expect((updater as any).doInstall({ isSilent: false, isForceRunAfter: false, isAdminRightsRequired: false })).toBe(true)
      expect(commands[0]).toEqual(["zypper", "--non-interactive", "--no-refresh", "install", ...(allow ? ["--allow-unsigned-rpm"] : []), "-f", "/tmp/u.rpm"])
    })
  })
})
