import { AllPublishOptions, asArray, CancellationToken, newError, PublishConfiguration, UpdateInfo, UUID, DownloadOptions, CancellationError } from "builder-util-runtime"
import { randomBytes } from "crypto"
import { Notification } from "electron"
import isDev from "electron-is-dev"
import { EventEmitter } from "events"
import { ensureDir, outputFile, readFile, rename, unlink } from "fs-extra-p"
import { OutgoingHttpHeaders } from "http"
import { safeLoad } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { eq as isVersionsEqual, gt as isVersionGreaterThan, parse as parseVersion, prerelease as getVersionPreleaseComponents, SemVer } from "semver"
import "source-map-support/register"
import { DownloadedUpdateHelper } from "./DownloadedUpdateHelper"
import { ElectronHttpExecutor } from "./electronHttpExecutor"
import { GenericProvider } from "./providers/GenericProvider"
import { DOWNLOAD_PROGRESS, Logger, Provider, ResolvedUpdateFileInfo, UPDATE_DOWNLOADED, UpdateCheckResult, UpdaterSignal } from "./main"
import { createClient, isUrlProbablySupportMultiRangeRequests } from "./providerFactory"

export abstract class AppUpdater extends EventEmitter {
  /**
   * Whether to automatically download an update when it is found.
   */
  autoDownload: boolean = true

  /**
   * Whether to automatically install a downloaded update on app quit (if `quitAndInstall` was not called before).
   *
   * Applicable only on Windows and Linux.
   */
  autoInstallOnAppQuit: boolean = true

  /**
   * *GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.
   *
   * If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`).
   */
  allowPrerelease: boolean = false

  /**
   * *GitHub provider only.* Get all release notes (from current version to latest), not just the latest.
   * @default false
   */
  fullChangelog: boolean = false

  /**
   * Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel).
   *
   * Taken in account only if channel differs (pre-release version component in terms of semantic versioning).
   *
   * @default false
   */
  allowDowngrade: boolean = false

  /**
   * The current application version.
   */
  readonly currentVersion: SemVer

  private _channel: string | null = null

  protected readonly downloadedUpdateHelper: DownloadedUpdateHelper

  /**
   * Get the update channel. Not applicable for GitHub. Doesn't return `channel` from the update configuration, only if was previously set.
   */
  get channel(): string | null {
    return this._channel
  }

  /**
   * Set the update channel. Not applicable for GitHub. Overrides `channel` in the update configuration.
   *
   * `allowDowngrade` will be automatically set to `true`. If this behavior is not suitable for you, simple set `allowDowngrade` explicitly after.
   */
  set channel(value: string | null) {
    if (this._channel != null) {
      // noinspection SuspiciousTypeOfGuard
      if (typeof value !== "string") {
        throw newError(`Channel must be a string, but got: ${value}`, "ERR_UPDATER_INVALID_CHANNEL")
      }
      else if (value.length === 0) {
        throw newError(`Channel must be not an empty string`, "ERR_UPDATER_INVALID_CHANNEL")
      }
    }

    this._channel = value
    this.allowDowngrade = true
  }

  /**
   *  The request headers.
   */
  requestHeaders: OutgoingHttpHeaders | null = null

  protected _logger: Logger = console

  /**
   * The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`.
   * Set it to `null` if you would like to disable a logging feature.
   */
  get logger(): Logger | null {
    return this._logger
  }

  set logger(value: Logger | null) {
    this._logger = value == null ? new NoOpLogger() : value
  }

  // noinspection JSUnusedGlobalSymbols
  /**
   * For type safety you can use signals, e.g. `autoUpdater.signals.updateDownloaded(() => {})` instead of `autoUpdater.on('update-available', () => {})`
   */
  readonly signals = new UpdaterSignal(this)

  private _appUpdateConfigPath: string | null = null

  // noinspection JSUnusedGlobalSymbols
  /**
   * test only
   * @private
   */
  set updateConfigPath(value: string | null) {
    this.clientPromise = null
    this._appUpdateConfigPath = value
    this.configOnDisk = new Lazy<any>(() => this.loadUpdateConfig())
  }

  private clientPromise: Promise<Provider<any>> | null = null

  protected get provider(): Promise<Provider<any>> {
    return this.clientPromise!!
  }

  protected readonly stagingUserIdPromise = new Lazy<string>(() => this.getOrCreateStagingUserId())

  // public, allow to read old config for anyone
  /** @internal */
  configOnDisk = new Lazy<any>(() => this.loadUpdateConfig())

  private readonly untilAppReady: Promise<any>
  private checkForUpdatesPromise: Promise<UpdateCheckResult> | null = null

  protected readonly app: Electron.App

  protected updateInfo: UpdateInfo | null = null

  /** @internal */
  readonly httpExecutor: ElectronHttpExecutor

  protected constructor(options: AllPublishOptions | null | undefined, app?: Electron.App) {
    super()

    this.on("error", (error: Error) => {
      this._logger.error(`Error: ${error.stack || error.message}`)
    })

    if (app != null || (global as any).__test_app != null) {
      this.app = app || (global as any).__test_app
      this.untilAppReady = Promise.resolve()
      this.httpExecutor = null as any
    }
    else {
      this.app = require("electron").app
      this.httpExecutor = new ElectronHttpExecutor((authInfo, callback) => this.emit("login", authInfo, callback))
      this.untilAppReady = new Promise(resolve => {
        if (this.app.isReady()) {
          resolve()
        }
        else {
          this.app.on("ready", resolve)
        }
      })
    }

    this.downloadedUpdateHelper = new DownloadedUpdateHelper(path.join(this.app.getPath("userData"), "__update__"))

    const currentVersionString = this.app.getVersion()
    const currentVersion = parseVersion(currentVersionString)
    if (currentVersion == null) {
      throw newError(`App version is not a valid semver version: "${currentVersionString}"`, "ERR_UPDATER_INVALID_VERSION")
    }
    this.currentVersion = currentVersion

    this.allowPrerelease = hasPrereleaseComponents(currentVersion)

    if (options != null) {
      this.setFeedURL(options)
    }
  }

  //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
  getFeedURL(): string | null | undefined {
    return "Deprecated. Do not use it."
  }

  /**
   * Configure update provider. If value is `string`, [GenericServerOptions](/configuration/publish.md#genericserveroptions) will be set with value as `url`.
   * @param options If you want to override configuration in the `app-update.yml`.
   */
  setFeedURL(options: PublishConfiguration | AllPublishOptions | string) {
    // https://github.com/electron-userland/electron-builder/issues/1105
    let provider: Provider<any>
    if (typeof options === "string") {
      provider = new GenericProvider({provider: "generic", url: options}, this, isUrlProbablySupportMultiRangeRequests(options))
    }
    else {
      provider = createClient(options, this)
    }
    this.clientPromise = Promise.resolve(provider)
  }

  /**
   * Asks the server whether there is an update.
   */
  checkForUpdates(): Promise<UpdateCheckResult> {
    let checkForUpdatesPromise = this.checkForUpdatesPromise
    if (checkForUpdatesPromise != null) {
      return checkForUpdatesPromise
    }

    checkForUpdatesPromise = this._checkForUpdates()
    this.checkForUpdatesPromise = checkForUpdatesPromise
    const nullizePromise = () => this.checkForUpdatesPromise = null
    checkForUpdatesPromise
      .then(nullizePromise)
      .catch(nullizePromise)
    return checkForUpdatesPromise
  }

  checkForUpdatesAndNotify(): Promise<UpdateCheckResult | null> {
    if (isDev) {
      return Promise.resolve(null)
    }

    const checkForUpdatesPromise = this.checkForUpdates()
    checkForUpdatesPromise
      .then(it => {
        const downloadPromise = it.downloadPromise
        if (downloadPromise == null) {
          const debug = this._logger.debug
          if (debug != null) {
            debug("checkForUpdatesAndNotify called, downloadPromise is null")
          }
          return
        }

        downloadPromise
          .then(() => {
            new Notification({
              title: "A new update is ready to install",
              body: `${this.app.getName()} version ${it.updateInfo.version} is downloaded and will be automatically installed on exit`
            }).show()
          })
      })

    return checkForUpdatesPromise
  }

  private async isStagingMatch(updateInfo: UpdateInfo): Promise<boolean> {
    const rawStagingPercentage = updateInfo.stagingPercentage
    let stagingPercentage = rawStagingPercentage
    if (stagingPercentage == null) {
      return true
    }

    stagingPercentage = parseInt(stagingPercentage as any, 10)
    if (isNaN(stagingPercentage)) {
      this._logger.warn(`Staging percentage is NaN: ${rawStagingPercentage}`)
      return true
    }

    // convert from user 0-100 to internal 0-1
    stagingPercentage = stagingPercentage / 100

    const stagingUserId = await this.stagingUserIdPromise.value
    const val = UUID.parse(stagingUserId).readUInt32BE(12)
    const percentage = (val / 0xFFFFFFFF)
    this._logger.info(`Staging percentage: ${stagingPercentage}, percentage: ${percentage}, user id: ${stagingUserId}`)
    return percentage < stagingPercentage
  }

  private async _checkForUpdates(): Promise<UpdateCheckResult> {
    try {
      await this.untilAppReady
      this._logger.info("Checking for update")
      this.emit("checking-for-update")
      return await this.doCheckForUpdates()
    }
    catch (e) {
      this.emit("error", e, `Cannot check for updates: ${(e.stack || e).toString()}`)
      throw e
    }
  }

  private computeFinalHeaders(headers: OutgoingHttpHeaders) {
    if (this.requestHeaders != null) {
      Object.assign(headers, this.requestHeaders)
    }
    return headers
  }

  private async isUpdateAvailable(updateInfo: UpdateInfo): Promise<boolean> {
    const latestVersion = parseVersion(updateInfo.version)
    if (latestVersion == null) {
      throw newError(`This file could not be downloaded, or the latest version (from update server) does not have a valid semver version: "${latestVersion}"`, "ERR_UPDATER_INVALID_VERSION")
    }

    const currentVersion = this.currentVersion
    if (isVersionsEqual(latestVersion, currentVersion)) {
      return false
    }

    const isStagingMatch = await this.isStagingMatch(updateInfo)
    if (!isStagingMatch) {
      return false
    }

    // https://github.com/electron-userland/electron-builder/pull/3111#issuecomment-405033227
    // https://github.com/electron-userland/electron-builder/pull/3111#issuecomment-405030797
    const isLatestVersionNewer = isVersionGreaterThan(latestVersion, currentVersion)
    if (!this.allowDowngrade) {
      return isLatestVersionNewer
    }

    const currentVersionPrereleaseComponent = getVersionPreleaseComponents(currentVersion)
    const latestVersionPrereleaseComponent = getVersionPreleaseComponents(latestVersion)
    if (currentVersionPrereleaseComponent === latestVersionPrereleaseComponent) {
      // allowDowngrade taken in account only if channel differs
      return isLatestVersionNewer
    }

    return true
  }

  protected async getUpdateInfo(): Promise<UpdateInfo> {
    await this.untilAppReady

    if (this.clientPromise == null) {
      this.clientPromise = this.configOnDisk.value.then(it => createClient(it, this))
    }

    const client = await this.clientPromise
    const stagingUserId = await this.stagingUserIdPromise.value
    client.setRequestHeaders(this.computeFinalHeaders({"x-user-staging-id": stagingUserId}))
    return await client.getLatestVersion()
  }

  private async doCheckForUpdates(): Promise<UpdateCheckResult> {
    const updateInfo = await this.getUpdateInfo()
    if (!await this.isUpdateAvailable(updateInfo)) {
      this._logger.info(`Update for version ${this.currentVersion} is not available (latest version: ${updateInfo.version}, downgrade is ${this.allowDowngrade ? "allowed" : "disallowed"}).`)
      this.emit("update-not-available", updateInfo)
      return {
        versionInfo: updateInfo,
        updateInfo,
      }
    }

    this.updateInfo = updateInfo

    this.onUpdateAvailable(updateInfo)

    const cancellationToken = new CancellationToken()
    //noinspection ES6MissingAwait
    return {
      versionInfo: updateInfo,
      updateInfo,
      cancellationToken,
      downloadPromise: this.autoDownload ? this.downloadUpdate(cancellationToken) : null
    }
  }

  protected onUpdateAvailable(updateInfo: UpdateInfo) {
    this._logger.info(`Found version ${updateInfo.version} (url: ${asArray(updateInfo.files).map(it => it.url).join(", ")})`)
    this.emit("update-available", updateInfo)
  }

  /**
   * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
   * @returns {Promise<string>} Path to downloaded file.
   */
  async downloadUpdate(cancellationToken: CancellationToken = new CancellationToken()): Promise<any> {
    const updateInfo = this.updateInfo
    if (updateInfo == null) {
      const error = new Error("Please check update first")
      this.dispatchError(error)
      throw error
    }

    this._logger.info(`Downloading update from ${asArray(updateInfo.files).map(it => it.url).join(", ")}`)

    try {
      return await this.doDownloadUpdate({
        updateInfo,
        requestHeaders: await this.computeRequestHeaders(),
        cancellationToken,
      })
    }
    catch (e) {
      this.dispatchError(e)
      throw e
    }
  }

  protected dispatchError(e: Error) {
    this.emit("error", e, (e.stack || e).toString())
  }

  protected async abstract doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>>

  /**
   * Restarts the app and installs the update after it has been downloaded.
   * It should only be called after `update-downloaded` has been emitted.
   *
   * **Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
   * This is different from the normal quit event sequence.
   *
   * @param isSilent *windows-only* Runs the installer in silent mode. Defaults to `false`.
   * @param isForceRunAfter Run the app after finish even on silent install. Not applicable for macOS. Ignored if `isSilent` is set to `false`.
   */
  abstract quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void

  private async loadUpdateConfig() {
    if (this._appUpdateConfigPath == null) {
      this._appUpdateConfigPath = isDev ? path.join(this.app.getAppPath(), "dev-app-update.yml") : path.join(process.resourcesPath!, "app-update.yml")
    }
    return safeLoad(await readFile(this._appUpdateConfigPath, "utf-8"))
  }

  private async computeRequestHeaders(): Promise<OutgoingHttpHeaders> {
    const fileExtraDownloadHeaders = (await this.provider).fileExtraDownloadHeaders
    if (fileExtraDownloadHeaders != null) {
      const requestHeaders = this.requestHeaders
      return requestHeaders == null ? fileExtraDownloadHeaders : {
        ...fileExtraDownloadHeaders,
        ...requestHeaders,
      }
    }
    return this.computeFinalHeaders({accept: "*/*"})
  }

  private async getOrCreateStagingUserId(): Promise<string> {
    const file = path.join(this.app.getPath("userData"), ".updaterId")
    try {
      const id = await readFile(file, "utf-8")
      if (UUID.check(id)) {
        return id
      }
      else {
        this._logger.warn(`Staging user id file exists, but content was invalid: ${id}`)
      }
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        this._logger.warn(`Couldn't read staging user ID, creating a blank one: ${e}`)
      }
    }

    const id = UUID.v5(randomBytes(4096), UUID.OID)
    this._logger.info(`Generated new staging user ID: ${id}`)
    try {
      await outputFile(file, id)
    }
    catch (e) {
      this._logger.warn(`Couldn't write out staging user ID: ${e}`)
    }
    return id
  }

  /** @internal */
  get isAddNoCacheQuery(): boolean {
    const headers = this.requestHeaders
    // https://github.com/electron-userland/electron-builder/issues/3021
    if (headers == null) {
      return true
    }

    for (const headerName of Object.keys(headers)) {
      const s = headerName.toLowerCase()
      if (s === "authorization" || s === "private-token") {
        return false
      }
    }
    return true
  }

  protected async executeDownload(taskOptions: DownloadExecutorTask): Promise<Array<string>> {
    const fileInfo = taskOptions.fileInfo
    const downloadOptions: DownloadOptions = {
      skipDirCreation: true,
      headers: taskOptions.downloadUpdateOptions.requestHeaders,
      cancellationToken: taskOptions.downloadUpdateOptions.cancellationToken,
      sha2: (fileInfo.info as any).sha2,
      sha512: fileInfo.info.sha512,
    }

    if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
      downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
    }

    const updateInfo = taskOptions.downloadUpdateOptions.updateInfo
    const version = updateInfo.version
    const packageInfo = fileInfo.packageInfo

    function getCacheUpdateFileName(): string {
      // bloody NodeJS URL doesn't decode automatically
      const urlPath = decodeURIComponent(taskOptions.fileInfo.url.pathname)
      if (urlPath.endsWith(`.${taskOptions.fileExtension}`)) {
        return path.posix.basename(urlPath)
      }
      else {
        // url like /latest, generate name
        return `update.${taskOptions.fileExtension}`
      }
    }

    const cacheDir = this.downloadedUpdateHelper.cacheDir
    await ensureDir(cacheDir)
    const updateFileName = getCacheUpdateFileName()
    let updateFile = path.join(cacheDir, updateFileName)
    const packageFile = packageInfo == null ? null : path.join(cacheDir, `package-${version}${path.extname(packageInfo.path) || ".7z"}`)

    const done = async (isSaveCache: boolean) => {
      this.downloadedUpdateHelper.setDownloadedFile(updateFile, packageFile, updateInfo, fileInfo)
      if (isSaveCache) {
        await this.downloadedUpdateHelper.cacheUpdateInfo(updateFileName)
      }

      await taskOptions.done!!(updateFile)

      this.emit(UPDATE_DOWNLOADED, updateInfo)
      return packageFile == null ? [updateFile] : [updateFile, packageFile]
    }

    const log = this._logger
    const cachedUpdateFile = await this.downloadedUpdateHelper.validateDownloadedPath(updateFile, updateInfo, fileInfo, log)
    if (cachedUpdateFile != null) {
      updateFile = cachedUpdateFile
      return await done(false)
    }

    const removeFileIfAny = async () => {
      await this.downloadedUpdateHelper.clear()
        .catch(() => {
          // ignore
        })
      return await unlink(updateFile)
        .catch(() => {
          // ignore
        })
    }

    // https://github.com/electron-userland/electron-builder/pull/2474#issuecomment-366481912
    let nameCounter = 0
    let tempUpdateFile = path.join(cacheDir, `temp-${updateFileName}`)
    for (let i = 0; i < 3; i++) {
      try {
        await unlink(tempUpdateFile)
      }
      catch (e) {
        if (e.code === "ENOENT") {
          break
        }

        log.warn(`Error on remove temp update file: ${e}`)
        tempUpdateFile = path.join(cacheDir, `temp-${nameCounter++}-${updateFileName}`)
      }
    }

    try {
      await taskOptions.task(tempUpdateFile, downloadOptions, packageFile, removeFileIfAny)
      await rename(tempUpdateFile, updateFile)
    }
    catch (e) {
      await removeFileIfAny()

      if (e instanceof CancellationError) {
        log.info("Cancelled")
        this.emit("update-cancelled", updateInfo)
      }
      throw e
    }

    log.info(`New version ${version} has been downloaded to ${updateFile}`)
    return await done(true)
  }
}

export interface DownloadUpdateOptions {
  readonly updateInfo: UpdateInfo
  readonly requestHeaders: OutgoingHttpHeaders
  readonly cancellationToken: CancellationToken
}

function hasPrereleaseComponents(version: SemVer) {
  const versionPrereleaseComponent = getVersionPreleaseComponents(version)
  return versionPrereleaseComponent != null && versionPrereleaseComponent.length > 0
}

/** @private */
export class NoOpLogger implements Logger {
  info(message?: any) {
    // ignore
  }

  warn(message?: any) {
    // ignore
  }

  error(message?: any) {
    // ignore
  }
}

export interface DownloadExecutorTask {
  readonly fileExtension: string
  readonly fileInfo: ResolvedUpdateFileInfo
  readonly downloadUpdateOptions: DownloadUpdateOptions
  readonly task: (destinationFile: string, downloadOptions: DownloadOptions, packageFile: string | null, removeTempDirIfAny: () => Promise<any>) => Promise<any>

  readonly done?: (destinationFile: string) => Promise<any>
}