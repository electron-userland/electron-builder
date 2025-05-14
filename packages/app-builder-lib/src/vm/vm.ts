import { DebugLogger, exec, ExtraSpawnOptions, InvalidConfigurationError, log, spawn } from "builder-util"
import { ExecFileOptions, SpawnOptions } from "child_process"
import { Lazy } from "lazy-val"
import * as path from "path"
import { ParallelsVm } from "./ParallelsVm.js"
export class VmManager {
  get pathSep(): string {
    return path.sep
  }

  exec(file: string, args: Array<string>, options?: ExecFileOptions, isLogOutIfDebug = true): Promise<string> {
    return exec(file, args, options, isLogOutIfDebug)
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
    vmList = (await parallelsVmModule.parseVmList(debugLogger)).filter(it => ["win-10", "win-11"].includes(it.os))
  } catch (_error) {
    if ((await isPwshAvailable.value) && (await isWineAvailable.value)) {
      const vmModule = await import("./PwshVm.js")
      return new vmModule.PwshVmManager()
    }
  }
  if (vmList.length === 0) {
    throw new InvalidConfigurationError("Cannot find suitable Parallels Desktop virtual machine (Windows 10 is required) and cannot access `pwsh` and `wine` locally")
  }

  // prefer running or suspended vm
  return new parallelsVmModule.ParallelsVmManager(vmList.find(it => it.state === "running") || vmList.find(it => it.state === "suspended") || vmList[0])
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
