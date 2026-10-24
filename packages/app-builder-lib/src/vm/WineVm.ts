import { exec, ExtraSpawnOptions, stripSensitiveEnvVars } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { ExecFileOptions, SpawnOptions } from "child_process"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { getWineToolset } from "../toolsets/wine.js"
import { VmManager } from "./vm.js"

type WineOptions = {
  file: string
  appArgs?: Array<string>
  options?: ExecFileOptions
}

export class WineVmManager extends VmManager {
  /** @param toolsets the `toolsets` configuration: `wine` selects a bundle, `executables.wine` the host Wine */
  constructor(
    private readonly toolsets: ToolsetConfig | Nullish,
    private readonly buildResourcesDir: string
  ) {
    super(toolsets?.executables)
  }

  exec(file: string, args: Array<string>, options?: ExecFileOptions, _isLogOutIfDebug = true): Promise<string> {
    return this.execWine({ file, appArgs: args, options })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  spawn(file: string, args: Array<string>, options?: SpawnOptions, extraOptions?: ExtraSpawnOptions): Promise<any> {
    throw new Error("Unsupported")
  }

  toVmFile(file: string): string {
    return path.win32.join("Z:", file)
  }

  private async execWine({ file: target, appArgs = [], options = {} }: WineOptions): Promise<string> {
    if (options.timeout == null) {
      // 2 minutes
      options.timeout = 120 * 1000
    }
    if (process.platform === "win32") {
      return exec(target, appArgs, options)
    }
    const { execPath: wineExe, env: wineEnv } = await getWineToolset(this.toolsets?.wine, this.buildResourcesDir, this.toolsets?.executables)
    // Preserve the base process environment (PATH, HOME, TMPDIR, etc.) so Wine and child tools start correctly, without credentials:
    // a caller passes those it needs. Wine env vars override the base; caller options.env wins last.
    return exec(wineExe, [target, ...appArgs], { ...options, env: { ...stripSensitiveEnvVars(process.env), ...wineEnv, ...options.env } })
  }
}
