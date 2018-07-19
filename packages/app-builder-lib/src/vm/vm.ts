import { DebugLogger, exec, ExtraSpawnOptions, InvalidConfigurationError, spawn } from "builder-util"
import { ExecFileOptions, SpawnOptions } from "child_process"
import * as path from "path"
import { ParallelsVmManager, parseVmList } from "./ParallelsVm"

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
}

export async function getWindowsVm(debugLogger: DebugLogger): Promise<VmManager> {
  const vmList = (await parseVmList(debugLogger)).filter(it => it.os === "win-10")
  if (vmList.length === 0) {
    throw new InvalidConfigurationError("Cannot find suitable Parallels Desktop virtual machine (Windows 10 is required)")
  }

  // prefer running or suspended vm
  return new ParallelsVmManager(vmList.find(it => it.state === "running") || vmList.find(it => it.state === "suspended") || vmList[0])
}