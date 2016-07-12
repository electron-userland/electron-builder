import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { rename } from "fs-extra-p"
import { ElectronPackagerOptions } from "./dirPackager"
import { initializeApp } from "./common"

const rcedit: any = BluebirdPromise.promisify(require("rcedit"))

export function createApp(opts: ElectronPackagerOptions, buildDir: string) {
  const newExePath = path.join(buildDir, `${opts.appInfo.productFilename}.exe`)
  return BluebirdPromise.all([
    initializeApp(opts, buildDir, path.join("resources", "app")),
    rename(path.join(buildDir, "electron.exe"), newExePath)
      .then(() => {
        const appInfo = opts.appInfo
        return rcedit(newExePath, {
          "version-string": appInfo.versionString,
          "file-version": appInfo.buildVersion,
          "product-version": appInfo.version,
          icon: opts.icon
        })
      })
  ])
}