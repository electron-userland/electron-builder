import { ExtraSpawnOptions } from "builder-util"
import { ExecFileOptions, SpawnOptions } from "child_process"
import * as path from "path"
import { execWine } from "../wine.js"
import { VmManager } from "./vm.js"

export class WineVmManager extends VmManager {
  constructor() {
    super()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  exec(file: string, args: Array<string>, options?: ExecFileOptions, isLogOutIfDebug = true): Promise<string> {
    return execWine(file, null, args, options)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    throw new Error("Unsupported")
  }

  toVmFile(file: string): string {
    return path.win32.join("Z:", file)
  }
}
