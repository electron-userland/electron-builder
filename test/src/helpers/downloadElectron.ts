import BluebirdPromise from "bluebird-lst/index"
import { readdir, unlink } from "fs-extra-p"
import isCi from "is-ci"
import * as path from "path"
import { ELECTRON_VERSION } from "./testConfig"

const downloadElectron: (options: any) => Promise<any> = BluebirdPromise.promisify(require("electron-download-tf"))

export function deleteOldElectronVersion(): Promise<any> {
  // on CircleCi no need to clean manually
  if (process.env.CIRCLECI || !isCi) {
    return BluebirdPromise.resolve()
  }

  const cacheDir = require("env-paths")("electron", {suffix: ""}).cache
  return BluebirdPromise.map(readdir(cacheDir), (file): any => {
    if (file.endsWith(".zip") && !file.includes(ELECTRON_VERSION)) {
      console.log(`Remove old electron ${file}`)
      return unlink(path.join(cacheDir, file))
    }
    return null
  })
    .catch(e => {
      if (e.code === "ENOENT") {
        return []
      }
      else {
        throw e
      }
    })
}

export function downloadAllRequiredElectronVersions(): Promise<any> {
  const platforms = process.platform === "win32" ? ["win32"] : ["darwin", "linux", "win32"]
  if (process.platform === "darwin") {
    platforms.push("mas")
  }

  const versions: Array<any> = []
  for (const platform of platforms) {
    const archs = (platform === "mas" || platform === "darwin") ? ["x64"] : (platform === "win32" ? ["ia32", "x64"] : ["ia32", "x64", "armv7l"])
    for (const arch of archs) {
      versions.push({
        version: ELECTRON_VERSION,
        arch,
        platform,
      })
    }
  }
  return BluebirdPromise.map(versions, it => downloadElectron(it), {concurrency: 3})
}

if (process.mainModule === module) {
  downloadAllRequiredElectronVersions()
    .catch(error => {
      console.error((error.stack || error).toString())
      process.exitCode = -1
    })
}