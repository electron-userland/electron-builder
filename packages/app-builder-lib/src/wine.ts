import { exec } from "builder-util"
import { ExecFileOptions } from "child_process"
import { ToolsetConfig } from "./configuration"
import { getWineToolset } from "./toolsets/wine"
import { Nullish } from "builder-util-runtime"

type WineOptions = {
  file: string
  appArgs?: Array<string>
  options?: ExecFileOptions
  toolset: ToolsetConfig["wine"] | Nullish
}

/** @private */
export async function execWine({ file: target, appArgs = [], options = {}, toolset }: WineOptions): Promise<string> {
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

/** @private */
export function prepareWindowsExecutableArgs(args: Array<string>, exePath: string) {
  if (process.platform !== "win32") {
    args.unshift(exePath)
  }
  return args
}
