import { DebugLogger, exec, Executables, ExtraSpawnOptions, InvalidConfigurationError, log, spawn, stripSensitiveEnvVars } from "builder-util"
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
    // Mirror WineVmManager: merge caller-supplied env onto the base environment so extra vars don't strip it (PATH, SystemRoot, etc.)
    // on native Windows. Like the environment of a call without one, the base has no credentials: a caller passes those it needs.
    const mergedOptions = options?.env != null ? { ...options, env: { ...stripSensitiveEnvVars(process.env), ...options.env } } : options
    return exec(file, args, mergedOptions, isLogOutIfDebug)
  }

  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    return spawn(file, args, options, extraOptions)
  }

  toVmFile(file: string): string {
    return file
  }

  // Absolute path of Windows PowerShell on the machine this manager runs commands on, and of PowerShell 7 — or, as a sentence, why
  // PowerShell 7 is not used there
  protected windowsPowerShellPaths(): { powershell: string; pwsh: { path: string } | { unavailable: string } } {
    // PowerShell 7 is optional, unless toolsets.executables.pwsh has a location for this operating system: then it has to be found there
    const pwsh = Executables.isConfigured("pwsh") ? Executables.resolve("pwsh") : Executables.find("pwsh")
    return {
      powershell: Executables.resolve("powershell"),
      pwsh: pwsh == null ? { unavailable: "PowerShell 7 (pwsh) is not installed at its default install location" } : { path: pwsh },
    }
  }

  // PowerShell 7 when it is installed, else Windows PowerShell — both by absolute path, never looked up on PATH
  readonly powershellCommand = new Lazy(async () => {
    const { powershell, pwsh } = this.windowsPowerShellPaths()
    let reason: string
    if ("path" in pwsh) {
      try {
        await this.exec(pwsh.path, ["-NoProfile", "-NonInteractive", "-Command", "exit 0"])
        log.info({ path: pwsh.path }, "using PowerShell 7")
        return pwsh.path
      } catch {
        reason = `PowerShell 7 at ${pwsh.path} did not run`
      }
    } else {
      reason = pwsh.unavailable
    }
    log.warn({ path: powershell }, `${reason}; using Windows PowerShell`)
    return powershell
  })
}

export async function getWindowsVm(debugLogger: DebugLogger, wineToolset?: ToolsetConfig["wine"]): Promise<VmManager> {
  const parallelsVmModule = await import("./ParallelsVm.js")
  let vmList: ParallelsVm[] = []
  try {
    vmList = await parseWindowsVmList(debugLogger)
  } catch (_error) {
    if (Executables.find("pwsh") != null && isWineAvailable(wineToolset)) {
      const vmModule = await import("./PwshVm.js")
      return new vmModule.PwshVmManager()
    }
  }
  if (vmList.length === 0) {
    throw new InvalidConfigurationError(
      `Cannot find suitable Parallels Desktop virtual machine (Windows 10 is required) and cannot find \`pwsh\` and \`wine\` locally. electron-builder starts them only from an absolute path, never from PATH: from their default install locations, or from toolsets.executables.pwsh and toolsets.executables.wine`
    )
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

// Without running anything: a custom Wine bundle is configured, or the host Wine is found (it is never looked up on PATH)
function isWineAvailable(wineToolset: ToolsetConfig["wine"] | undefined): boolean {
  return (typeof wineToolset === "object" && wineToolset != null) || Executables.find("wine") != null
}
