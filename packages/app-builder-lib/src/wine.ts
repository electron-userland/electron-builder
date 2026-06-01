import { exec } from "builder-util"
import { ExecFileOptions } from "child_process"
import { ToolsetConfig } from "./configuration"
import { getWineToolset } from "./toolsets/wine"
import { Nullish } from "builder-util-runtime"

type WineOptions = {
  file: string
  file64?: string | null
  appArgs?: Array<string>
  options?: ExecFileOptions
  toolset: ToolsetConfig["wine"] | Nullish
}

/** @private */
export async function execWine({ file, file64 = null, appArgs = [], options = {}, toolset }: WineOptions): Promise<string> {
  if (process.platform === "win32") {
    if (options.timeout == null) {
      // 2 minutes
      options.timeout = 120 * 1000
    }
    return exec(file, appArgs, options)
  }

  const wineExe = await getWineToolset(toolset)
  // Wine 11 unified binary: prefer x64 exe; ia32 runs via WoW64
  const target = file64 ?? file
  return exec(wineExe, [target, ...appArgs], options)
}

/** @private */
export function prepareWindowsExecutableArgs(args: Array<string>, exePath: string) {
  if (process.platform !== "win32") {
    args.unshift(exePath)
  }
  return args
}
