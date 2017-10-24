import * as path from "path"
import { SpawnOptions } from "child_process"
import { DebugLogger, exec, ExecOptions, ExtraSpawnOptions, spawn } from "builder-util"
import { ParallelsVmManager, parseVmList } from "./parallels"

export class VmManager {
  get pathSep(): string {
    return path.sep
  }

  exec(file: string, args: Array<string>, options?: ExecOptions, isLogOutIfDebug = true): Promise<string> {
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
    throw new Error("Cannot find suitable Parallels Desktop virtual machine (Windows 10 is required)")
  }

  // prefer running or suspended vm
  return new ParallelsVmManager(vmList.find(it => it.state === "running") || vmList.find(it => it.state === "suspended") || vmList[0])
}