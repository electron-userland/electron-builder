import { exec, ExecOptions, Lazy } from "electron-builder-util"
import { getBinFromGithub } from "electron-builder-util/out/binDownload"
import * as path from "path"
import { lt as isVersionLessThan } from "semver"
import { computeEnv, EXEC_TIMEOUT, ToolInfo } from "./bundledTool"
import { isOsVersionGreaterThanOrEqualTo } from "./macosVersion"

const wineExecutable = new Lazy<ToolInfo>(async () => {
  if (process.platform === "darwin" && await isOsVersionGreaterThanOrEqualTo("10.12")) {
    // noinspection SpellCheckingInspection
    const wineDir = await getBinFromGithub("wine", "2.0.1-mac-10.12", "IvKwDml/Ob0vKfYVxcu92wxUzHu8lTQSjjb8OlCTQ6bdNpVkqw17OM14TPpzGMIgSxfVIrQZhZdCwpkxLyG3mg==")
    return {
      path: path.join(wineDir, "bin/wine"),
      env: Object.assign({
        WINEDEBUG: "-all,err+all",
        WINEDLLOVERRIDES: "winemenubuilder.exe=d",
        WINEPREFIX: path.join(wineDir, "wine-home"),
        DYLD_FALLBACK_LIBRARY_PATH: computeEnv(process.env.DYLD_FALLBACK_LIBRARY_PATH, [path.join(wineDir, "lib")]),
      })
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
      .then(wine => exec(wine.path, [file].concat(args), wine.env == null ? options : Object.assign({env: wine.env}, options)))
  }
}

/** @private */
export function prepareArgs(args: Array<string>, exePath: string) {
  if (process.platform !== "win32") {
    args.unshift(exePath)
  }
  return args
}

/** @private */
export async function checkWineVersion(checkPromise: Promise<string>) {
  function wineError(prefix: string): string {
    return `${prefix}, please see https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build#${(process.platform === "linux" ? "linux" : "macos")}`
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

  if (isVersionLessThan(wineVersion, "1.8.0")) {
    throw new Error(wineError(`wine 1.8+ is required, but your version is ${wineVersion}`))
  }
}