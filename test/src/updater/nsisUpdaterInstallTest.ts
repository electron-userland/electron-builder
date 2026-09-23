import { EventEmitter } from "events"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

vi.mock("child_process", async importOriginal => {
  const mod = await importOriginal<typeof import("child_process")>()
  return { ...mod, spawn: vi.fn() }
})

import { spawn } from "child_process"
import { NsisUpdater } from "electron-updater"
import { buildElevatedInstallerInvocation, buildElevatedInstallerScript, quoteWin32CommandLineArg, UAC_CANCELLED_EXIT_CODE } from "electron-updater/src/windowsElevation"
import { buildPowerShellArgs, decodePowerShellEncodedCommand, getWindowsPowerShellPath } from "electron-updater/src/windowsPowerShell"
import { createNsisUpdater } from "../helpers/updaterTestUtil"

const INSTALLER_PATH = "C:\\Users\\me\\AppData\\Local\\test-updater-app\\pending\\installer.exe"
const RESOURCES_PATH = "C:\\Program Files\\Test App\\resources"
const EXPECTED_POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
const ELEVATION_TIMEOUT_MS = 5 * 60 * 1000

// stand-in for the powershell.exe ChildProcess: the production code only listens for `exit`/`error` and calls `kill`
class FakeChildProcess extends EventEmitter {
  readonly pid = 4242
  readonly kill = vi.fn(() => true)
  readonly unref = vi.fn()
}

const spawnMock = vi.mocked(spawn)

function mockSpawn(): FakeChildProcess {
  const child = new FakeChildProcess()
  spawnMock.mockReturnValue(child as any)
  return child
}

// lets the spawn call inside doInstall happen before the fake child reports
const nextTick = () => new Promise<void>(resolve => setImmediate(resolve))

describe("windowsElevation script building", () => {
  const originalSystemRoot = process.env.SystemRoot

  afterEach(() => {
    if (originalSystemRoot == null) {
      delete process.env.SystemRoot
    } else {
      process.env.SystemRoot = originalSystemRoot
    }
  })

  test("getWindowsPowerShellPath is the absolute System32 path derived from SystemRoot", ({ expect }) => {
    process.env.SystemRoot = "D:\\Win"
    expect(getWindowsPowerShellPath()).toBe("D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
    delete process.env.SystemRoot
    expect(getWindowsPowerShellPath()).toBe(EXPECTED_POWERSHELL)
  })

  test("quoteWin32CommandLineArg matches Node's spawn quoting", ({ expect }) => {
    expect(quoteWin32CommandLineArg("--updated")).toBe("--updated")
    expect(quoteWin32CommandLineArg("/D=C:\\Apps\\MyApp")).toBe("/D=C:\\Apps\\MyApp")
    expect(quoteWin32CommandLineArg("")).toBe('""')
    expect(quoteWin32CommandLineArg("/D=C:\\Program Files\\My App")).toBe('"/D=C:\\Program Files\\My App"')
    // a trailing backslash must not escape the closing quote
    expect(quoteWin32CommandLineArg("C:\\Program Files\\")).toBe('"C:\\Program Files\\\\"')
    // embedded double quotes are escaped, backslashes before them doubled
    expect(quoteWin32CommandLineArg('say "hi"')).toBe('"say \\"hi\\""')
    expect(quoteWin32CommandLineArg('a\\"b')).toBe('"a\\\\\\"b"')
  })

  test("script starts the installer via Start-Process -Verb RunAs and maps the outcome to exit codes", ({ expect }) => {
    const script = buildElevatedInstallerScript(INSTALLER_PATH, ["--updated", "/S", "--force-run"])
    expect(script).toMatchSnapshot()
    expect(script).toContain(`-FilePath '${INSTALLER_PATH}'`)
    expect(script).toContain("-ArgumentList @('--updated', '/S', '--force-run') -Verb RunAs -ErrorAction Stop")
    expect(script).toContain(`exit ${UAC_CANCELLED_EXIT_CODE}`)
    expect(script.trimEnd().endsWith("exit 0")).toBe(true)
  })

  test("installer args containing spaces arrive as a single token (Win32 double quotes inside the PS literal)", ({ expect }) => {
    const script = buildElevatedInstallerScript(INSTALLER_PATH, ["--updated", "/D=C:\\Program Files\\My App"])
    expect(script).toContain(`-ArgumentList @('--updated', '"/D=C:\\Program Files\\My App"')`)
  })

  test("single quotes (plain and Unicode) are doubled for the PowerShell literals", ({ expect }) => {
    const script = buildElevatedInstallerScript("C:\\Users\\D’Andre\\it's.exe", ["--package-file=C:\\Users\\D'Andre\\pkg.7z"])
    expect(script).toContain(`-FilePath 'C:\\Users\\D’’Andre\\it''s.exe'`)
    expect(script).toContain(`@('--package-file=C:\\Users\\D''Andre\\pkg.7z')`)
  })

  test("-ArgumentList is omitted when there are no installer args", ({ expect }) => {
    expect(buildElevatedInstallerScript(INSTALLER_PATH, [])).toContain(`-FilePath '${INSTALLER_PATH}' -Verb RunAs`)
    expect(buildElevatedInstallerScript(INSTALLER_PATH, [])).not.toContain("-ArgumentList")
  })

  test("invocation uses the hardened powershell.exe arguments and strips PSModulePath from the env", ({ expect }) => {
    const originalPsModulePath = process.env.PSModulePath
    process.env.PSModulePath = "C:\\FakeUserModules"
    ;(process.env as any).PSMODULEPATH = "C:\\OtherCasing"
    try {
      const invocation = buildElevatedInstallerInvocation(INSTALLER_PATH, ["--updated", "/S"])
      expect(invocation.file).toBe(getWindowsPowerShellPath())
      const encodedIndex = invocation.args.indexOf("-EncodedCommand")
      expect(invocation.args.slice(0, encodedIndex + 1)).toMatchSnapshot()
      expect(invocation.args).toHaveLength(encodedIndex + 2)

      const script = decodePowerShellEncodedCommand(invocation.args)!
      // prelude: progress suppressed → Management module imported from $PSHOME → PSModulePath cleared → the trampoline
      expect(script).toMatchSnapshot()
      expect(script.indexOf("$ProgressPreference = 'SilentlyContinue'")).toBeLessThan(script.indexOf(`Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Management"`))
      expect(script.indexOf("Import-Module")).toBeLessThan(script.indexOf(`$env:PSModulePath = ""`))
      expect(script.endsWith(buildElevatedInstallerScript(INSTALLER_PATH, ["--updated", "/S"]))).toBe(true)

      expect(Object.keys(invocation.env).filter(it => it.toLowerCase() === "psmodulepath")).toEqual([])
    } finally {
      delete (process.env as any).PSMODULEPATH
      if (originalPsModulePath == null) {
        delete process.env.PSModulePath
      } else {
        process.env.PSModulePath = originalPsModulePath
      }
    }
  })
})

describe("NsisUpdater.doInstall elevation", () => {
  beforeEach(() => {
    // process.resourcesPath is Electron-specific; stub it for the Node test environment
    Object.defineProperty(process, "resourcesPath", { value: RESOURCES_PATH, writable: true, configurable: true })
    spawnMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.defineProperty(process, "resourcesPath", { value: undefined, writable: true, configurable: true })
  })

  async function createUpdater() {
    const updater = await createNsisUpdater()
    vi.spyOn(updater as any, "installerPath", "get").mockReturnValue(INSTALLER_PATH)
    const spawnLog = vi.spyOn(updater as any, "spawnLog").mockResolvedValue(true)
    const errors: Array<NodeJS.ErrnoException> = []
    updater.on("error", e => errors.push(e))
    return { updater, spawnLog, errors }
  }

  const elevatedInstall = (updater: NsisUpdater, isAppQuitting = false) =>
    (updater as any).doInstall({ isSilent: true, isForceRunAfter: false, isAdminRightsRequired: true, isAppQuitting }) as boolean | Promise<boolean>

  test("spawns the PowerShell trampoline (absolute path, not detached, hidden) and reports success on exit 0", async ({ expect }) => {
    const { updater, spawnLog, errors } = await createUpdater()
    const child = mockSpawn()

    const result = elevatedInstall(updater)
    expect(result).toBeInstanceOf(Promise)
    expect(spawnMock).toHaveBeenCalledOnce()
    const [file, args, options] = spawnMock.mock.calls[0] as unknown as [string, Array<string>, any]
    expect(file).toBe(getWindowsPowerShellPath())
    expect(options).toMatchObject({ stdio: "ignore", windowsHide: true })
    expect(options.detached).toBeUndefined()
    expect(Object.keys(options.env).filter((it: string) => it.toLowerCase() === "psmodulepath")).toEqual([])
    expect(args).toEqual(buildElevatedInstallerInvocation(INSTALLER_PATH, ["--updated", "/S"]).args)

    child.emit("exit", 0, null)
    await expect(result).resolves.toBe(true)
    expect(spawnLog).not.toHaveBeenCalled()
    expect(errors).toEqual([])
  })

  test("declined UAC prompt (exit 1223) dispatches an error and does not fall back to elevate.exe", async ({ expect }) => {
    const { updater, spawnLog, errors } = await createUpdater()
    const child = mockSpawn()

    const result = elevatedInstall(updater)
    child.emit("exit", UAC_CANCELLED_EXIT_CODE, null)
    await expect(result).resolves.toBe(false)

    expect(spawnLog).not.toHaveBeenCalled()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe("ERR_UPDATER_ELEVATION_CANCELLED")
    expect(errors[0].message).toContain("UAC")
  })

  test("any other PowerShell exit code falls back to the bundled elevate.exe", async ({ expect }) => {
    const { updater, spawnLog, errors } = await createUpdater()
    const child = mockSpawn()

    const result = elevatedInstall(updater)
    child.emit("exit", 1, null)
    await expect(result).resolves.toBe(true)

    expect(spawnLog).toHaveBeenCalledOnce()
    expect(spawnLog).toHaveBeenCalledWith(path.join(RESOURCES_PATH, "elevate.exe"), [INSTALLER_PATH, "--updated", "/S"])
    expect(errors).toEqual([])
  })

  test("a spawn error (powershell.exe missing) falls back to elevate.exe", async ({ expect }) => {
    const { updater, spawnLog } = await createUpdater()
    const child = mockSpawn()

    const result = elevatedInstall(updater)
    child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }))
    await expect(result).resolves.toBe(true)

    expect(spawnLog).toHaveBeenCalledWith(path.join(RESOURCES_PATH, "elevate.exe"), [INSTALLER_PATH, "--updated", "/S"])
  })

  test("a synchronously throwing spawn falls back to elevate.exe", async ({ expect }) => {
    const { updater, spawnLog } = await createUpdater()
    spawnMock.mockImplementation(() => {
      throw Object.assign(new Error("spawn EACCES"), { code: "EACCES" })
    })

    await expect(elevatedInstall(updater)).resolves.toBe(true)
    expect(spawnLog).toHaveBeenCalledWith(path.join(RESOURCES_PATH, "elevate.exe"), [INSTALLER_PATH, "--updated", "/S"])
  })

  test("a trampoline that never reports is killed after the timeout and elevate.exe is used instead", async ({ expect }) => {
    vi.useFakeTimers()
    const { updater, spawnLog } = await createUpdater()
    const child = mockSpawn()

    const result = elevatedInstall(updater)
    await vi.advanceTimersByTimeAsync(ELEVATION_TIMEOUT_MS - 1)
    expect(child.kill).not.toHaveBeenCalled()
    expect(spawnLog).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(child.kill).toHaveBeenCalledOnce()
    await expect(result).resolves.toBe(true)
    expect(spawnLog).toHaveBeenCalledWith(path.join(RESOURCES_PATH, "elevate.exe"), [INSTALLER_PATH, "--updated", "/S"])

    // the late exit of the killed child must not change the already settled outcome
    child.emit("exit", null, "SIGTERM")
    expect(spawnLog).toHaveBeenCalledOnce()
  })

  test("a failing elevate.exe fallback dispatches the error and reports the install as not started", async ({ expect }) => {
    const { updater, spawnLog, errors } = await createUpdater()
    const child = mockSpawn()
    const elevateError = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })
    spawnLog.mockRejectedValue(elevateError)

    const result = elevatedInstall(updater)
    child.emit("exit", 1, null)
    await expect(result).resolves.toBe(false)
    expect(errors).toEqual([elevateError])
  })

  test("on app quit the trampoline is launched detached via spawnLog (fire-and-forget) and the result is synchronous", async ({ expect }) => {
    const { updater, spawnLog } = await createUpdater()

    expect(elevatedInstall(updater, true)).toBe(true)
    expect(spawnMock).not.toHaveBeenCalled()
    expect(spawnLog).toHaveBeenCalledOnce()
    const expected = buildElevatedInstallerInvocation(INSTALLER_PATH, ["--updated", "/S"])
    const [file, args, env] = spawnLog.mock.calls[0] as unknown as [string, Array<string>, NodeJS.ProcessEnv]
    expect(file).toBe(expected.file)
    expect(args).toEqual(expected.args)
    expect(Object.keys(env).filter(it => it.toLowerCase() === "psmodulepath")).toEqual([])
  })

  test("on app quit a spawn failure of the detached trampoline falls back to elevate.exe", async ({ expect }) => {
    const { updater, spawnLog, errors } = await createUpdater()
    spawnLog.mockRejectedValueOnce(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })).mockResolvedValueOnce(true)

    expect(elevatedInstall(updater, true)).toBe(true)
    await nextTick()
    expect(spawnLog).toHaveBeenCalledTimes(2)
    expect(spawnLog.mock.calls[1]).toEqual([path.join(RESOURCES_PATH, "elevate.exe"), [INSTALLER_PATH, "--updated", "/S"]])
    expect(errors).toEqual([])
  })

  test("per-user install still runs the installer directly and retries with detached elevation on EACCES", async ({ expect }) => {
    const { updater, spawnLog } = await createUpdater()
    spawnLog.mockRejectedValueOnce(Object.assign(new Error("spawn EACCES"), { code: "EACCES" })).mockResolvedValueOnce(true)

    const result = (updater as any).doInstall({ isSilent: false, isForceRunAfter: true, isAdminRightsRequired: false })
    expect(result).toBe(true)
    expect(spawnLog.mock.calls[0]).toEqual([INSTALLER_PATH, ["--updated", "--force-run"]])
    await nextTick()
    expect(spawnLog).toHaveBeenCalledTimes(2)
    expect(spawnLog.mock.calls[1][0]).toBe(getWindowsPowerShellPath())
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test("installDirectory is passed as one /D= token", async ({ expect }) => {
    const { updater } = await createUpdater()
    updater.installDirectory = "C:\\Program Files\\My App"
    const child = mockSpawn()

    const result = elevatedInstall(updater)
    const script = decodePowerShellEncodedCommand((spawnMock.mock.calls[0] as unknown as [string, Array<string>])[1])!
    expect(script).toContain(`'"/D=C:\\Program Files\\My App"'`)
    child.emit("exit", 0, null)
    await expect(result).resolves.toBe(true)
  })

  describe("install() / quitAndInstall() with the awaited elevation", () => {
    async function createInstallableUpdater() {
      const created = await createUpdater()
      ;(created.updater as any).downloadedUpdateHelper = {
        file: INSTALLER_PATH,
        packageFile: null,
        downloadedFileInfo: { isAdminRightsRequired: true },
      }
      const quit = vi.spyOn((created.updater as any).app, "quit")
      return { ...created, quit }
    }

    test("install() returns a Promise for a per-machine install that resolves once the trampoline reported", async ({ expect }) => {
      const { updater } = await createInstallableUpdater()
      const child = mockSpawn()

      const result = updater.install(true, false)
      expect(result).toBeInstanceOf(Promise)
      expect((updater as any).quitAndInstallCalled).toBe(true)
      child.emit("exit", 0, null)
      await expect(result).resolves.toBe(true)
    })

    test("install() called directly resets quitAndInstallCalled when the UAC prompt is declined, so a retry is not ignored", async ({ expect }) => {
      const { updater, errors } = await createInstallableUpdater()
      const warn = vi.spyOn((updater as any)._logger, "warn")
      const child = mockSpawn()

      const result = updater.install(true, false)
      expect((updater as any).quitAndInstallCalled).toBe(true)
      child.emit("exit", UAC_CANCELLED_EXIT_CODE, null)
      await expect(result).resolves.toBe(false)
      expect(errors.map(it => it.code)).toEqual(["ERR_UPDATER_ELEVATION_CANCELLED"])
      expect((updater as any).quitAndInstallCalled).toBe(false)

      // the user accepts the prompt on the second attempt
      const retryChild = mockSpawn()
      const retry = updater.install(true, false)
      expect(spawnMock).toHaveBeenCalledTimes(2)
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("install call ignored"))
      retryChild.emit("exit", 0, null)
      await expect(retry).resolves.toBe(true)
      expect((updater as any).quitAndInstallCalled).toBe(true)
    })

    test("a second install() while the first elevation is still pending is ignored and does not release the latch", async ({ expect }) => {
      const { updater } = await createInstallableUpdater()
      const warn = vi.spyOn((updater as any)._logger, "warn")
      const child = mockSpawn()

      const first = updater.install(true, false)
      expect(updater.install(true, false)).toBe(false)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("install call ignored"))
      expect((updater as any).quitAndInstallCalled).toBe(true)
      expect(spawnMock).toHaveBeenCalledOnce()

      child.emit("exit", 0, null)
      await expect(first).resolves.toBe(true)
      expect((updater as any).quitAndInstallCalled).toBe(true)
    })

    test("quitAndInstall() does not quit and resets quitAndInstallCalled when the UAC prompt is declined", async ({ expect }) => {
      const { updater, quit, errors } = await createInstallableUpdater()
      const child = mockSpawn()

      updater.quitAndInstall({ isSilent: true })
      expect((updater as any).quitAndInstallCalled).toBe(true)
      child.emit("exit", UAC_CANCELLED_EXIT_CODE, null)
      await nextTick()

      expect(errors.map(it => it.code)).toEqual(["ERR_UPDATER_ELEVATION_CANCELLED"])
      expect(quit).not.toHaveBeenCalled()
      expect((updater as any).quitAndInstallCalled).toBe(false)
    })
  })
})

describe.ifWindows("NsisUpdater.doInstall elevation — Windows integration", () => {
  async function realExecFile(file: string, args: Array<string>): Promise<{ stdout: string; code: number }> {
    const { execFile } = await vi.importActual<typeof import("child_process")>("child_process")
    return new Promise(resolve => {
      execFile(file, args, { encoding: "utf8", windowsHide: true }, (error: any, stdout) => resolve({ stdout, code: error == null ? 0 : error.code }))
    })
  }

  test("the hardened invocation runs on this system's Windows PowerShell", async ({ expect }) => {
    const { stdout, code } = await realExecFile(getWindowsPowerShellPath(), buildPowerShellArgs("Write-Output 'elevation-test-ok'", { modules: [] }))
    expect(code).toBe(0)
    expect(stdout.trim()).toBe("elevation-test-ok")
  })

  // counts the parse errors of `script` without executing it. The script is handed to ParseInput as a Base64 (UTF-16LE)
  // payload inside a single-quoted literal: Base64 is alphanumeric, so no PowerShell quoting rules apply to the script's
  // own content (it contains double quotes for the spaced /D= case — a JSON.stringify'd literal is not valid PowerShell).
  async function countParseErrors(script: string): Promise<number> {
    const encodedScript = Buffer.from(script, "utf16le").toString("base64")
    const parseCommand = `$errors = $null; $script = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedScript}')); $null = [System.Management.Automation.Language.Parser]::ParseInput($script, [ref]$null, [ref]$errors); exit $errors.Count`
    const { code } = await realExecFile(getWindowsPowerShellPath(), buildPowerShellArgs(parseCommand, { modules: [] }))
    return code
  }

  test("generated Start-Process script parses without errors (plain args, args with spaces, quotes)", async ({ expect }) => {
    // the check is not vacuous: an unterminated string literal is reported as a parse error
    expect(await countParseErrors("Start-Process -FilePath 'C:\\fake\\installer.exe")).toBeGreaterThan(0)
    for (const args of [["--updated", "/S"], ["--updated", "/D=C:\\Program Files\\My App"], ["--package-file=C:\\Users\\D'Andre\\pkg.7z"], []]) {
      const script = buildElevatedInstallerScript("C:\\fake\\installer.exe", args)
      expect(await countParseErrors(script), `parse errors for args ${JSON.stringify(args)}`).toBe(0)
    }
  })

  test("trampoline reports exit 1 (not 0, not 1223) when the installer does not exist — no UAC prompt is shown", async ({ expect }) => {
    const invocation = buildElevatedInstallerInvocation("C:\\this\\does\\not\\exist\\installer.exe", ["--updated"])
    const { code } = await realExecFile(invocation.file, invocation.args)
    expect(code).toBe(1)
  })
})
