import * as path from "path"
import { ElectronPackagerOptions } from "./dirPackager"

export function userIgnoreFilter(opts: ElectronPackagerOptions, appDir: string) {
  let ignore = opts.ignore || []
  let ignoreFunc: any

  if (typeof (ignore) === "function") {
    ignoreFunc = function (file: string) { return !ignore(file) }
  }
  else {
    if (!Array.isArray(ignore)) {
      ignore = [ignore]
    }

    ignoreFunc = function (file: string) {
      for (let i = 0; i < ignore.length; i++) {
        if (file.match(ignore[i])) {
          return false
        }
      }

      return true
    }
  }

  return function filter(file: string) {
    let name = file.split(path.resolve(appDir))[1]
    if (path.sep === "\\") {
      // convert slashes so unix-format ignores work
      name = name.replace(/\\/g, "/")
    }
    return ignoreFunc(name)
  }
}

export function initializeApp(opts: any, buildDir: string, appRelativePath: string) {
  return opts.initializeApp(opts, buildDir, appRelativePath)
}