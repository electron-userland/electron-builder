import { CancellationToken, PackageFileInfo, ProgressInfo, UpdateInfo } from "builder-util-runtime"
import { EventEmitter } from "events"
import { OutgoingHttpHeaders } from "http"
import { URL } from "url"
import { AppUpdater } from "./AppUpdater"
import { LoginCallback } from "./electronHttpExecutor"

export { NET_SESSION_NAME } from "./electronHttpExecutor"
export { AppUpdater, NoOpLogger } from "./AppUpdater"
export { UpdateInfo }
export { CancellationToken } from "builder-util-runtime"
export { Provider } from "./Provider"

// autoUpdater to mimic electron bundled autoUpdater
let _autoUpdater: any

// required for jsdoc
export declare const autoUpdater: AppUpdater

function _load_autoUpdater(): AppUpdater {
  // tslint:disable:prefer-conditional-expression
  if (process.platform === "win32") {
    _autoUpdater = new (require("./NsisUpdater").NsisUpdater)()
  }
  else if (process.platform === "darwin") {
    _autoUpdater = new (require("./MacUpdater").MacUpdater)()
  }
  else {
    _autoUpdater = new (require("./AppImageUpdater").AppImageUpdater)()
  }
  return _autoUpdater
}

Object.defineProperty(exports, "autoUpdater", {
  enumerable: true,
  get: () => {
    return _autoUpdater || _load_autoUpdater()
  }
})

export interface FileInfo {
  readonly url: string

  packageInfo?: PackageFileInfo

  readonly sha512?: string

  readonly headers?: OutgoingHttpHeaders
}

// due to historical reasons for windows we use channel name without platform specifier
export function getDefaultChannelName() {
  return `latest${getChannelFilePrefix()}`
}

function getChannelFilePrefix() {
  const currentPlatform = getCurrentPlatform()
  if (currentPlatform === "linux") {
    const arch = process.env.TEST_UPDATER_ARCH || process.arch
    const archSuffix = arch === "x64" ? "" : `-${arch}`
    return "-linux" + archSuffix
  }
  else {
    return currentPlatform === "darwin" ? "-mac" : ""
  }
}

export function getCustomChannelName(channel: string) {
  return `${channel}${getChannelFilePrefix()}`
}

export function getCurrentPlatform() {
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
  /**
   * @deprecated
   */
  readonly versionInfo: UpdateInfo

  readonly updateInfo: UpdateInfo
  readonly fileInfo?: FileInfo

  readonly downloadPromise?: Promise<Array<string>> | null

  readonly cancellationToken?: CancellationToken
}

export type UpdaterEvents = "login" | "checking-for-update" | "update-available" | "update-cancelled" | "download-progress" | "update-downloaded" | "error"

export const DOWNLOAD_PROGRESS: UpdaterEvents = "download-progress"
export const UPDATE_DOWNLOADED: UpdaterEvents = "update-downloaded"

export type LoginHandler = (authInfo: any, callback: LoginCallback) => void

export class UpdaterSignal {
  constructor(private emitter: EventEmitter) {
  }

  /**
   * Emitted when an authenticating proxy is [asking for user credentials](https://github.com/electron/electron/blob/master/docs/api/client-request.md#event-login).
   */
  login(handler: LoginHandler) {
    addHandler(this.emitter, "login", handler)
  }

  progress(handler: (info: ProgressInfo) => void) {
    addHandler(this.emitter, DOWNLOAD_PROGRESS, handler)
  }

  updateDownloaded(handler: (info: UpdateInfo) => void) {
    addHandler(this.emitter, UPDATE_DOWNLOADED, handler)
  }

  updateCancelled(handler: (info: UpdateInfo) => void) {
    addHandler(this.emitter, "update-cancelled", handler)
  }
}

const isLogEvent = false

function addHandler(emitter: EventEmitter, event: UpdaterEvents, handler: (...args: Array<any>) => void) {
  if (isLogEvent) {
    emitter.on(event, (...args: Array<any>) => {
      console.log("%s %s", event, args)
      handler.apply(null, args)
    })
  }
  else {
    emitter.on(event, handler)
  }
}

export interface Logger {
  info(message?: any): void

  warn(message?: any): void

  error(message?: any): void

  debug?(message: string): void
}

// if baseUrl path doesn't ends with /, this path will be not prepended to passed pathname for new URL(input, base)
/** @internal */
export function newBaseUrl(url: string) {
  const result = new URL(url)
  if (!result.pathname.endsWith("/")) {
    result.pathname += "/"
  }
  return result
}

/** @internal */
export function newUrlFromBase(pathname: string, baseUrl: URL): URL {
  const result = new URL(pathname, baseUrl)
  // search is not propagated
  if (!result.search && baseUrl.search) {
    result.search = baseUrl.search
  }
  return result
}