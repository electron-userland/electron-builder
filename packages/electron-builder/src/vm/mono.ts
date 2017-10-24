import { SpawnOptions } from "child_process"
import { exec, ExecOptions, ExtraSpawnOptions, spawn } from "builder-util"
import { VmManager } from "./vm"

export class MonoVmManager extends VmManager {
  constructor(private readonly currentDirectory: string) {
    super()
  }

  exec(file: string, args: Array<string>, options?: ExecOptions, isLogOutIfDebug = true): Promise<string> {
    return exec("mono", [file].concat(args), {
      cwd: this.currentDirectory,
      ...options,
    }, isLogOutIfDebug)
  }

  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    return spawn("mono", [file].concat(args), options, extraOptions)
  }

  toVmFile(file: string): string {
    const parentPathLengthWithSlash = this.currentDirectory.length + 1
    if (parentPathLengthWithSlash < file.length && file[this.currentDirectory.length] === "/" && file.startsWith(this.currentDirectory)) {
      return file.substring(parentPathLengthWithSlash)
    }
    else {
      return super.toVmFile(file)
    }
  }
}