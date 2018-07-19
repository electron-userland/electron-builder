import { SpawnOptions, ExecFileOptions } from "child_process"
import { exec, ExtraSpawnOptions, spawn } from "builder-util"
import { VmManager } from "./vm"

export class MonoVmManager extends VmManager {
  constructor() {
    super()
  }

  exec(file: string, args: Array<string>, options?: ExecFileOptions, isLogOutIfDebug = true): Promise<string> {
    return exec("mono", [file].concat(args), {
      ...options,
    }, isLogOutIfDebug)
  }

  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    return spawn("mono", [file].concat(args), options, extraOptions)
  }
}