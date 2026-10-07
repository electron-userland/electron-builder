import { DebugLogger, exec, ExtraSpawnOptions, InvalidConfigurationError, log, spawn } from "builder-util"
import { ExecFileOptions, SpawnOptions } from "child_process"
import { Lazy } from "lazy-val"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { ParallelsVm } from "./ParallelsVm.js"
export class VmManager {
  get pathSep(): string {
    return path.sep
  }

  exec(file: string, args: Array<string>, options?: ExecFileOptions, isLogOutIfDebug = true): Promise<string> {
    // Mirror WineVmManager: merge caller-supplied env with process.env so extra vars don't strip
    // the base environment (PATH, SystemRoot, etc.) on native Windows.
    const mergedOptions = options?.env != null ? { ...options, env: { ...process.env, ...options.env } } : options
    return exec(file, args, mergedOptions, isLogOutIfDebug)
  }

  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    return spawn(file, args, options, extraOptions)
  }

  toVmFile(file: string): string {
    return file
  }

  readonly powershellCommand = new Lazy(() => {
    return this.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-Command pwsh.exe`])
      .then(() => {
        log.info(null, "identified pwsh.exe")
        return "pwsh.exe"
      })
      .catch(() => {
        log.info(null, "unable to find pwsh.exe, falling back to powershell.exe")
        return "powershell.exe"
      })
  })
}

export async function getWindowsVm(debugLogger: DebugLogger): Promise<VmManager> {
  const parallelsVmModule = await import("./ParallelsVm.js")
  let vmList: ParallelsVm[] = []
  try {
    vmList = await parseWindowsVmList(debugLogger)
  } catch (_error) {
    if ((await isPwshAvailable.value) && (await isWineAvailable.value)) {
      const vmModule = await import("./PwshVm.js")
      return new vmModule.PwshVmManager()
    }
  }
  if (vmList.length === 0) {
    throw new InvalidConfigurationError("Cannot find suitable Parallels Desktop virtual machine (Windows 10 is required) and cannot access `pwsh` and `wine` locally")
  }

  return new parallelsVmModule.ParallelsVmManager(preferRunningVm(vmList))
}

// Runs Windows executables: natively on Windows, else in a Parallels Windows VM when one exists, else via wine.
// Unlike getWindowsVm, it never falls back to PwshVmManager, which runs the file natively and requires pwsh.
export async function getWindowsExecVm(debugLogger: DebugLogger, wineToolset: ToolsetConfig["wine"], buildResourcesDir: string): Promise<VmManager> {
  if (process.platform === "win32") {
    return new VmManager()
  }
  const vmList = await parseWindowsVmList(debugLogger).catch(() => [])
  if (vmList.length > 0) {
    const parallelsVmModule = await import("./ParallelsVm.js")
    return new parallelsVmModule.ParallelsVmManager(preferRunningVm(vmList))
  }
  const wineVmModule = await import("./WineVm.js")
  return new wineVmModule.WineVmManager(wineToolset, buildResourcesDir)
}

async function parseWindowsVmList(debugLogger: DebugLogger): Promise<ParallelsVm[]> {
  const parallelsVmModule = await import("./ParallelsVm.js")
  return (await parallelsVmModule.parseVmList(debugLogger)).filter(it => ["win-10", "win-11"].includes(it.os))
}

// prefer running or suspended vm
function preferRunningVm(vmList: ParallelsVm[]): ParallelsVm {
  return vmList.find(it => it.state === "running") || vmList.find(it => it.state === "suspended") || vmList[0]
}

export async function getLinuxVm(debugLogger: DebugLogger): Promise<VmManager | undefined> {
  if (process.platform !== "darwin") {
    return undefined
  }
  try {
    const parallelsVmModule = await import("./ParallelsVm.js")
    const vmList = (await parallelsVmModule.parseVmList(debugLogger)).filter(it => it.os === "ubuntu")
    if (vmList.length === 0) {
      return undefined
    }
    return new parallelsVmModule.ParallelsVmManager(preferRunningVm(vmList))
  } catch {
    return undefined
  }
}

const isWineAvailable = new Lazy(async () => {
  return isCommandAvailable("wine", ["--version"])
})

export const isPwshAvailable = new Lazy(async () => {
  return isCommandAvailable("pwsh", ["--version"])
})

export const isCommandAvailable = async (command: string, args: string[]) => {
  try {
    await exec(command, args)
    return true
  } catch {
    return false
  }
}
