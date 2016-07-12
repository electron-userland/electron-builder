import { rename } from "fs-extra-p"
import * as path from "path"
import { initializeApp } from "./common"
import { ElectronPackagerOptions } from "./dirPackager"
import { Promise as BluebirdPromise } from "bluebird"

export function createApp(opts: ElectronPackagerOptions, buildDir: string) {
  return BluebirdPromise.all([
    initializeApp(opts, buildDir, path.join("resources", "app")),
    rename(path.join(buildDir, "electron"), path.join(buildDir, opts.appInfo.productFilename))
  ])
}