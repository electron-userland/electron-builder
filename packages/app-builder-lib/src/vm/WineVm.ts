import { exec, ExtraSpawnOptions } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { ExecFileOptions, SpawnOptions } from "child_process"
import * as path from "path"
import { ToolsetConfig } from "../configuration"
import { getWineToolset } from "../toolsets/wine"
import { VmManager } from "./vm"

type WineOptions = {
  file: string
  appArgs?: Array<string>
  options?: ExecFileOptions
  toolset: ToolsetConfig["wine"] | Nullish
}

export class WineVmManager extends VmManager {
  constructor(private readonly wineToolset: ToolsetConfig["wine"]) {
    super()
  }

  exec(file: string, args: Array<string>, options?: ExecFileOptions, _isLogOutIfDebug = true): Promise<string> {
    return this.execWine({ file, appArgs: args, options, toolset: this.wineToolset })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    throw new Error("Unsupported")
  }

  toVmFile(file: string): string {
    return path.win32.join("Z:", file)
  }

  private async execWine({ file: target, appArgs = [], options = {}, toolset }: WineOptions): Promise<string> {
    if (options.timeout == null) {
      // 2 minutes
      options.timeout = 120 * 1000
    }
    if (process.platform === "win32") {
      return exec(target, appArgs, options)
    }
    const { execPath: wineExe, env: wineEnv } = await getWineToolset(toolset)
    return exec(wineExe, [target, ...appArgs], { ...options, env: { ...process.env, ...wineEnv, ...options.env } })
  }
}
