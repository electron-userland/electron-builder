import BluebirdPromise from "bluebird-lst"
import { AllPublishOptions, BaseS3Options, BintrayOptions, CancellationToken, GenericServerOptions, getS3LikeProviderBaseUrl, GithubOptions, PublishConfiguration, UpdateInfo, UUID, asArray } from "builder-util-runtime"
import { randomBytes } from "crypto"
import { Notification } from "electron"
import isDev from "electron-is-dev"
import { EventEmitter } from "events"
import { outputFile, readFile } from "fs-extra-p"
import { OutgoingHttpHeaders } from "http"
import { safeLoad } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { eq as isVersionsEqual, gt as isVersionGreaterThan, prerelease as getVersionPreleaseComponents, valid as parseVersion } from "semver"
import "source-map-support/register"
import { BintrayProvider } from "./BintrayProvider"
import { ElectronHttpExecutor } from "./electronHttpExecutor"
import { GenericProvider } from "./GenericProvider"
import { GitHubProvider } from "./GitHubProvider"
import { FileInfo, Logger, Provider, UpdateCheckResult, UpdaterSignal } from "./main"
import { PrivateGitHubProvider } from "./PrivateGitHubProvider"

export abstract class AppUpdater extends EventEmitter {
  /**
   * Whether to automatically download an update when it is found.
   */
  autoDownload = true

  /**
   * *GitHub provider only.* Whether to allow update to pre-release versions. Defaults to `true` if application version contains prerelease components (e.g. `0.12.1-alpha.1`, here `alpha` is a prerelease component), otherwise `false`.
   *
   * If `true`, downgrade will be allowed (`allowDowngrade` will be set to `true`).
   */
  allowPrerelease = false

  /**
   * *GitHub provider only.* Get all release notes (from current version to latest), not just the latest.
   * @default false
   */
  fullChangelog = false

  /**
   * Whether to allow version downgrade (when a user from the beta channel wants to go back to the stable channel).
   * @default false
   */
  allowDowngrade = false

  /**
   * The current application version.
   */
  readonly currentVersion: string

  /**
   *  The request headers.
   */
  requestHeaders: OutgoingHttpHeaders | null

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

  private _appUpdateConfigPath: string | null

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

  private clientPromise: Promise<Provider<any>> | null

  protected readonly stagingUserIdPromise = new Lazy<string>(() => this.getOrCreateStagingUserId())

  // public, allow to read old config for anyone
  configOnDisk = new Lazy<any>(() => this.loadUpdateConfig())

  private readonly untilAppReady: Promise<any>
  private checkForUpdatesPromise: Promise<UpdateCheckResult> | null

  protected readonly app: Electron.App

  protected versionInfo: UpdateInfo | null
  private fileInfo: FileInfo | null

  protected readonly httpExecutor: ElectronHttpExecutor

  constructor(options: AllPublishOptions | null | undefined, app?: any) {
    super()

    this.on("error", (error: Error) => {
      this._logger.error(`Error: ${error.stack || error.message}`)
    })

    if (app != null || (global as any).__test_app != null) {
      this.app = app || (global as any).__test_app
      this.untilAppReady = BluebirdPromise.resolve()
    }
    else {
      this.app = require("electron").app
      this.httpExecutor = new ElectronHttpExecutor((authInfo, callback) => this.emit("login", authInfo, callback))
      this.untilAppReady = new BluebirdPromise(resolve => {
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
      throw new Error(`App version is not a valid semver version: "${currentVersionString}`)
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
  setFeedURL(options: PublishConfiguration | AllPublishOptions) {
    // https://github.com/electron-userland/electron-builder/issues/1105
    let client: Provider<any>
    if (typeof options === "string") {
      client = new GenericProvider({provider: "generic", url: options}, this.httpExecutor)
    }
    else {
      client = this.createClient(options)
    }
    this.clientPromise = BluebirdPromise.resolve(client)
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
        body: `Version ${it.version} is downloaded and will be automatically installed on Quit`
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

  private async doCheckForUpdates(): Promise<UpdateCheckResult> {
    if (this.clientPromise == null) {
      this.clientPromise = this.configOnDisk.value.then(it => this.createClient(it))
    }

    const client = await this.clientPromise
    const stagingUserId = await this.stagingUserIdPromise.value
    client.setRequestHeaders(this.computeFinalHeaders({"X-User-Staging-Id": stagingUserId}))
    const updateInfo = await client.getLatestVersion()

    const latestVersion = parseVersion(updateInfo.version)
    if (latestVersion == null) {
      throw new Error(`Latest version (from update server) is not valid semver version: "${latestVersion}`)
    }

    const isStagingMatch = await this.isStagingMatch(updateInfo)
    if (!isStagingMatch || (this.allowDowngrade && !hasPrereleaseComponents(latestVersion) ? isVersionsEqual(latestVersion, this.currentVersion) : !isVersionGreaterThan(latestVersion, this.currentVersion))) {
      this.updateAvailable = false
      this._logger.info(`Update for version ${this.currentVersion} is not available (latest version: ${updateInfo.version}, downgrade is ${this.allowDowngrade ? "allowed" : "disallowed"}.`)
      this.emit("update-not-available", updateInfo)
      return {
        versionInfo: updateInfo,
        updateInfo,
      }
    }

    const fileInfo = await client.getUpdateFile(updateInfo)

    this.updateAvailable = true
    this.versionInfo = updateInfo
    this.fileInfo = fileInfo

    this.onUpdateAvailable(updateInfo, fileInfo)

    const cancellationToken = new CancellationToken()
    //noinspection ES6MissingAwait
    return {
      versionInfo: updateInfo,
      updateInfo,
      fileInfo,
      cancellationToken,
      downloadPromise: this.autoDownload ? this.downloadUpdate(cancellationToken) : null,
    }
  }

  protected onUpdateAvailable(updateInfo: UpdateInfo, fileInfo: FileInfo) {
    this._logger.info(`Found version ${updateInfo.version} (url: ${asArray(updateInfo.url).join(", ")})`)
    this.emit("update-available", updateInfo)
  }

  /**
   * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
   * @returns {Promise<string>} Path to downloaded file.
   */
  async downloadUpdate(cancellationToken: CancellationToken = new CancellationToken()): Promise<any> {
    const updateInfo = this.versionInfo
    const fileInfo = this.fileInfo
    if (updateInfo == null || fileInfo == null) {
      const error = new Error("Please check update first")
      this.dispatchError(error)
      throw error
    }

    this._logger.info(`Downloading update from ${fileInfo.url}`)

    try {
      return await this.doDownloadUpdate(updateInfo, fileInfo, cancellationToken)
    }
    catch (e) {
      this.dispatchError(e)
      throw e
    }
  }

  protected dispatchError(e: Error) {
    this.emit("error", e, (e.stack || e).toString())
  }

  protected async abstract doDownloadUpdate(versionInfo: UpdateInfo, fileInfo: FileInfo, cancellationToken: CancellationToken): Promise<Array<string>>

  /**
   * Restarts the app and installs the update after it has been downloaded.
   * It should only be called after `update-downloaded` has been emitted.
   *
   * **Note:** `autoUpdater.quitAndInstall()` will close all application windows first and only emit `before-quit` event on `app` after that.
   * This is different from the normal quit event sequence.
   *
   * @param isSilent *windows-only* Runs the installer in silent mode.
   * @param isForceRunAfter *windows-only* Run the app after finish even on silent install.
   */
  abstract quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void

  private async loadUpdateConfig() {
    if (this._appUpdateConfigPath == null) {
      this._appUpdateConfigPath = isDev ? path.join(this.app.getAppPath(), "dev-app-update.yml") : path.join(process.resourcesPath!, "app-update.yml")
    }
    return safeLoad(await readFile(this._appUpdateConfigPath, "utf-8"))
  }

  /*** @private */
  protected computeRequestHeaders(fileInfo: FileInfo): OutgoingHttpHeaders {
    if (fileInfo.headers != null) {
      const requestHeaders = this.requestHeaders
      return requestHeaders == null ? fileInfo.headers : {...fileInfo.headers, ...requestHeaders}
    }
    return this.computeFinalHeaders({Accept: "*/*"})
  }

  private createClient(data: string | PublishConfiguration) {
    if (typeof data === "string") {
      throw new Error("Please pass PublishConfiguration object")
    }

    const provider = (data as PublishConfiguration).provider
    switch (provider) {
      case "github":
        const githubOptions = data as GithubOptions
        const token = (githubOptions.private ? process.env.GH_TOKEN : null) || githubOptions.token
        if (token == null) {
          return new GitHubProvider(githubOptions, this, this.httpExecutor)
        }
        else {
          return new PrivateGitHubProvider(githubOptions, token, this.httpExecutor)
        }

      case "s3":
      case "spaces":
        return new GenericProvider({
          provider: "generic",
          url: getS3LikeProviderBaseUrl(data),
          channel: (data as BaseS3Options).channel || ""
        }, this.httpExecutor)

      case "generic":
        return new GenericProvider(data as GenericServerOptions, this.httpExecutor)

      case "bintray":
        return new BintrayProvider(data as BintrayOptions, this.httpExecutor)

      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
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