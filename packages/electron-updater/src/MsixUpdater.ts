import { createRequire } from "node:module"
import { AllPublishOptions, newError, UpdateFileInfo } from "builder-util-runtime"
import { MSIX_UPDATER_ELECTRON_VERSION_RANGE } from "builder-util-runtime/internal"
import { release } from "os"
import * as path from "path"
import { satisfies } from "semver"
import { pathToFileURL } from "url"
import { AppAdapter } from "./AppAdapter.js"
import { AppUpdater, DownloadUpdateOptions } from "./AppUpdater.js"
import { DownloadedUpdateHelper } from "./DownloadedUpdateHelper.js"
import { ProviderRuntimeOptions } from "./providers/Provider.js"
import { DownloadExecutorResult, QuitAndInstallOptions } from "./types.js"
import { readPackageType } from "./util.js"

const require = createRequire(import.meta.url)

// staging a large bundle can take minutes, and the native updater has no timeout of its own
const MSIX_STAGING_TIMEOUT_MINUTES = 10

/**
 * What Electron's MSIX autoUpdater reports about the running package (`autoUpdater.getPackageInfo()`, undocumented and not in electron.d.ts).
 * @internal
 */
export interface MsixPackageInfo {
  readonly familyName: string
  readonly version: string
  readonly developmentMode?: boolean
  readonly signatureKind?: "developer" | "enterprise" | "none" | "store" | "system"
  readonly appInstallerUri?: string
}

type MsixNativeUpdater = Electron.AutoUpdater & { getPackageInfo?: () => MsixPackageInfo | undefined }

/**
 * Whether the Windows `autoUpdater` is a MsixUpdater: only an MSIX package built with `msix.electronUpdaterAware` is marked `msix`. Every other
 * app keeps NsisUpdater, also with package identity (process.windowsStore is true for a sparse package too), so that it does not stop updating.
 * @internal
 */
export function isMsixInstall(packageType: string | null): boolean {
  return packageType === "msix"
}

/**
 * Why MsixUpdater cannot update the running app, or `null` when it can.
 * @internal
 */
export function getMsixInactiveReason(env: {
  readonly packageType: string | null
  readonly isWindowsStore: boolean
  readonly packageInfo: MsixPackageInfo | null
  readonly electronVersion: string | undefined
  readonly osRelease: string
}): string | null {
  if (env.packageType !== "msix") {
    return `resources/package-type is ${JSON.stringify(env.packageType)}, not "msix": build the MSIX package with msix.electronUpdaterAware`
  }
  if (!env.isWindowsStore) {
    return "the app does not run with package identity (process.windowsStore is not true)"
  }
  const info = env.packageInfo
  if (info == null || typeof info.familyName !== "string" || info.familyName.length === 0) {
    return "Electron's autoUpdater provides no MSIX package info (autoUpdater.getPackageInfo() is missing, failed or returned no familyName)"
  }
  if (env.electronVersion == null || !satisfies(env.electronVersion, MSIX_UPDATER_ELECTRON_VERSION_RANGE, { includePrerelease: true })) {
    return `Electron ${env.electronVersion ?? "(unknown version)"} cannot install an MSIX update that electron-updater downloaded (needs ${MSIX_UPDATER_ELECTRON_VERSION_RANGE})`
  }
  // the native updater stages with AddPackageByUriAsync and deferred registration
  const build = Number(env.osRelease.split(".")[2])
  if (!Number.isInteger(build) || build < 19041) {
    return `Windows ${env.osRelease} is older than Windows 10 version 2004 (10.0.19041)`
  }
  if (info.signatureKind !== "developer" && info.signatureKind !== "enterprise") {
    return `the package signature kind is "${info.signatureKind ?? "unknown"}", not "developer" or "enterprise": the Microsoft Store updates Store packages, Windows updates system packages, and an unsigned package cannot be updated`
  }
  if (info.developmentMode === true) {
    return "the package is registered in development mode (Add-AppxPackage -Register)"
  }
  if (info.appInstallerUri) {
    return `Windows App Installer manages the updates of the package (${info.appInstallerUri})`
  }
  return null
}

/**
 * Refuses, before it is downloaded, an update that Windows would install as another app or not install at all.
 * @internal
 */
export function checkMsixUpdateFile(fileInfo: UpdateFileInfo, installed: MsixPackageInfo, allowDowngrade: boolean): void {
  const familyName = fileInfo.packageFamilyName
  if (typeof familyName !== "string" || familyName.toLowerCase() !== installed.familyName.toLowerCase()) {
    throw newError(
      `The update ${fileInfo.url} is for the MSIX package family ${familyName ?? "(not recorded)"}, but this app is ${installed.familyName}: ` +
        "Windows would install it as another app. msix.identityName and msix.publisher (the subject of the signing certificate) must not change between releases",
      "ERR_UPDATER_MSIX_PACKAGE_FAMILY_MISMATCH"
    )
  }
  const comparison = compareMsixVersions(fileInfo.packageVersion, installed.version)
  // an equal version never installs, so it is refused even with allowDowngrade, which the channel setter turns on
  if (comparison == null || comparison === 0 || (comparison < 0 && !allowDowngrade)) {
    throw newError(
      `The update ${fileInfo.url} has the MSIX package version ${fileInfo.packageVersion ?? "(not recorded)"} and the installed package ${installed.version}: ` +
        "Windows only updates a package to a higher 4-part version, or to a lower one with allowDowngrade. A prerelease gets the 4-part version of its release unless msix.setBuildNumber is set",
      "ERR_UPDATER_MSIX_VERSION_NOT_HIGHER"
    )
  }
}

// Windows compares package versions (Major.Minor.Build.Revision) part by part; null for a missing or malformed version
function compareMsixVersions(candidate: string | undefined, installed: string): number | null {
  const parse = (version: unknown) => (typeof version === "string" && /^\d+\.\d+\.\d+\.\d+$/.test(version) ? version.split(".").map(Number) : null)
  const a = parse(candidate)
  const b = parse(installed)
  if (a == null || b == null) {
    return null
  }
  const index = a.findIndex((part, i) => part !== b[i])
  return index === -1 ? 0 : Math.sign(a[index] - b[index])
}

/**
 * Updates an app installed from an MSIX package. electron-updater reads `<channel>-msix.yml` (e.g. `latest-msix.yml`) and downloads and
 * verifies the `.msixbundle` like for every other target, with every provider. Electron's native MSIX autoUpdater then has Windows stage the
 * bundle, and Windows installs it on `quitAndInstall()` or when the app is launched next.
 *
 * Requirements (otherwise it stays inactive, `checkForUpdates()` resolves `null`, and the reason is logged once):
 * - the package is built with `msix.electronUpdaterAware`;
 * - Electron 39.5.2 or later 39.x, 40.2.1 or later 40.x, or 41.0.0-alpha.6 and later;
 * - Windows 10 version 2004 (10.0.19041) or later;
 * - the package is signed with a developer or enterprise certificate that the machine trusts (not a Microsoft Store, development-mode or
 *   App Installer install).
 *
 * The update manifest has to be signed (`updateManifestPublicKey`, embedded into `app-update.yml` by a build with signing keys): an update
 * whose manifest no trusted key verified in the update check is refused with `ERR_UPDATER_MSIX_MANIFEST_NOT_SIGNED`.
 *
 * `autoUpdater` is a MsixUpdater only in a package built with `msix.electronUpdaterAware` (`resources/package-type` is `msix`).
 * See https://www.electron.build/docs/msix#auto-updates
 */
export class MsixUpdater extends AppUpdater {
  private readonly nativeUpdater: MsixNativeUpdater = require("electron").autoUpdater

  private _packageInfo: MsixPackageInfo | null | undefined = undefined

  private inactiveReason: string | null | undefined = undefined

  // the sha512 of the bundle that Windows staged in this process
  private stagedSha512: string | null = null

  // the staging that callers wait for, until its native operation reports or times out
  private staging: { readonly sha512: string; readonly promise: Promise<void> } | null = null

  // the native operation in flight, until it reports: it outlives a staging that timed out, and the native updater has one feed URL
  private nativeStaging: { readonly file: string; readonly end: (error: Error | null) => void } | null = null

  private isNativeErrorListenerAdded = false

  private isNativeInstallInProgress = false

  // the native quitAndInstall call in progress, so that the outcome of an earlier one cannot end a later one
  private nativeInstallAttempt = 0

  private isQuitAndInstallCalled = false

  private isSessionEndBridged = false

  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  // null without package identity, on which the native getPackageInfo throws
  private get packageInfo(): MsixPackageInfo | null {
    if (this._packageInfo === undefined) {
      try {
        this._packageInfo = this.nativeUpdater.getPackageInfo?.() ?? null
      } catch (_ignored) {
        this._packageInfo = null
      }
    }
    return this._packageInfo
  }

  public isUpdaterActive(): boolean {
    if (!super.isUpdaterActive()) {
      return false
    }
    if (this.inactiveReason === undefined) {
      // fixed for the life of the process: computed and logged once, and no native listener is ever attached while inactive
      this.inactiveReason = getMsixInactiveReason({
        packageType: readPackageType(),
        isWindowsStore: process.windowsStore === true,
        packageInfo: this.packageInfo,
        electronVersion: process.versions.electron,
        osRelease: release(),
      })
      if (this.inactiveReason != null) {
        this._logger.info(`MSIX auto-update is inactive: ${this.inactiveReason}. See https://www.electron.build/docs/msix#auto-updates`)
      }
    }
    return this.inactiveReason == null
  }

  // every provider then reads <channel>-msix.yml. The AppUpdater constructor calls it before the fields of this class are set
  protected createProviderRuntimeOptions(): ProviderRuntimeOptions {
    return { ...super.createProviderRuntimeOptions(), isMsix: true }
  }

  // A new folder that a full-trust packaged app creates under %LOCALAPPDATA% (the default cache dir) is virtualized into the package, where
  // the AppX deployment service that reads the file:// URL of the bundle cannot see it; the package's own LocalCache is the same real path for both.
  // the package info is there when the updater is active; a download started on an inactive updater (downloadUpdate() without a check) has none
  private requirePackageInfo(): MsixPackageInfo {
    const info = this.packageInfo
    if (info == null) {
      throw newError(
        "MsixUpdater cannot download an update: Electron's autoUpdater provides no MSIX package info, so the app does not run as an installed MSIX package. See https://www.electron.build/docs/msix#updater-requirements",
        "ERR_UPDATER_MSIX_INACTIVE"
      )
    }
    return info
  }

  protected async getOrCreateDownloadHelper(): Promise<DownloadedUpdateHelper> {
    let result = this.downloadedUpdateHelper
    if (result == null) {
      const dirName = (await this.configOnDisk.value).updaterCacheDirName
      const cacheDir = path.join(this.app.baseCachePath, "Packages", this.requirePackageInfo().familyName, "LocalCache", dirName || this.app.name)
      this._logger.debug?.(`updater cache dir: ${cacheDir}`)
      result = new DownloadedUpdateHelper(cacheDir)
      this.downloadedUpdateHelper = result
    }
    return result
  }

  protected async doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<DownloadExecutorResult> {
    const { info, provider } = downloadUpdateOptions.updateInfoAndProvider
    // Windows installs any package signed with a certificate the machine trusts, even another app's, and the packageFamilyName /
    // packageVersion hints are unsigned: only a manifest that a trusted key verified in the update check pins the bundle by its sha512
    if (!this.isManifestVerified(info)) {
      throw newError(
        "MSIX updates require a signed update manifest: build with updateManifest signing keys, so that their public key is embedded into app-update.yml " +
          "(or set autoUpdater.updateManifestPublicKey before checking for updates). See https://www.electron.build/docs/features/signed-update-manifests",
        "ERR_UPDATER_MSIX_MANIFEST_NOT_SIGNED"
      )
    }

    const files = provider.resolveFiles(info)
    // the bundle only, never findFile's files[0] fallback: an app installed from a bundle cannot be updated with a single .msix. info.url as
    // well, because the private GitHub provider resolves files to extensionless API URLs
    const fileInfo = files.find(it => [it.info.url, it.url.pathname].some(name => name.toLowerCase().endsWith(".msixbundle")))
    if (fileInfo == null) {
      throw newError(
        `No .msixbundle in the update info (${files.map(it => it.info.url).join(", ")}): an MSIX install reads <channel>-msix.yml (e.g. latest-msix.yml), ` +
          "which electron-builder writes for an msix target with msix.electronUpdaterAware",
        "ERR_UPDATER_MSIX_FILE_NOT_FOUND"
      )
    }
    checkMsixUpdateFile(fileInfo.info, this.requirePackageInfo(), this.allowDowngrade)

    return await this.executeDownload({
      fileExtension: "msixbundle",
      fileInfo,
      downloadUpdateOptions,
      task: (destinationFile, downloadOptions) => this.httpExecutor.download(fileInfo.url, destinationFile, downloadOptions),
      done: async event => {
        // "update-downloaded" means that Windows staged the update, except in "manual" mode, where quitAndInstall stages it. A staging
        // failure rejects the download, and the verified bundle stays cached for the next check
        if (this.autoInstallEvent !== "manual") {
          await this.stage(event.downloadedFile, fileInfo.info.sha512)
        }
        this.dispatchUpdateDownloaded(event)
      },
    })
  }

  // Electron's MSIX autoUpdater stages the bundle with AddPackageByUriAsync and deferred registration: Windows registers it on the native
  // quitAndInstall, or at the next launch of the app. One native operation at a time, keyed by the sha512 of the bundle.
  private stage(file: string, sha512: string): Promise<void> {
    if (this.stagedSha512 === sha512) {
      return Promise.resolve()
    }
    const inProgress = this.staging
    if (inProgress != null) {
      if (inProgress.sha512 === sha512) {
        return inProgress.promise
      }
      // the native updater has one feed URL: stage this bundle once the other one is settled, whatever the outcome
      const stageNext = () => this.stage(file, sha512)
      return inProgress.promise.then(stageNext, stageNext)
    }
    const timedOut = this.nativeStaging
    if (timedOut != null) {
      // a new feed URL could change what the running operation installs
      return Promise.reject(
        newError(
          `Windows could not stage the update ${file}: Electron's MSIX autoUpdater is still staging ${timedOut.file}, which gave no result within ${MSIX_STAGING_TIMEOUT_MINUTES} minutes. A later check stages the update again`,
          "ERR_UPDATER_MSIX_STAGING_FAILED"
        )
      )
    }

    this.addNativeErrorListener()
    const native = this.nativeUpdater
    const deferred = createDeferred()
    let isSettled = false
    const settle = (error: Error | null) => {
      if (isSettled) {
        return
      }
      isSettled = true
      clearTimeout(timer)
      this.staging = null
      if (error == null) {
        this.stagedSha512 = sha512
        this._logger.info(`Windows staged the update ${file}`)
        deferred.resolve()
      } else {
        deferred.reject(newError(`Windows could not stage the update ${file}: ${error.message}`, "ERR_UPDATER_MSIX_STAGING_FAILED"))
      }
    }

    // the first outcome ends the native operation, also once the timeout has settled the staging
    let isEnded = false
    const end = (error: Error | null) => {
      if (isEnded) {
        return
      }
      isEnded = true
      native.removeListener("update-downloaded", onStaged)
      native.removeListener("update-not-available", onNotAvailable)
      this.nativeStaging = null
      if (!isSettled) {
        settle(error)
      } else if (error == null) {
        this.stagedSha512 = sha512
        this._logger.info(`Windows staged the update ${file} after the staging timed out`)
      } else {
        this._logger.warn(`Windows could not stage the update ${file}, after the staging timed out: ${error.message}`)
      }
    }
    const onStaged = () => end(null)
    const onNotAvailable = () => end(new Error("Electron's MSIX autoUpdater reported no update"))
    const timer = setTimeout(() => settle(new Error(`no result within ${MSIX_STAGING_TIMEOUT_MINUTES} minutes`)), MSIX_STAGING_TIMEOUT_MINUTES * 60 * 1000)
    native.once("update-downloaded", onStaged)
    native.once("update-not-available", onNotAvailable)
    this.staging = { sha512, promise: deferred.promise }
    this.nativeStaging = { file, end }

    this._logger.info(`Staging the update ${file} with Electron's MSIX autoUpdater`)
    try {
      // the native updater fetches the URL, whose path has to end in .msixbundle, and passes it to AddPackageByUriAsync
      native.setFeedURL({ url: pathToFileURL(file).href, allowAnyVersion: this.allowDowngrade })
      // its MSIX implementation is async: an error that it does not emit rejects the returned promise
      const result: unknown = native.checkForUpdates()
      if (isPromiseLike(result)) {
        void result.then(undefined, (e: unknown) => end(toError(e)))
      }
    } catch (e: unknown) {
      end(toError(e))
    }
    return deferred.promise
  }

  // Electron's autoUpdater throws on an "error" without a listener, and its MSIX implementation emits some errors twice: one listener, added
  // at the first native operation, gives each error to the operation in progress
  private addNativeErrorListener(): void {
    if (this.isNativeErrorListenerAdded) {
      return
    }
    this.isNativeErrorListenerAdded = true
    this.nativeUpdater.on("error", (error: Error) => {
      const nativeStaging = this.nativeStaging
      if (nativeStaging != null) {
        nativeStaging.end(error)
      } else if (this.isNativeInstallInProgress) {
        this.isNativeInstallInProgress = false
        this.isQuitAndInstallCalled = false
        this.dispatchError(newError(`Windows could not install the staged update: ${error.message}`, "ERR_UPDATER_MSIX_INSTALL_FAILED"))
      } else {
        this._logger.warn(`Electron's MSIX autoUpdater: ${error.message}`)
      }
    })
  }

  quitAndInstall(options: QuitAndInstallOptions | boolean = {}, legacyIsForceRunAfter?: boolean): void {
    const { isSilent = false, isForceRunAfter = false, waitUntilNextLaunch = false } = this.normalizeQuitAndInstallOptions(options, legacyIsForceRunAfter)
    // as for every Windows updater (BaseUpdater): a silent install runs the app afterwards only with isForceRunAfter
    const isRunAfter = isSilent ? isForceRunAfter : this.autoRunAppAfterInstall
    if (this.isQuitAndInstallCalled) {
      this._logger.warn("quitAndInstall call ignored: an install is already in progress")
      return
    }
    const downloadedUpdateHelper = this.downloadedUpdateHelper
    const file = downloadedUpdateHelper?.file
    const downloadedFileInfo = downloadedUpdateHelper?.downloadedFileInfo
    if (file == null || downloadedFileInfo == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return
    }

    this.isQuitAndInstallCalled = true
    // the native quitAndInstall needs an update staged by this process (without one, it emits an error and quits the app): stage the bundle
    // now ("manual" mode, a failed staging), at once when it is staged already
    this.stage(file, downloadedFileInfo.sha512).then(
      () => {
        if (waitUntilNextLaunch || !isRunAfter) {
          // Windows registers the staged update at the next activation of the app (Start menu, taskbar, protocol, file association), not on
          // app.relaunch()
          this._logger.info("Quitting: Windows installs the staged update when the app is launched next")
          if (!waitUntilNextLaunch) {
            // emitted before quitting as by every other updater (BaseUpdater.quitAndInstall)
            this.nativeUpdater.emit("before-quit-for-update")
          }
          this.app.quit()
          // nothing native is pending, so an app that cancelled the quit (before-quit, a window close) can call quitAndInstall again; not before
          // app.quit() returns, which emits before-quit synchronously: a call from that handler is ignored instead of looping
          this.isQuitAndInstallCalled = false
          return
        }
        // Windows shuts the app down to register the update (session-end, "close-app") and restarts it only when it ran for at least 60 seconds.
        // Quitting on session-end lets it quit gracefully: Electron 42.9 and later would otherwise terminate it at once. Electron emits
        // before-quit-for-update itself
        if (!this.isSessionEndBridged) {
          this.isSessionEndBridged = true
          this.app.onSessionEnd?.(() => this.app.quit())
        }
        this.addNativeErrorListener()
        this.isNativeInstallInProgress = true
        const attempt = ++this.nativeInstallAttempt
        this._logger.info("Installing the staged update with Electron's MSIX autoUpdater")
        const result: unknown = this.nativeUpdater.quitAndInstall()
        // Electron does not report how the registration ends, and Windows shuts this process down before it registers the update: if the
        // promise settles while the app still runs (and no error was emitted), the update was not installed now, e.g. the registration
        // failed or was deferred, and Windows applies it when the app is launched next
        if (isPromiseLike(result)) {
          const onSettled = () => {
            if (attempt === this.nativeInstallAttempt && this.isNativeInstallInProgress) {
              this.isNativeInstallInProgress = false
              this.isQuitAndInstallCalled = false
              this.dispatchError(
                newError("Windows did not install the staged update while the app was running: it installs it when the app is launched next", "ERR_UPDATER_MSIX_INSTALL_FAILED")
              )
            }
          }
          void result.then(onSettled, onSettled)
        }
      },
      (e: unknown) => {
        this.isQuitAndInstallCalled = false
        this.dispatchError(toError(e))
      }
    )
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function"
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

// resolve/reject are assigned synchronously by the Promise executor
function createDeferred(): { readonly promise: Promise<void>; readonly resolve: () => void; readonly reject: (error: Error) => void } {
  let resolve: () => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}
