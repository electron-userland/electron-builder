import { createRequire } from "module"
import fsExtra from "fs-extra"
import * as path from "path"
import { AppUpdater } from "./AppUpdater.js"

const require = createRequire(import.meta.url)

export { ElectronAppAdapter } from "./ElectronAppAdapter.js"

import { UpdateInfo } from "builder-util-runtime"

export { BaseUpdater } from "./BaseUpdater.js"
export { AppUpdater, NoOpLogger, TestOnlyUpdaterOptions } from "./AppUpdater.js"

export { AppImageUpdater } from "./AppImageUpdater.js"
export { DebUpdater } from "./DebUpdater.js"
export { PacmanUpdater } from "./PacmanUpdater.js"
export { RpmUpdater } from "./RpmUpdater.js"
export { MacUpdater } from "./MacUpdater.js"
export { NsisUpdater } from "./NsisUpdater.js"

export { Provider } from "./providers/Provider.js"
export { GitHubProvider } from "./providers/GitHubProvider.js"
export { GitLabProvider } from "./providers/GitLabProvider.js"

export * from "./types.js"
export * as utils from "./util.js"

function doLoadAutoUpdater(): AppUpdater {
  let updater: any
  if (process.platform === "win32") {
    updater = new (require("./NsisUpdater.js").NsisUpdater)()
  } else if (process.platform === "darwin") {
    updater = new (require("./MacUpdater.js").MacUpdater)()
  } else {
    updater = new (require("./AppImageUpdater.js").AppImageUpdater)()
    try {
      const identity = path.join(process.resourcesPath, "package-type")
      if (!fsExtra.existsSync(identity)) {
        return updater
      }
      const fileType = fsExtra.readFileSync(identity).toString().trim()
      switch (fileType) {
        case "deb":
          updater = new (require("./DebUpdater.js").DebUpdater)()
          break
        case "rpm":
          updater = new (require("./RpmUpdater.js").RpmUpdater)()
          break
        case "pacman":
          updater = new (require("./PacmanUpdater.js").PacmanUpdater)()
          break
        default:
          break
      }
    } catch (error: any) {
      console.warn(
        "Unable to detect 'package-type' for autoUpdater (rpm/deb/pacman support). If you'd like to expand support, please consider contributing to electron-builder",
        error.message
      )
    }
  }
  return updater
}

export const autoUpdater: AppUpdater = doLoadAutoUpdater()

/**
 * return null if verify signature succeed
 * return error message if verify signature failed
 */
export type VerifyUpdateCodeSignature = (publisherName: string[], path: string) => Promise<string | null>

export type VerifyUpdateSupport = (updateInfo: UpdateInfo) => boolean | Promise<boolean>
