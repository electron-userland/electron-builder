import { exec } from "builder-util"
import { ExecFileOptions } from "child_process"
import { ToolsetConfig } from "./configuration"
import { getWineToolset } from "./toolsets/wine"
import { Nullish } from "builder-util-runtime"

type WineOptions = {
  file: string
  // file64?: string | null
  appArgs?: Array<string>
  options?: ExecFileOptions
  toolset: ToolsetConfig["wine"] | Nullish
}

/** @private */
export async function execWine({ file: target, appArgs = [], options = {}, toolset }: WineOptions): Promise<string> {
  const { path: wineExe, env: wineEnv } = await getWineToolset(toolset)
  if (options.timeout == null) {
    // 2 minutes
    options.timeout = 120 * 1000
  }
  return exec(wineExe, [target, ...appArgs], { ...options, env: { ...process.env, ...wineEnv, ...options.env } })
}

/** @private */
export function prepareWindowsExecutableArgs(args: Array<string>, exePath: string) {
  if (process.platform !== "win32") {
    args.unshift(exePath)
  }
  return args
}
