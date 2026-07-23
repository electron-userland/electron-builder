import { CancellationToken, PackageFileInfo, ProgressInfo, UpdateFileInfo, UpdateInfo } from "builder-util-runtime"
import { EventEmitter } from "events"
import { URL } from "url"
import { LoginCallback } from "./electronHttpExecutor.js"

export { CancellationToken, PackageFileInfo, ProgressInfo, UpdateFileInfo, UpdateInfo }

export const DOWNLOAD_PROGRESS = "download-progress"
export const UPDATE_DOWNLOADED = "update-downloaded"

export interface Logger {
  info(message?: any): void

  warn(message?: any): void

  error(message?: any): void

  debug?(message: string): void
}

/**
 * When a downloaded update is automatically installed.
 * - `"onQuit"` — install on app quit by spawning the installer while the app exits (the historical `autoInstallOnAppQuit = true` behavior).
 * - `"onNextLaunch"` — persist the downloaded update on quit and install it at the start of the *next* launch, after re-validating it,
 *   so the installer is never killed by an OS session end (see https://github.com/electron-userland/electron-builder/issues/7807).
 * - `"manual"` — never auto-install; the downloaded update stays cached until an explicit `quitAndInstall()` (the historical `autoInstallOnAppQuit = false` behavior).
 */
export type AutoInstallEvent = "manual" | "onQuit" | "onNextLaunch"

export interface QuitAndInstallOptions {
  /**
   * *windows-only* Runs the installer in silent mode.
   * @default false
   */
  isSilent?: boolean
  /**
   * Run the app after finish even on silent install. Not applicable for macOS.
   * Ignored if `isSilent` is set to `false` (in this case you can still set `autoRunAppAfterInstall` to `false` to prevent running the app after install).
   * @default false
   */
  isForceRunAfter?: boolean
  /**
   * Quit WITHOUT spawning the installer and persist the downloaded update for installation on the next application
   * launch instead (same deferred flow as `autoInstallEvent: "onNextLaunch"`, but for a single call). `isSilent` and
   * `isForceRunAfter` are ignored when set. Not applicable for macOS (Squirrel.Mac stages updates natively).
   * @default false
   */
  waitUntilNextLaunch?: boolean
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

export function addHandler(emitter: EventEmitter, event: UpdaterEvents, handler: (...args: Array<any>) => void): void {
  emitter.on(event, handler)
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
