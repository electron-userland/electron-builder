import { ExtraSpawnOptions } from "builder-util"
import { ExecFileOptions, SpawnOptions } from "child_process"
import * as path from "path"
import { ToolsetConfig } from "../configuration"
import { execWine } from "../wine"
import { VmManager } from "./vm"

export class WineVmManager extends VmManager {
  constructor(private readonly wineToolset: ToolsetConfig["wine"]) {
    super()
  }

  exec(file: string, args: Array<string>, options?: ExecFileOptions, _isLogOutIfDebug = true): Promise<string> {
    return execWine({ file, appArgs: args, options, toolset: this.wineToolset })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    throw new Error("Unsupported")
  }

  toVmFile(file: string): string {
    return path.win32.join("Z:", file)
  }
}
