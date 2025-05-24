import { existsSync, readFileSync } from "fs-extra"
import * as path from "path"
import { AppUpdater } from "./AppUpdater"
import { UpdateInfo } from "builder-util-runtime"

export { BaseUpdater } from "./BaseUpdater"
export { AppUpdater, NoOpLogger } from "./AppUpdater"
export { Provider } from "./providers/Provider"
export { AppImageUpdater } from "./AppImageUpdater"
export { DebUpdater } from "./DebUpdater"
export { PacmanUpdater } from "./PacmanUpdater"
export { RpmUpdater } from "./RpmUpdater"
export { MacUpdater } from "./MacUpdater"
export { NsisUpdater } from "./NsisUpdater"

export * from "./types"

// autoUpdater to mimic electron bundled autoUpdater
let _autoUpdater: any

// required for jsdoc
export declare const autoUpdater: AppUpdater

function doLoadAutoUpdater(): AppUpdater {
  // tslint:disable:prefer-conditional-expression
  if (process.platform === "win32") {
    _autoUpdater = new (require("./NsisUpdater").NsisUpdater)()
  } else if (process.platform === "darwin") {
    _autoUpdater = new (require("./MacUpdater").MacUpdater)()
  } else {
    _autoUpdater = new (require("./AppImageUpdater").AppImageUpdater)()
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
          _autoUpdater = new (require("./DebUpdater").DebUpdater)()
          break
        case "rpm":
          _autoUpdater = new (require("./RpmUpdater").RpmUpdater)()
          break
        case "pacman":
          _autoUpdater = new (require("./PacmanUpdater").PacmanUpdater)()
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
