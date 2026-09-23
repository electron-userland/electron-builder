import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DebUpdater, NoOpLogger, RpmUpdater } from "electron-updater"
import type { AppAdapter } from "electron-updater/src/AppAdapter"

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

describe("LinuxUpdater unit tests", { sequential: true }, () => {
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

  describe("runCommandWithSudoIfNeeded app name handling", () => {
    beforeEach(() => {
      vi.spyOn(updater as any, "isRunningAsRoot").mockReturnValue(false)
    })

    it("strips double-quote from app name so it cannot break shell quoting", () => {
      ;(updater as any).app = { ...stubApp, name: 'Evil"App' }
      const sudoWithArgsSpy = vi.spyOn(updater as any, "sudoWithArgs")
      ;(updater as any).runCommandWithSudoIfNeeded(["dpkg", "-i", "/tmp/test.deb"])
      const installComment = sudoWithArgsSpy.mock.calls[0][0] as string
      // Only the two wrapping double-quotes from the template should remain
      expect((installComment.match(/"/g) ?? []).length).toBe(2)
      expect(installComment).toContain("EvilApp")
    })

    it("strips backtick from app name to prevent command substitution", () => {
      ;(updater as any).app = { ...stubApp, name: "Evil`whoami`App" }
      const sudoWithArgsSpy = vi.spyOn(updater as any, "sudoWithArgs")
      ;(updater as any).runCommandWithSudoIfNeeded(["dpkg", "-i", "/tmp/test.deb"])
      const installComment = sudoWithArgsSpy.mock.calls[0][0] as string
      expect(installComment).not.toContain("`")
    })

    it("strips dollar sign from app name to prevent variable expansion", () => {
      ;(updater as any).app = { ...stubApp, name: "Evil$HOMEApp" }
      const sudoWithArgsSpy = vi.spyOn(updater as any, "sudoWithArgs")
      ;(updater as any).runCommandWithSudoIfNeeded(["dpkg", "-i", "/tmp/test.deb"])
      const installComment = sudoWithArgsSpy.mock.calls[0][0] as string
      expect(installComment).not.toContain("$")
    })

    it("preserves benign characters in app name", () => {
      ;(updater as any).app = { ...stubApp, name: "My App 2.0" }
      const sudoWithArgsSpy = vi.spyOn(updater as any, "sudoWithArgs")
      ;(updater as any).runCommandWithSudoIfNeeded(["dpkg", "-i", "/tmp/test.deb"])
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
