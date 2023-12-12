import { CancellationToken, PackageFileInfo, ProgressInfo, UpdateFileInfo, UpdateInfo } from "builder-util-runtime"
import { EventEmitter } from "events"
import { existsSync, readFileSync } from "fs-extra"
import * as path from "path"
import { URL } from "url"
import { AppUpdater } from "./AppUpdater"
import { LoginCallback } from "./electronHttpExecutor"

export { BaseUpdater } from "./BaseUpdater"
export { AppUpdater, NoOpLogger } from "./AppUpdater"
export { CancellationToken, PackageFileInfo, ProgressInfo, UpdateFileInfo, UpdateInfo }
export { Provider } from "./providers/Provider"
export { AppImageUpdater } from "./AppImageUpdater"
export { DebUpdater } from "./DebUpdater"
export { RpmUpdater } from "./RpmUpdater"
export { MacUpdater } from "./MacUpdater"
export { NsisUpdater } from "./NsisUpdater"

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
      const identity = path.join(process.resourcesPath!, "package-type")
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

export interface ResolvedUpdateFileInfo {
  readonly url: URL
  readonly info: UpdateFileInfo

  packageInfo?: PackageFileInfo
}

export interface UpdateCheckResult {
  readonly updateInfo: UpdateInfo

  readonly downloadPromise?: Promise<Array<string>> | null

  readonly cancellationToken?: CancellationToken

  /** @deprecated */
  readonly versionInfo: UpdateInfo
}

export type UpdaterEvents = "login" | "checking-for-update" | "update-available" | "update-not-available" | "update-cancelled" | "download-progress" | "update-downloaded" | "error"

export const DOWNLOAD_PROGRESS = "download-progress"
export const UPDATE_DOWNLOADED = "update-downloaded"

export type LoginHandler = (authInfo: any, callback: LoginCallback) => void

export class UpdaterSignal {
  constructor(private emitter: EventEmitter) {}

  /**
   * Emitted when an authenticating proxy is [asking for user credentials](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login).
   */
  login(handler: LoginHandler): void {
    addHandler(this.emitter, "login", handler)
  }

  progress(handler: (info: ProgressInfo) => void): void {
    addHandler(this.emitter, DOWNLOAD_PROGRESS, handler)
  }

  updateDownloaded(handler: (info: UpdateDownloadedEvent) => void): void {
    addHandler(this.emitter, UPDATE_DOWNLOADED, handler)
  }

  updateCancelled(handler: (info: UpdateInfo) => void): void {
    addHandler(this.emitter, "update-cancelled", handler)
  }
}

export interface UpdateDownloadedEvent extends UpdateInfo {
  downloadedFile: string
}

const isLogEvent = false

function addHandler(emitter: EventEmitter, event: UpdaterEvents, handler: (...args: Array<any>) => void): void {
  if (isLogEvent) {
    emitter.on(event, (...args: Array<any>) => {
      console.log("%s %s", event, args)
      handler(...args)
    })
  } else {
    emitter.on(event, handler)
  }
}

export interface Logger {
  info(message?: any): void

  warn(message?: any): void

  error(message?: any): void

  debug?(message: string): void
}

// return null if verify signature succeed
// return error message if verify signature failed

export type verifyUpdateCodeSignature = (publisherName: string[], path: string) => Promise<string | null>
