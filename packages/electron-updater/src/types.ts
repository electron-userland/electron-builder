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

  /**
   * Resolves with the downloaded files once the automatic download has finished (see `autoDownload`).
   * `null` when `autoDownload` is `false` — call `downloadUpdate()` to start the download manually.
   */
  readonly downloadPromise?: Promise<DownloadExecutorResult> | null

  readonly cancellationToken?: CancellationToken

  /** @deprecated */
  readonly versionInfo: UpdateInfo
}

export interface UpdateDownloadedEvent extends UpdateInfo {
  downloadedFile: string
  /**
   * Path to the downloaded NSIS web installer package (`package-<version>.7z`). Only set for web installers.
   */
  packageFile?: string
}

/**
 * The files produced by a finished download — resolved by `downloadUpdate()` and by `UpdateCheckResult.downloadPromise`.
 */
export interface DownloadExecutorResult {
  /**
   * Path to the downloaded update file (installer, AppImage, zip, ...).
   */
  readonly updateFile: string
  /**
   * Path to the downloaded NSIS web installer package (`package-<version>.7z`). Only set for web installers.
   */
  readonly packageFile?: string
}

export interface ResolvedUpdateFileInfo {
  readonly url: URL
  readonly info: UpdateFileInfo

  /** The resolved `info.blockMapUrl`, when the update manifest names the file's blockmap. */
  readonly blockMapUrl?: URL

  packageInfo?: PackageFileInfo
}

export type UpdaterEvents = "login" | "checking-for-update" | "update-available" | "update-not-available" | "update-cancelled" | "download-progress" | "update-downloaded" | "error"

export type LoginHandler = (authInfo: any, callback: LoginCallback) => void

/**
 * Outcome of a downloaded-update-file verification. A failure must carry a `message` explaining why, so that the
 * error surfaced to the app always names a reason.
 */
export type VerifyUpdateFileResult = { response: "success" } | { response: "failure"; message: string }

/**
 * Custom verification of an update file, run before the file is allowed to become installable.
 *
 * It is invoked on every path that can lead to an install:
 * - right after a fresh download, while the file still sits under a temporary name (see `updateFilePath`);
 * - when an update downloaded by an earlier session is reused from the updater cache;
 * - before an install-on-next-launch spawns the cached installer.
 */
export type VerifyUpdateFile = (params: {
  /**
   * Absolute path to the update file to verify. For a fresh download this is a temporary path — the file is renamed
   * to `originalUpdateFileName` only after this verification succeeds, so it can never be executed under its real
   * name while unverified. When a cached or pending update is re-verified the file already sits under its real name.
   */
  updateFilePath: string
  /**
   * The real file name of the update, i.e. the name `updateFilePath` has (or will be given once verified).
   */
  originalUpdateFileName: string
  /**
   * Path to the downloaded NSIS web installer package (`package-<version>.7z`). Only set for web installers.
   */
  packageFilePath?: string
  /**
   * The cancellation token of the download this verification belongs to. Not set when a cached or pending update is
   * re-verified outside a download.
   */
  cancellationToken?: CancellationToken
}) => Promise<VerifyUpdateFileResult>

/**
 * Verification of a pending NSIS update file against a Windows Authenticode signature.
 */
export type VerifyUpdateFileAuthenticodeSignature = (publisherName: string[], path: string) => Promise<VerifyUpdateFileResult>

/**
 * @deprecated Use VerifyUpdateFileAuthenticodeSignature instead, which differs in return type.
 * This is a compatibility shim that keeps the old return type: returns null if verify signature succeeds or returns error message if it failed.
 * Shall be deleted in electron-builder v28.
 */
export type VerifyUpdateCodeSignature = (publisherName: string[], path: string) => Promise<string | null>

/**
 * Normalizes a verifier result into `null` (verified) or a non-empty failure message.
 *
 * Accepts `null`/`undefined` so that a hook violating the contract — a JS implementation with a missing return, say —
 * fails closed with a reason instead of throwing a `TypeError` at the call site. An empty `message` is treated the
 * same way, so a failure can never be reported without a reason.
 */
export function verificationFailureMessage(result: VerifyUpdateFileResult | null | undefined): string | null {
  if (result?.response === "success") {
    return null
  }
  return (result?.response === "failure" ? result.message : null) || "unknown error"
}
