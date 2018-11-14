import { ExecFileOptions } from "child_process"
import { exec, executeAppBuilder } from "builder-util"

/** @private */
export function execWine(file: string, file64: string | null = null, appArgs: Array<string> = [], options: ExecFileOptions = {}): Promise<string> {
  if (process.platform === "win32") {
    if (options.timeout == null) {
      // 2 minutes
      options.timeout = 120 * 1000
    }
    return exec(file, appArgs, options)
  }

  const commandArgs = [
    "wine",
    "--ia32", file,
  ]
  if (file64 != null) {
    commandArgs.push("--x64", file64)
  }
  if (appArgs.length > 0) {
    commandArgs.push("--args", JSON.stringify(appArgs))
  }
  return executeAppBuilder(commandArgs, undefined, options)
}

/** @private */
export function prepareWindowsExecutableArgs(args: Array<string>, exePath: string) {
  if (process.platform !== "win32") {
    args.unshift(exePath)
  }
  return args
}