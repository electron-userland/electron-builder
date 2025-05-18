import { UpdateInfo } from "builder-util-runtime"
import { existsSync, readFileSync } from "fs-extra"
import * as path from "path"

import type { AppUpdater } from "./AppUpdater.js"
import { AppImageUpdater } from "./AppImageUpdater.js"
import { DebUpdater } from "./DebUpdater.js"
import { PacmanUpdater } from "./PacmanUpdater.js"
import { RpmUpdater } from "./RpmUpdater.js"
import { MacUpdater } from "./MacUpdater.js"
import { NsisUpdater } from "./NsisUpdater.js"

export { AppImageUpdater } from "./AppImageUpdater.js"
export { AppUpdater, NoOpLogger } from "./AppUpdater.js"
export { BaseUpdater } from "./BaseUpdater.js"
export { DebUpdater } from "./DebUpdater.js"
export { ElectronAppAdapter } from "./ElectronAppAdapter.js"
export { MacUpdater } from "./MacUpdater.js"
export { NsisUpdater } from "./NsisUpdater.js"
export { PacmanUpdater } from "./PacmanUpdater.js"
export { Provider } from "./providers/Provider.js"
export { RpmUpdater } from "./RpmUpdater.js"

export { TestOnlyUpdaterOptions } from "./AppUpdater.js"
export { blockmapFiles, newUrlFromBase } from "./util.js"

export * from "./types.js"

// autoUpdater to mimic electron bundled autoUpdater
let _autoUpdater: any

// required for jsdoc
export declare const autoUpdater: AppUpdater

function doLoadAutoUpdater(): AppUpdater {
  // tslint:disable:prefer-conditional-expression
  if (process.platform === "win32") {
    _autoUpdater = new NsisUpdater()
  } else if (process.platform === "darwin") {
    _autoUpdater = new MacUpdater()
  } else {
    _autoUpdater = new AppImageUpdater()
    try {
      const identity = path.join(process.resourcesPath, "package-type")
      if (!existsSync(identity)) {
        return _autoUpdater
      }
      console.info("Checking for beta autoupdate feature for deb/rpm distributions")
      const fileType = readFileSync(identity).toString().trim()
      console.info("Found package-type:", fileType)
      switch (fileType) {
        case "deb":
          _autoUpdater = new DebUpdater()
          break
        case "rpm":
          _autoUpdater = new RpmUpdater()
          break
        case "pacman":
          _autoUpdater = new PacmanUpdater()
          break
        default:
          break
      }
    } catch (error: any) {
      console.warn(
        "Unable to detect 'package-type' for autoUpdater (beta rpm/deb support). If you'd like to expand support, please consider contributing to electron-builder",
        error.message
      )
    }
  }
  return _autoUpdater
}

Object.defineProperty(exports, "autoUpdater", {
  enumerable: true,
  get: () => {
    return _autoUpdater || doLoadAutoUpdater()
  },
})

/**
 * return null if verify signature succeed
 * return error message if verify signature failed
 */
export type VerifyUpdateCodeSignature = (publisherName: string[], path: string) => Promise<string | null>

export type VerifyUpdateSupport = (updateInfo: UpdateInfo) => boolean | Promise<boolean>
