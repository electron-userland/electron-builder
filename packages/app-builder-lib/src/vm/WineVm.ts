import { SpawnOptions, ExecFileOptions } from "child_process"
import { ExtraSpawnOptions } from "builder-util"
import { execWine } from "../wine"
import { VmManager } from "./vm"
import * as path from "path"

export class WineVmManager extends VmManager {
  constructor() {
    super()
  }

  exec(file: string, args: Array<string>, options?: ExecFileOptions, isLogOutIfDebug = true): Promise<string> {
    return execWine(file, null, args, options)
  }

  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    throw new Error("Unsupported")
  }

  toVmFile(file: string): string {
    return path.win32.join("Z:", file)
  }
}
