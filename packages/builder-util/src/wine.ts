import { Lazy } from "lazy-val"
import * as path from "path"
import * as semver from "semver"
import { getBinFromGithub } from "./binDownload"
import { computeEnv, EXEC_TIMEOUT, ToolInfo } from "./bundledTool"
import { getMacOsVersion } from "./macosVersion"
import { debug, exec, ExecOptions, isEnvTrue } from "./util"

const wineExecutable = new Lazy<ToolInfo>(async () => {
  const isUseSystemWine = isEnvTrue(process.env.USE_SYSTEM_WINE)
  if (isUseSystemWine) {
    debug("Using system wine is forced")
  }
  else if (process.platform === "darwin") {
    const osVersion = await getMacOsVersion()
    let version: string | null = null
    let checksum: string | null = null
    if (semver.gte(osVersion, "10.13.0")) {
      version = "2.0.2-mac-10.13"
      // noinspection SpellCheckingInspection
      checksum = "v6r9RSQBAbfvpVQNrEj48X8Cw1181rEGMRatGxSKY5p+7khzzy/0tOdfHGO8cU+GqYvH43FAKMK8p6vUfCqSSA=="
    }
    else if (semver.gte(osVersion, "10.12.0")) {
      version = "2.0.1-mac-10.12"
      // noinspection SpellCheckingInspection
      checksum = "IvKwDml/Ob0vKfYVxcu92wxUzHu8lTQSjjb8OlCTQ6bdNpVkqw17OM14TPpzGMIgSxfVIrQZhZdCwpkxLyG3mg=="
    }

    if (version != null) {
      const wineDir = await getBinFromGithub("wine", version, checksum!!)
      return {
        path: path.join(wineDir, "bin/wine"),
        env: {
          ...process.env,
          WINEDEBUG: "-all,err+all",
          WINEDLLOVERRIDES: "winemenubuilder.exe=d",
          WINEPREFIX: path.join(wineDir, "wine-home"),
          DYLD_FALLBACK_LIBRARY_PATH: computeEnv(process.env.DYLD_FALLBACK_LIBRARY_PATH, [path.join(wineDir, "lib")])
        }
      }
    }
  }

  await checkWineVersion(exec("wine", ["--version"]))
  return {path: "wine"}
})

/** @private */
export function execWine(file: string, args: Array<string>, options: ExecOptions = EXEC_TIMEOUT): Promise<string> {
  if (process.platform === "win32") {
    return exec(file, args, options)
  }
  else {
    return wineExecutable.value
      .then(wine => exec(wine.path, [file].concat(args), wine.env == null ? options : {env: wine.env, ...options}))
  }
}

/** @private */
export function prepareWindowsExecutableArgs(args: Array<string>, exePath: string) {
  if (process.platform !== "win32") {
    args.unshift(exePath)
  }
  return args
}

/** @private */
export async function checkWineVersion(checkPromise: Promise<string>) {
  function wineError(prefix: string): string {
    return `${prefix}, please see https://electron.build/multi-platform-build#${(process.platform === "linux" ? "linux" : "macos")}`
  }

  let wineVersion: string
  try {
    wineVersion = (await checkPromise).trim()
  }
  catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(wineError("wine is required"))
    }
    else {
      throw new Error(`Cannot check wine version: ${e}`)
    }
  }

  if (wineVersion.startsWith("wine-")) {
    wineVersion = wineVersion.substring("wine-".length)
  }

  const spaceIndex = wineVersion.indexOf(" ")
  if (spaceIndex > 0) {
    wineVersion = wineVersion.substring(0, spaceIndex)
  }

  const suffixIndex = wineVersion.indexOf("-")
  if (suffixIndex > 0) {
    wineVersion = wineVersion.substring(0, suffixIndex)
  }

  if (wineVersion.split(".").length === 2) {
    wineVersion += ".0"
  }

  if (semver.lt(wineVersion, "1.8.0")) {
    throw new Error(wineError(`wine 1.8+ is required, but your version is ${wineVersion}`))
  }
}