import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { rename } from "fs-extra-p"
import { ElectronPackagerOptions } from "./dirPackager"

const rcedit: any = BluebirdPromise.promisify(require("rcedit"))

export function createApp(opts: ElectronPackagerOptions, appOutDir: string, initializeApp: () => Promise<any>) {
  const newExePath = path.join(appOutDir, `${opts.appInfo.productFilename}.exe`)
  return BluebirdPromise.all([
    initializeApp(),
    rename(path.join(appOutDir, "electron.exe"), newExePath)
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