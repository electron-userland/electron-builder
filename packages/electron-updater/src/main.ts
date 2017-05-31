import { RequestHeaders } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { ProgressInfo } from "electron-builder-http/out/ProgressCallbackTransform"
import { VersionInfo } from "electron-builder-http/out/publishOptions"
import { EventEmitter } from "events"
import { format as buggyFormat, Url } from "url"
import { AppUpdater } from "./AppUpdater"
import { LoginCallback } from "./electronHttpExecutor"

export { NET_SESSION_NAME } from "./electronHttpExecutor"
export { AppUpdater } from "./AppUpdater"

// autoUpdater to mimic electron bundled autoUpdater
let _autoUpdater: any

// required for jsdoc
export declare const autoUpdater: AppUpdater

function _load_autoUpdater(): AppUpdater {
  if (process.platform === "win32") {
    _autoUpdater = new (require("./NsisUpdater").NsisUpdater)()
  }
  else if (process.platform === "darwin") {
    _autoUpdater = new (require("./MacUpdater").MacUpdater)()
  }
  else {
    _autoUpdater = require("electron").autoUpdater
  }
  return _autoUpdater
}

Object.defineProperty(exports, "autoUpdater", {
  enumerable: true,
  get: function () {
    return _autoUpdater || _load_autoUpdater()
  }
})

export interface FileInfo {
  readonly name: string
  readonly url: string
  readonly sha2?: string
  readonly headers?: Object
}

export abstract class Provider<T extends VersionInfo> {
  protected requestHeaders: RequestHeaders | null

  setRequestHeaders(value: RequestHeaders | null) {
    this.requestHeaders = value
  }

  abstract getLatestVersion(): Promise<T>

  abstract getUpdateFile(versionInfo: T): Promise<FileInfo>
}

// due to historical reasons for windows we use channel name without platform specifier
export function getDefaultChannelName() {
  return `latest${getChannelFilePrefix()}`
}

function getChannelFilePrefix() {
  return getCurrentPlatform() === "darwin" ? "-mac" : ""
}

export function getCustomChannelName(channel: string) {
  return `${channel}${getChannelFilePrefix()}`
}

export function getCurrentPlatform () {
  return process.env.TEST_UPDATER_PLATFORM || process.platform
}

export function isUseOldMacProvider() {
  // getCurrentPlatform() === "darwin"
  return false
}

export function getChannelFilename(channel: string) {
  return `${channel}.yml`
}

export interface UpdateCheckResult {
  readonly versionInfo: VersionInfo
  readonly fileInfo?: FileInfo

  readonly downloadPromise?: Promise<any> | null

  readonly cancellationToken?: CancellationToken
}

export const DOWNLOAD_PROGRESS = "download-progress"

export type LoginHandler = (authInfo: any, callback: LoginCallback) => void

export class UpdaterSignal {
  constructor(private emitter: EventEmitter) {
  }

  /**
   * Emitted when an authenticating proxy is asking for user credentials.
   * @see [Electron docs](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login)
   */
  login(handler: LoginHandler) {
    addHandler(this.emitter, "login", handler)
  }

  progress(handler: (info: ProgressInfo) => void) {
    addHandler(this.emitter, DOWNLOAD_PROGRESS, handler)
  }

  updateDownloaded(handler: (info: VersionInfo) => void) {
    addHandler(this.emitter, "update-downloaded", handler)
  }

  updateCancelled(handler: (info: VersionInfo) => void) {
    addHandler(this.emitter, "update-cancelled", handler)
  }
}

const isLogEvent = false

function addHandler(emitter: EventEmitter, event: string, handler: Function) {
  if (isLogEvent) {
    emitter.on(event, function (...args: any[]) {
      console.log("%s %s", event, args)
      handler.apply(null, args)
    })
  }
  else {
    emitter.on(event, handler)
  }
}

// url.format doesn't correctly use path and requires explicit pathname
export function formatUrl(url: Url) {
  if (url.path != null && url.pathname == null) {
    url.pathname = url.path
  }
  return buggyFormat(url)
}

export interface Logger {
  info(message?: any): void

  warn(message?: any): void

  error(message?: any): void
}