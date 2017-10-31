import { SpawnOptions, ExecFileOptions } from "child_process"
import { ExtraSpawnOptions, execWine } from "builder-util"
import { VmManager } from "./vm"
import * as path from "path"

export class WineVmManager extends VmManager {
  constructor() {
    super()
  }

  exec(file: string, args: Array<string>, options?: ExecFileOptions, isLogOutIfDebug = true): Promise<string> {
    return execWine(file, args, options)
  }

  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    throw new Error("Unsupported")
  }

  toVmFile(file: string): string {
    return path.win32.join("Z:", file)
  }
}
