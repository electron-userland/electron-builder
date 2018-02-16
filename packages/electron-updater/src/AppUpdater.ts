import BluebirdPromise from "bluebird-lst"
import { AllPublishOptions, asArray, CancellationToken, newError, PublishConfiguration, UpdateInfo, WindowsUpdateInfo, UUID } from "builder-util-runtime"
import { randomBytes } from "crypto"
import { Notification } from "electron"
import isDev from "electron-is-dev"
import { EventEmitter } from "events"
import { outputFile, readFile, existsSync } from "fs-extra-p"
import { OutgoingHttpHeaders } from "http"
import { safeLoad } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { eq as isVersionsEqual, gt as isVersionGreaterThan, prerelease as getVersionPreleaseComponents, valid as parseVersion } from "semver"
import "source-map-support/register"
import { ElectronHttpExecutor } from "./electronHttpExecutor"
import { GenericProvider } from "./GenericProvider"
import { Logger, Provider, UpdateCheckResult, UpdaterSignal } from "./main"
import { createClient } from "./providerFactory"
import { DownloadedUpdateHelper } from "./DownloadedUpdateHelper"
import { hashFile } from "builder-util/out/hash"

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
   * @default false
   */
  allowDowngrade: boolean = false

  /**
   * The current application version.
   */
  readonly currentVersion: string

  private _channel: string | null = null

  protected readonly downloadedUpdateHelper = new DownloadedUpdateHelper()

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

  protected updateAvailable = false

  private clientPromise: Promise<Provider<any>> | null = null

  protected get provider(): Promise<Provider<any>> {
    return this.clientPromise!!
  }

  protected readonly stagingUserIdPromise = new Lazy<string>(() => this.getOrCreateStagingUserId())

  // public, allow to read old config for anyone
  configOnDisk = new Lazy<any>(() => this.loadUpdateConfig())

  private readonly untilAppReady: Promise<any>
  private checkForUpdatesPromise: Promise<UpdateCheckResult> | null = null

  protected readonly app: Electron.App

  protected updateInfo: UpdateInfo | null = null

  /** @internal */
  readonly httpExecutor: ElectronHttpExecutor

  protected constructor(options: AllPublishOptions | null | undefined, app?: any) {
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

    const currentVersionString = this.app.getVersion()
    const currentVersion = parseVersion(currentVersionString)
    if (currentVersion == null) {
      throw newError(`App version is not a valid semver version: "${currentVersionString}`, "ERR_UPDATER_INVALID_VERSION")
    }
    this.currentVersion = currentVersion

    this.allowPrerelease = hasPrereleaseComponents(this.currentVersion)

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
      provider = new GenericProvider({provider: "generic", url: options}, this)
    }
    else {
      provider = createClient(options, this)
    }
    this.clientPromise = Promise.resolve(provider)
  }

  /**
   * Configure download related data.
   * @param downloadFolder The path of the folder to download updates.
   * @param installerName The name of the persisting downloaded installer.
   */
  setDownloadData(downloadFolder: string, installerName?: string) {
    this._logger.info(`Setting custom download data: ${this.app.getPath("userData")}`)
    this.downloadedUpdateHelper.setDownloadData(downloadFolder, installerName)
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
      return BluebirdPromise.resolve(null)
    }

    this.signals.updateDownloaded(it => {
      new Notification({
        title: "A new update is ready to install",
        body: `${this.app.getName()} version ${it.version} is downloaded and will be automatically installed on exit`
      }).show()
    })
    return this.checkForUpdates()
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

  protected async getUpdateInfo(): Promise<UpdateInfo> {
    await this.untilAppReady

    if (this.clientPromise == null) {
      this.clientPromise = this.configOnDisk.value.then(it => createClient(it, this))
    }

    const client = await this.clientPromise
    const stagingUserId = await this.stagingUserIdPromise.value
    client.setRequestHeaders(this.computeFinalHeaders({"X-User-Staging-Id": stagingUserId}))
    return await client.getLatestVersion()
  }

  private async doCheckForUpdates(): Promise<UpdateCheckResult> {
    const updateInfo = await this.getUpdateInfo()

    const latestVersion = parseVersion(updateInfo.version)
    if (latestVersion == null) {
      throw newError(`Latest version (from update server) is not valid semver version: "${latestVersion}`, "ERR_UPDATER_INVALID_VERSION")
    }

    const isStagingMatch = await this.isStagingMatch(updateInfo)
    if (!isStagingMatch || ((this.allowDowngrade && !hasPrereleaseComponents(latestVersion)) ? isVersionsEqual(latestVersion, this.currentVersion) : !isVersionGreaterThan(latestVersion, this.currentVersion))) {
      this.updateAvailable = false
      this._logger.info(`Update for version ${this.currentVersion} is not available (latest version: ${updateInfo.version}, downgrade is ${this.allowDowngrade ? "allowed" : "disallowed"}.`)
      this.emit("update-not-available", updateInfo)
      return {
        versionInfo: updateInfo,
        updateInfo,
      }
    }

    this.updateAvailable = true
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

  protected async isUpdaterValid(updaterPath?: string | null): Promise<boolean> {
    if (updaterPath == null) {
      updaterPath = this.downloadedUpdateHelper.file

      if (updaterPath == null) {
        return false
      }
    }

    if (!existsSync(updaterPath)) {
      this._logger.warn("No update available")
      return false
    }

    let installerInfo = this.updateInfo
    if (installerInfo == null) {
      installerInfo = await this.getUpdateInfo()

      if (installerInfo == null) {
        this._logger.warn("Cannot verify the validity of the downloaded installer")
        return false
      }
    }

    const sha512 = await hashFile(updaterPath)
    // TODO: installerInfo.sha512 is deprecated.
    // Need to switch to installerInfo.files[i].sha512. But how many files can coexist and of which type?
    if (installerInfo.sha512 !== sha512) {
      this._logger.warn("sha512 checksum doesn't match the latest available update. new installer should be downloaded")
      return false
    }

    const sha256 = await hashFile(updaterPath, "sha256", "hex")
    // TODO: installerInfo.sha2 is deprecated. Should we even check this? sha512 is taking over
    //       This code could cause problems on a non windows environment.
    if ((installerInfo as WindowsUpdateInfo).sha2 && (installerInfo as WindowsUpdateInfo).sha2 !== sha256) {
      this._logger.warn("sha256 checksum doesn't match the latest available update. new installer should be downloaded")
      return false
    }

    return true
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
      return await this.doDownloadUpdate(updateInfo, cancellationToken)
    }
    catch (e) {
      this.dispatchError(e)
      throw e
    }
  }

  protected dispatchError(e: Error) {
    this.emit("error", e, (e.stack || e).toString())
  }

  protected async abstract doDownloadUpdate(updateInfo: UpdateInfo, cancellationToken: CancellationToken): Promise<Array<string>>

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

  /*** @private */
  protected async computeRequestHeaders(): Promise<OutgoingHttpHeaders> {
    const fileExtraDownloadHeaders = (await this.provider).fileExtraDownloadHeaders
    if (fileExtraDownloadHeaders != null) {
      const requestHeaders = this.requestHeaders
      return requestHeaders == null ? fileExtraDownloadHeaders : {
        ...fileExtraDownloadHeaders,
        ...requestHeaders,
      }
    }
    return this.computeFinalHeaders({Accept: "*/*"})
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
}

function hasPrereleaseComponents(version: string) {
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
