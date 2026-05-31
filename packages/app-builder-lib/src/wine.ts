import { exec, executeAppBuilder } from "builder-util"
import { ExecFileOptions, spawnSync } from "child_process"

// app-builder-bin has a hardcoded "macOS Catalina doesn't support 32-bit executables"
// check that fires unconditionally on macOS, even though modern Wine (10.x via Homebrew)
// runs 32-bit Windows executables via WoW64 without any macOS 32-bit support requirement.
// Resolve system wine once at module load — a PATH lookup is cheap.
const _macSystemWine: string | null =
  process.platform === "darwin"
    ? (() => {
        const r = spawnSync("which", ["wine"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
        return r.status === 0 ? r.stdout.trim() : null
      })()
    : null

/** @private */
export function execWine(file: string, file64: string | null = null, appArgs: Array<string> = [], options: ExecFileOptions = {}): Promise<string> {
  if (process.platform === "win32") {
    if (options.timeout == null) {
      // 2 minutes
      options.timeout = 120 * 1000
    }
    return exec(file, appArgs, options)
  }

  if (_macSystemWine != null) {
    // Use system wine directly, bypassing app-builder-bin's Catalina guard.
    // wine maps Z: to the Unix root, so Z:\-prefixed paths (from WineVmManager.toVmFile)
    // resolve correctly. WINEDEBUG suppresses noise; file64 is always null in practice.
    return exec(_macSystemWine, [file, ...appArgs], { ...options, env: { ...process.env, WINEDEBUG: "-all" } })
  }

  const commandArgs = ["wine", "--ia32", file]
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
