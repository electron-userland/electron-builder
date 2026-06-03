import { exec } from "builder-util"
import { ExecFileOptions } from "child_process"
import * as os from "os"

/** @private */
export function execWine(file: string, file64: string | null = null, appArgs: Array<string> = [], options: ExecFileOptions = {}): Promise<string> {
  if (process.platform === "win32") {
    if (options.timeout == null) {
      // 2 minutes
      options.timeout = 120 * 1000
    }
    return exec(file, appArgs, options)
  }

  // Catalina (Darwin kernel 19+) dropped 32-bit support; wine64 + x64 binary required.
  const isCatalina = process.platform === "darwin" && parseInt(os.release().split(".")[0], 10) >= 19
  if (isCatalina) {
    if (file64 == null) {
      throw new Error("macOS Catalina (10.15+) does not support 32-bit executables; a 64-bit (file64) path is required for wine")
    }
    return exec("wine64", [file64, ...appArgs], { ...options, env: { ...process.env, WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d", ...options.env } })
  }

  return exec("wine", [file, ...appArgs], { ...options, env: { ...process.env, WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d", ...options.env } })
}

/** @private */
export function prepareWindowsExecutableArgs(args: Array<string>, exePath: string) {
  if (process.platform !== "win32") {
    args.unshift(exePath)
  }
  return args
}
