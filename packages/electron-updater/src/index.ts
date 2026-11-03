import fsExtra from "fs-extra"
import * as path from "path"
import { AppUpdater } from "./AppUpdater.js"
import { AppImageUpdater } from "./AppImageUpdater.js"
import { DebUpdater } from "./DebUpdater.js"
import { MacUpdater } from "./MacUpdater.js"
import { NsisUpdater } from "./NsisUpdater.js"
import { PacmanUpdater } from "./PacmanUpdater.js"
import { RpmUpdater } from "./RpmUpdater.js"

import type { UpdateInfo } from "builder-util-runtime"

export { BaseUpdater } from "./BaseUpdater.js"
export { BitbucketProvider } from "./providers/BitbucketProvider.js"
export { GitHubProvider } from "./providers/GitHubProvider.js"
export { GitLabProvider } from "./providers/GitLabProvider.js"
export { KeygenProvider } from "./providers/KeygenProvider.js"
export { PrivateGitHubProvider } from "./providers/PrivateGitHubProvider.js"
export { ProviderRuntimeOptions } from "./providers/Provider.js"
export { AppImageUpdater, AppUpdater, DebUpdater, MacUpdater, NsisUpdater, PacmanUpdater, RpmUpdater }
export { NoOpLogger } from "./AppUpdater.js"

export { Provider } from "./providers/Provider.js"

export * from "./types.js"

function doLoadAutoUpdater(): AppUpdater {
  let updater: any
  if (process.platform === "win32") {
    updater = new NsisUpdater()
  } else if (process.platform === "darwin") {
    updater = new MacUpdater()
  } else {
    updater = new AppImageUpdater()
    try {
      const identity = path.join(process.resourcesPath, "package-type")
      if (!fsExtra.existsSync(identity)) {
        return updater
      }
      const fileType = fsExtra.readFileSync(identity).toString().trim()
      switch (fileType) {
        case "deb":
          updater = new DebUpdater()
          break
        case "rpm":
          updater = new RpmUpdater()
          break
        case "pacman":
          updater = new PacmanUpdater()
          break
        default:
          break
      }
    } catch (error: any) {
      updater.logger.warn(
        `Unable to detect 'package-type' for autoUpdater (rpm/deb/pacman support). If you'd like to expand support, please consider contributing to electron-builder: ${error.message}`
      )
    }
  }
  return updater
}

let _autoUpdater: AppUpdater | undefined

export const autoUpdater: AppUpdater = new Proxy({} as AppUpdater, {
  get(_target, prop) {
    if (_autoUpdater === undefined) {
      _autoUpdater = doLoadAutoUpdater()
    }
    const value = Reflect.get(_autoUpdater, prop, _autoUpdater)
    return typeof value === "function" ? value.bind(_autoUpdater) : value
  },
  set(_target, prop, value) {
    if (_autoUpdater === undefined) {
      _autoUpdater = doLoadAutoUpdater()
    }
    return Reflect.set(_autoUpdater, prop, value, _autoUpdater)
  },
})

export type VerifyUpdateSupport = (updateInfo: UpdateInfo) => boolean | Promise<boolean>
