import { rename } from "fs-extra-p"
import * as path from "path"
import { ElectronPackagerOptions } from "./dirPackager"
import { Promise as BluebirdPromise } from "bluebird"

export function createApp(opts: ElectronPackagerOptions, appOutDir: string, initializeApp: () => Promise<any>) {
  return BluebirdPromise.all([
    initializeApp(),
    rename(path.join(appOutDir, "electron"), path.join(appOutDir, opts.appInfo.productFilename))
  ])
}