import { ParallelsVmManager } from "app-builder-lib/src/vm/ParallelsVm.js"
import { PwshVmManager } from "app-builder-lib/src/vm/PwshVm.js"
import { streamSpawnToFile } from "app-builder-lib/src/util/streamSpawnToFile.js"
import {
  findExecutable,
  findHostPwsh,
  findHostWine,
  findPrlctl,
  HOST_PWSH_PATHS,
  PARALLELS_GUEST_PWSH,
  PARALLELS_GUEST_WINDOWS_POWERSHELL,
  PRLCTL_PATHS,
  windowsPowerShellPath,
  windowsPwshPath,
} from "app-builder-lib/src/util/systemTools.js"
import { getWindowsVm, VmManager } from "app-builder-lib/src/vm/vm.js"
import { DebugLogger, exec, InvalidConfigurationError, log } from "builder-util"
import { spawn } from "child_process"
import { promises as fs } from "fs"
import * as path from "path"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// System tools are started by absolute path; `exec` and `spawn` are mocked so nothing is ever started.
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn<typeof actual.exec>() }
})
vi.mock("child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("child_process")>()
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() }
})
vi.mock("app-builder-lib/src/util/systemTools.js", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/systemTools.js")>()
  return { ...actual, findHostPwsh: vi.fn(actual.findHostPwsh), findHostWine: vi.fn(actual.findHostWine), findPrlctl: vi.fn(actual.findPrlctl) }
})

const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
const PWSH = "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
const NOT_ABSOLUTE = ["Windows", "\\Windows", "C:Windows", "\\\\server\\share\\Windows", "//server/share/Windows"]

const originalPlatform = process.platform
function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true })
}

function executedFiles(): string[] {
  return vi.mocked(exec).mock.calls.map(call => call[0])
}

beforeEach(() => {
  vi.mocked(exec).mockReset()
  vi.mocked(findHostPwsh).mockReset().mockReturnValue(null)
  vi.mocked(findPrlctl).mockReset().mockReturnValue(null)
  vi.mocked(findHostWine).mockReset().mockReturnValue(null)
  vi.mocked(spawn).mockReset()
  vi.stubEnv("SystemRoot", "C:\\Windows")
  vi.stubEnv("windir", "")
  vi.stubEnv("ProgramFiles", "C:\\Program Files")
})

afterEach(() => {
  setPlatform(originalPlatform)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("windowsPowerShellPath", () => {
  test("is derived from a drive-absolute SystemRoot, falling back to windir", ({ expect }) => {
    expect(windowsPowerShellPath()).toBe(POWERSHELL)
    vi.stubEnv("SystemRoot", "D:/Win")
    expect(windowsPowerShellPath()).toBe("D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
    vi.stubEnv("SystemRoot", "")
    vi.stubEnv("windir", "E:\\Windows")
    expect(windowsPowerShellPath()).toBe("E:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
  })

  test("refuses a SystemRoot that is missing, relative, drive-relative or UNC", ({ expect }) => {
    vi.stubEnv("SystemRoot", "")
    expect(() => windowsPowerShellPath()).toThrow("cannot locate Windows PowerShell: SystemRoot is not set")
    for (const value of NOT_ABSOLUTE) {
      vi.stubEnv("SystemRoot", value)
      expect(() => windowsPowerShellPath()).toThrow(`SystemRoot is not an absolute path (${value})`)
    }
  })
})

describe("windowsPwshPath", () => {
  test("is derived from a drive-absolute ProgramFiles", ({ expect }) => {
    expect(windowsPwshPath()).toEqual({ path: PWSH })
  })

  test("refuses a ProgramFiles that is missing, relative, drive-relative or UNC", ({ expect }) => {
    vi.stubEnv("ProgramFiles", "")
    expect(windowsPwshPath()).toEqual({ error: "ProgramFiles is not set" })
    for (const value of NOT_ABSOLUTE) {
      vi.stubEnv("ProgramFiles", value)
      expect(windowsPwshPath()).toEqual({ error: `ProgramFiles is not an absolute path (${value})` })
    }
  })
})

describe("findExecutable", () => {
  test.skipIf(process.platform === "win32")("returns the first candidate that is an executable file", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "find-executable" })
    await fs.mkdir(dir, { recursive: true })
    const plain = path.join(dir, "plain")
    const tool = path.join(dir, "tool")
    await fs.writeFile(plain, "")
    await fs.writeFile(tool, "", { mode: 0o755 })
    expect(findExecutable([path.join(dir, "missing"), plain, tool])).toBe(tool)
    expect(findExecutable([path.join(dir, "missing"), plain])).toBeNull()
  })

  test("only looks for pwsh and prlctl at their install locations", ({ expect }) => {
    for (const candidate of [...PRLCTL_PATHS, ...Object.values(HOST_PWSH_PATHS).flat()]) {
      expect(path.posix.isAbsolute(candidate)).toBe(true)
    }
  })
})

describe("VmManager.powershellCommand", () => {
  test("uses PowerShell 7 by absolute path when it runs from its install location", async ({ expect }) => {
    vi.mocked(exec).mockResolvedValue("")
    expect(await new VmManager().powershellCommand.value).toBe(PWSH)
    expect(executedFiles()).toEqual([PWSH])
  })

  test("falls back to Windows PowerShell by absolute path, with a warning stating the rule", async ({ expect }) => {
    const warn = vi.spyOn(log, "warn")
    vi.mocked(exec).mockRejectedValue(new Error("spawn ENOENT"))
    expect(await new VmManager().powershellCommand.value).toBe(POWERSHELL)
    expect(executedFiles()).toEqual([PWSH])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][1]).toContain("%ProgramFiles%\\PowerShell\\7\\pwsh.exe")
  })

  test("does not probe PowerShell 7 when ProgramFiles is not absolute", async ({ expect }) => {
    vi.spyOn(log, "warn")
    vi.stubEnv("ProgramFiles", "Program Files")
    expect(await new VmManager().powershellCommand.value).toBe(POWERSHELL)
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })

  test("rejects without running anything when SystemRoot is not absolute", async ({ expect }) => {
    vi.stubEnv("SystemRoot", "\\\\server\\share")
    await expect(new VmManager().powershellCommand.value).rejects.toThrow("cannot locate Windows PowerShell")
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })

  test("uses the default Windows install locations inside a Parallels guest, through prlctl by absolute path", async ({ expect }) => {
    const prlctl = PRLCTL_PATHS[0]
    vi.mocked(findPrlctl).mockReturnValue(prlctl)
    vi.mocked(exec).mockRejectedValueOnce(new Error("not installed"))
    vi.spyOn(log, "warn")
    const vm = new ParallelsVmManager({ id: "{win}", name: "win", os: "win-11", state: "running" })
    expect(await vm.powershellCommand.value).toBe(PARALLELS_GUEST_WINDOWS_POWERSHELL)
    expect(executedFiles()).toEqual([prlctl])
    expect(vi.mocked(exec).mock.calls[0][1]).toEqual(["exec", "{win}", "--current-user", PARALLELS_GUEST_PWSH, "-NoProfile", "-NonInteractive", "-Command", "exit 0"])
  })
})

describe("PwshVmManager.powershellCommand", () => {
  test("uses pwsh from its install location", async ({ expect }) => {
    vi.mocked(findHostPwsh).mockReturnValue("/opt/microsoft/powershell/7/pwsh")
    expect(await new PwshVmManager().powershellCommand.value).toBe("/opt/microsoft/powershell/7/pwsh")
  })

  test("is a configuration error when pwsh is not at its install location", async ({ expect }) => {
    setPlatform("linux")
    const result = new PwshVmManager().powershellCommand.value
    await expect(result).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(result).rejects.toThrow("/opt/microsoft/powershell/7/pwsh, /snap/bin/pwsh")
  })
})

describe("getWindowsVm", () => {
  test.for<NodeJS.Platform>(["darwin", "linux"])(
    "is a configuration error on %s without running pwsh or prlctl by name when neither is installed",
    async (platform, { expect }) => {
      setPlatform(platform)
      await expect(getWindowsVm(new DebugLogger(false))).rejects.toBeInstanceOf(InvalidConfigurationError)
      expect(vi.mocked(exec)).not.toHaveBeenCalled()
    }
  )

  test("never runs a bare pwsh, powershell, prlctl or wine", async ({ expect }) => {
    setPlatform("darwin")
    vi.mocked(findHostPwsh).mockReturnValue(HOST_PWSH_PATHS.darwin?.[0] ?? null)
    vi.mocked(findHostWine).mockReturnValue("/opt/homebrew/bin/wine")
    vi.mocked(exec).mockResolvedValue("")
    const vm = await getWindowsVm(new DebugLogger(false))
    expect(vm).toBeInstanceOf(PwshVmManager)
    await vm.powershellCommand.value
    expect(executedFiles().filter(file => !path.isAbsolute(file))).toEqual([])
  })

  test("counts an explicitly configured wine as available without running it", async ({ expect }) => {
    setPlatform("linux")
    vi.mocked(findHostPwsh).mockReturnValue("/opt/microsoft/powershell/7/pwsh")
    expect(await getWindowsVm(new DebugLogger(false), { path: "/opt/my-wine/bin/wine" })).toBeInstanceOf(PwshVmManager)
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })
})

describe("streamSpawnToFile on Windows", () => {
  test("wraps the command in Windows PowerShell started by absolute path", async ({ expect, tmpDir }) => {
    setPlatform("win32")
    const dir = await tmpDir.getTempDir({ prefix: "stream-spawn" })
    await fs.mkdir(dir, { recursive: true })
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error("not started")
    })
    await expect(streamSpawnToFile("npm", ["list"], dir, path.join(dir, "out.json"), {})).rejects.toThrow("not started")
    expect(vi.mocked(spawn).mock.calls.map(call => call[0])).toEqual([POWERSHELL])
  })

  test("rejects without starting anything when SystemRoot is not absolute", async ({ expect, tmpDir }) => {
    setPlatform("win32")
    vi.stubEnv("SystemRoot", "Windows")
    const dir = await tmpDir.getTempDir({ prefix: "stream-spawn" })
    await expect(streamSpawnToFile("npm", ["list"], dir, path.join(dir, "out.json"), {})).rejects.toThrow("SystemRoot is not an absolute path (Windows)")
    expect(vi.mocked(spawn)).not.toHaveBeenCalled()
  })
})
