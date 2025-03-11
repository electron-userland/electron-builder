import { CancellationToken, PackageFileInfo, ProgressInfo, UpdateFileInfo, UpdateInfo } from "builder-util-runtime"
import { EventEmitter } from "events"
import { URL } from "url"
import { LoginCallback } from "./electronHttpExecutor"

export { CancellationToken, PackageFileInfo, ProgressInfo, UpdateFileInfo, UpdateInfo }

export const DOWNLOAD_PROGRESS = "download-progress"
export const UPDATE_DOWNLOADED = "update-downloaded"

export interface Logger {
  info(message?: any): void

  warn(message?: any): void

  error(message?: any): void

  debug?(message: string): void
}

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

const isLogEvent = false

export function addHandler(emitter: EventEmitter, event: UpdaterEvents, handler: (...args: Array<any>) => void): void {
  if (isLogEvent) {
    emitter.on(event, (...args: Array<any>) => {
      console.log("%s %s", event, args)
      handler(...args)
    })
  } else {
    emitter.on(event, handler)
  }
}

export interface UpdateCheckResult {
  readonly isUpdateAvailable: boolean

  readonly updateInfo: UpdateInfo

  readonly downloadPromise?: Promise<Array<string>> | null

  readonly cancellationToken?: CancellationToken

  /** @deprecated */
  readonly versionInfo: UpdateInfo
}

export interface UpdateDownloadedEvent extends UpdateInfo {
  downloadedFile: string
}

export interface ResolvedUpdateFileInfo {
  readonly url: URL
  readonly info: UpdateFileInfo

  packageInfo?: PackageFileInfo
}

export type UpdaterEvents = "login" | "checking-for-update" | "update-available" | "update-not-available" | "update-cancelled" | "download-progress" | "update-downloaded" | "error"

export type LoginHandler = (authInfo: any, callback: LoginCallback) => void
