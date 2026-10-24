import { PARALLELS_GUEST_PWSH, PARALLELS_GUEST_WINDOWS_POWERSHELL, ParallelsVmManager } from "app-builder-lib/src/vm/ParallelsVm.js"
import { PwshVmManager } from "app-builder-lib/src/vm/PwshVm.js"
import { streamSpawnToFile } from "app-builder-lib/src/util/streamSpawnToFile.js"
import { defaultExecutableLocations, executableUriToPath } from "builder-util/src/executables"
import { ExecutableName, ExecutablesConfig } from "app-builder-lib"
import { getWindowsVm, VmManager } from "app-builder-lib/src/vm/vm.js"
import { DebugLogger, exec, Executables, InvalidConfigurationError, log } from "builder-util"
import { asArray, Nullish } from "builder-util-runtime"
import { spawn } from "child_process"
import { promises as fs } from "fs"
import * as path from "path"
import { afterEach, beforeEach, describe, ExpectStatic, test, vi } from "vitest"

// Host programs are started by absolute path; `exec` and `spawn` are mocked so nothing is ever started.
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn<typeof actual.exec>() }
})
vi.mock("child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("child_process")>()
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() }
})

const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
const PWSH = "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
const PRLCTL = "/Applications/Parallels Desktop.app/Contents/MacOS/prlctl"

const originalPlatform = process.platform
function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: p, configurable: true })
}

let installed = new Set<string>()

// The resolver's rule (the configured locations for this operating system replace the default ones, which apply when there are none;
// the first that exists is used), over `installed`
function findInstalled(name: ExecutableName, executables: ExecutablesConfig | Nullish, platform: NodeJS.Platform = process.platform): string | null {
  const entry = executables?.[name]
  const configured = entry == null ? [] : asArray(entry).map(uri => executableUriToPath(name, uri, platform))
  let candidates: ReadonlyArray<string | null>
  if (configured.every(it => it == null)) {
    try {
      candidates = defaultExecutableLocations(name, platform)
    } catch {
      candidates = []
    }
  } else {
    candidates = configured
  }
  return candidates.find(it => it != null && installed.has(it)) ?? null
}

function executedFiles(): string[] {
  return vi.mocked(exec).mock.calls.map(call => call[0])
}

beforeEach(() => {
  installed = new Set([POWERSHELL])
  vi.mocked(exec).mockReset()
  vi.mocked(spawn).mockReset()
  // the resolver looks at the files of this machine; stand in for the programs of the simulated host being installed (or not), with
  // the configuration of the current Executables.run scope
  vi.spyOn(Executables, "find").mockImplementation(name => findInstalled(name, Executables.configuration))
  vi.spyOn(Executables, "resolve").mockImplementation(name => {
    const found = findInstalled(name, Executables.configuration)
    if (found == null) {
      throw new InvalidConfigurationError(`${name} not found`)
    }
    return found
  })
  setPlatform("win32")
  vi.stubEnv("SystemRoot", "C:\\Windows")
  vi.stubEnv("windir", "")
  vi.stubEnv("ProgramFiles", "C:\\Program Files")
})

afterEach(() => {
  setPlatform(originalPlatform)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("VmManager.powershellCommand", () => {
  test("uses PowerShell 7 by absolute path when it is installed and runs", async ({ expect }) => {
    installed.add(PWSH)
    vi.mocked(exec).mockResolvedValue("")
    expect(await new VmManager().powershellCommand.value).toBe(PWSH)
    expect(executedFiles()).toEqual([PWSH])
  })

  test("falls back to Windows PowerShell by absolute path, with a warning, when PowerShell 7 is not installed", async ({ expect }) => {
    const warn = vi.spyOn(log, "warn")
    expect(await new VmManager().powershellCommand.value).toBe(POWERSHELL)
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][1]).toBe("PowerShell 7 (pwsh) is not installed at its default install location; using Windows PowerShell")
  })

  test("falls back to Windows PowerShell when PowerShell 7 does not run", async ({ expect }) => {
    installed.add(PWSH)
    vi.mocked(exec).mockRejectedValue(new Error("spawn UNKNOWN"))
    expect(await new VmManager().powershellCommand.value).toBe(POWERSHELL)
    expect(executedFiles()).toEqual([PWSH])
  })

  test("uses the locations of toolsets.executables", async ({ expect }) => {
    const pwsh = "D:\\Tools\\PowerShell\\pwsh.exe"
    const powershell = "D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    installed = new Set([pwsh, powershell, PWSH])
    vi.mocked(exec).mockResolvedValue("")
    const executables = { pwsh: "file:///D:/Tools/PowerShell/pwsh.exe", powershell: "file:///D:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" }
    expect(await Executables.run(executables, () => new VmManager().powershellCommand.value)).toBe(pwsh)
    expect(await Executables.run({ powershell: executables.powershell }, () => new VmManager().powershellCommand.value)).toBe(PWSH)
  })

  test("a toolsets.executables.pwsh entry that names no executable is a configuration error, not a fallback", async ({ expect }) => {
    await expect(Executables.run({ pwsh: "file:///D:/missing/pwsh.exe" }, () => new VmManager().powershellCommand.value)).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })

  test("a toolsets.executables.pwsh entry for macOS and Linux only, from a shared configuration, leaves PowerShell 7 to its default location", async ({ expect }) => {
    const executables = { pwsh: ["file:///usr/local/microsoft/powershell/7/pwsh", "file:///opt/microsoft/powershell/7/pwsh"] }
    const warn = vi.spyOn(log, "warn")
    expect(await Executables.run(executables, () => new VmManager().powershellCommand.value)).toBe(POWERSHELL)
    expect(warn.mock.calls[0][1]).toBe("PowerShell 7 (pwsh) is not installed at its default install location; using Windows PowerShell")
    installed.add(PWSH)
    vi.mocked(exec).mockResolvedValue("")
    expect(await Executables.run(executables, () => new VmManager().powershellCommand.value)).toBe(PWSH)
    expect(executedFiles()).toEqual([PWSH])
  })

  test("a toolsets.executables.pwsh entry with a Windows location still has to be found there", async ({ expect }) => {
    installed.add(PWSH)
    const executables = { pwsh: ["file:///opt/microsoft/powershell/7/pwsh", "file:///D:/missing/pwsh.exe"] }
    await expect(Executables.run(executables, () => new VmManager().powershellCommand.value)).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })

  test("rejects without running anything when Windows PowerShell is not found", async ({ expect }) => {
    installed.clear()
    await expect(new VmManager().powershellCommand.value).rejects.toThrow("powershell not found")
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })

  test("uses only the space-free Windows PowerShell inside a Parallels guest, through prlctl by absolute path", async ({ expect }) => {
    setPlatform("darwin")
    installed.add(PRLCTL)
    vi.mocked(exec).mockResolvedValue("")
    const warn = vi.spyOn(log, "warn")
    const vm = new ParallelsVmManager({ id: "{win}", name: "win", os: "win-11", state: "running" })
    const ps = await vm.powershellCommand.value
    expect(ps).toBe(PARALLELS_GUEST_WINDOWS_POWERSHELL)
    expect(ps).not.toContain(" ")
    // no probe of PowerShell 7, whose path contains a space that prlctl exec does not pass through intact
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][1]).toContain(`PowerShell 7 (${PARALLELS_GUEST_PWSH}) is not used in a Parallels VM`)

    await vm.exec(ps, ["-NoProfile", "-NonInteractive", "-Command", "Get-ChildItem Cert:"])
    expect(executedFiles()).toEqual([PRLCTL])
    expect(vi.mocked(exec).mock.calls[0][1]).toEqual([
      "exec",
      "{win}",
      "--current-user",
      PARALLELS_GUEST_WINDOWS_POWERSHELL,
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-ChildItem Cert:",
    ])
  })

  test("starts the prlctl of toolsets.executables.prlctl", async ({ expect }) => {
    setPlatform("darwin")
    installed.add("/opt/parallels/prlctl")
    vi.mocked(exec).mockResolvedValue("")
    await Executables.run({ prlctl: "file:///opt/parallels/prlctl" }, () =>
      new ParallelsVmManager({ id: "{win}", name: "win", os: "win-11", state: "running" }).exec("cmd.exe", [])
    )
    expect(executedFiles()).toEqual(["/opt/parallels/prlctl"])
  })
})

describe("VmManager.exec", () => {
  test("merges an explicit environment onto one without credentials", async ({ expect }) => {
    vi.stubEnv("CSC_KEY_PASSWORD", "secret")
    vi.stubEnv("GH_TOKEN", "secret")
    vi.mocked(exec).mockResolvedValue("")
    await new VmManager().exec("C:\\tool.exe", [], { env: { AZURE_CLIENT_SECRET: "azure" } })
    const env = vi.mocked(exec).mock.calls[0][2]?.env ?? {}
    expect(env.AZURE_CLIENT_SECRET).toBe("azure")
    // process.env, and so its copy, keeps the casing the variable was first set with (SYSTEMROOT on some Windows hosts)
    expect(Object.entries(env).find(([name]) => name.toLowerCase() === "systemroot")?.[1]).toBe("C:\\Windows")
    expect(env.CSC_KEY_PASSWORD).toBeUndefined()
    expect(env.GH_TOKEN).toBeUndefined()
  })
})

describe("PwshVmManager.powershellCommand", () => {
  test("uses pwsh from its install location", async ({ expect }) => {
    setPlatform("linux")
    installed.add("/snap/bin/pwsh")
    expect(await new PwshVmManager().powershellCommand.value).toBe("/snap/bin/pwsh")
  })

  test("uses toolsets.executables.pwsh", async ({ expect }) => {
    setPlatform("linux")
    installed.add("/opt/pwsh/pwsh")
    installed.add("/snap/bin/pwsh")
    expect(await Executables.run({ pwsh: "file:///opt/pwsh/pwsh" }, () => new PwshVmManager().powershellCommand.value)).toBe("/opt/pwsh/pwsh")
  })

  test("a toolsets.executables.pwsh entry for Windows only, from a shared configuration, leaves pwsh to its install location", async ({ expect }) => {
    setPlatform("darwin")
    installed = new Set(["/usr/local/microsoft/powershell/7/pwsh", "/opt/homebrew/bin/wine"])
    const pwsh = await Executables.run({ pwsh: "file:///C:/Tools/PowerShell/pwsh.exe" }, async () => {
      const vm = await getWindowsVm(new DebugLogger(false))
      expect(vm).toBeInstanceOf(PwshVmManager)
      return vm.powershellCommand.value
    })
    expect(pwsh).toBe("/usr/local/microsoft/powershell/7/pwsh")
  })

  test("is a configuration error when pwsh is not found", async ({ expect }) => {
    setPlatform("linux")
    await expect(new PwshVmManager().powershellCommand.value).rejects.toBeInstanceOf(InvalidConfigurationError)
  })
})

describe("getWindowsVm", () => {
  test.for<NodeJS.Platform>(["darwin", "linux"])(
    "is a configuration error on %s without running pwsh or prlctl by name when neither is installed",
    async (platform, { expect }) => {
      setPlatform(platform)
      const result = getWindowsVm(new DebugLogger(false))
      await expect(result).rejects.toBeInstanceOf(InvalidConfigurationError)
      await expect(result).rejects.toThrow("toolsets.executables.pwsh and toolsets.executables.wine")
      expect(vi.mocked(exec)).not.toHaveBeenCalled()
    }
  )

  test("never runs a bare pwsh, powershell, prlctl or wine", async ({ expect }) => {
    setPlatform("darwin")
    installed = new Set(["/usr/local/microsoft/powershell/7/pwsh", "/opt/homebrew/bin/wine"])
    vi.mocked(exec).mockResolvedValue("")
    const vm = await getWindowsVm(new DebugLogger(false))
    expect(vm).toBeInstanceOf(PwshVmManager)
    await vm.powershellCommand.value
    expect(executedFiles().filter(file => !path.isAbsolute(file))).toEqual([])
  })

  test("counts an explicitly configured wine bundle, or toolsets.executables.wine, as available without running it", async ({ expect }) => {
    setPlatform("linux")
    installed = new Set(["/opt/microsoft/powershell/7/pwsh", "/opt/wine/bin/wine"])
    expect(await getWindowsVm(new DebugLogger(false), { url: "file:///opt/my-wine-bundle" })).toBeInstanceOf(PwshVmManager)
    expect(await Executables.run({ wine: "file:///opt/wine/bin/wine" }, () => getWindowsVm(new DebugLogger(false)))).toBeInstanceOf(PwshVmManager)
    expect(vi.mocked(exec)).not.toHaveBeenCalled()
  })
})

describe("streamSpawnToFile on Windows", () => {
  async function run(expect: ExpectStatic, dir: string, executables?: ExecutablesConfig) {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error("not started")
    })
    await expect(Executables.run(executables, () => streamSpawnToFile("npm", ["list"], dir, path.join(dir, "out.json"), {}))).rejects.toThrow("not started")
    return vi.mocked(spawn).mock.calls.map(call => call[0])
  }

  test("wraps the command in Windows PowerShell started by absolute path", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "stream-spawn" })
    await fs.mkdir(dir, { recursive: true })
    expect(await run(expect, dir)).toEqual([POWERSHELL])
  })

  test("uses toolsets.executables.powershell", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "stream-spawn" })
    await fs.mkdir(dir, { recursive: true })
    installed.add("D:\\PS\\powershell.exe")
    expect(await run(expect, dir, { powershell: "file:///D:/PS/powershell.exe" })).toEqual(["D:\\PS\\powershell.exe"])
  })

  test("rejects without starting anything when Windows PowerShell is not found", async ({ expect, tmpDir }) => {
    installed.clear()
    const dir = await tmpDir.getTempDir({ prefix: "stream-spawn" })
    await expect(streamSpawnToFile("npm", ["list"], dir, path.join(dir, "out.json"), {})).rejects.toThrow("powershell not found")
    expect(vi.mocked(spawn)).not.toHaveBeenCalled()
  })
})
