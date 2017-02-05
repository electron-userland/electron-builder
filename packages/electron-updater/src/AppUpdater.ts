import { EventEmitter } from "events"
import * as path from "path"
import { gt as isVersionGreaterThan, valid as parseVersion } from "semver"
import { RequestHeaders, executorHolder } from "electron-builder-http"
import { Provider, UpdateCheckResult, FileInfo, UpdaterSignal } from "./api"
import { BintrayProvider } from "./BintrayProvider"
import BluebirdPromise from "bluebird-lst-c"
import { BintrayOptions, PublishConfiguration, GithubOptions, S3Options, GenericServerOptions, VersionInfo } from "electron-builder-http/out/publishOptions"
import { readFile } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import { GenericProvider } from "./GenericProvider"
import { GitHubProvider } from "./GitHubProvider"
import { ElectronHttpExecutor } from "./electronHttpExecutor"
import "source-map-support/register"

export interface Logger {
  info(message?: any): void

  warn(message?: any): void

  error(message?: any): void
}

export abstract class AppUpdater extends EventEmitter {
  /**
   * Automatically download an update when it is found.
   */
  public autoDownload = true

  public requestHeaders: RequestHeaders | null

  /**
   * The logger. You can pass [electron-log](https://github.com/megahertz/electron-log), [winston](https://github.com/winstonjs/winston) or another logger with the following interface: `{ info(), warn(), error() }`.
   * Set it to `null` if you would like to disable a logging feature.
   */
  public logger: Logger | null = (<any>global).__test_app ? null : console

  public readonly signals = new UpdaterSignal(this)

  private _appUpdateConfigPath: string | null

  set updateConfigPath(value: string | null) {
    this.clientPromise = null
    this._appUpdateConfigPath =  value
  }

  protected updateAvailable = false

  private clientPromise: Promise<Provider<any>> | null

  private readonly untilAppReady: Promise<boolean>
  private checkForUpdatesPromise: Promise<UpdateCheckResult> | null

  protected readonly app: any

  protected versionInfo: VersionInfo | null
  private fileInfo: FileInfo | null

  constructor(options: PublishConfiguration | null | undefined) {
    super()

    this.on("error", (error: Error) => {
      if (this.logger != null) {
        this.logger.error(`Error: ${error.stack || error.message}`)
      }
    })

    if ((<any>global).__test_app != null) {
      this.app = (<any>global).__test_app
      this.untilAppReady = BluebirdPromise.resolve()
    }
    else {
      this.app = require("electron").app
      executorHolder.httpExecutor = new ElectronHttpExecutor()
      this.untilAppReady = new BluebirdPromise(resolve => {
        if (this.app.isReady()) {
          if (this.logger != null) {
            this.logger.info("App is ready")
          }
          resolve()
        }
        else {
          if (this.logger != null) {
            this.logger.info("Wait for app ready")
          }
          this.app.on("ready", resolve)
        }
      })
    }

    if (options != null) {
      this.setFeedURL(options)
    }
  }

  //noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
  getFeedURL(): string | null | undefined {
    return "Deprecated. Do not use it."
  }

  setFeedURL(value: PublishConfiguration | string) {
    // https://github.com/electron-userland/electron-builder/issues/1105
    let client: Provider<any>
    if (typeof value === "string") {
      client = new GenericProvider({provider: "generic", url: value})
    }
    else {
      client = createClient(value)
    }
    this.clientPromise = BluebirdPromise.resolve(client)
  }

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

  private async _checkForUpdates(): Promise<UpdateCheckResult> {
    await this.untilAppReady

    if (this.logger != null) {
      this.logger.info("Checking for update")
    }

    this.emit("checking-for-update")
    try {
      return await this.doCheckForUpdates()
    }
    catch (e) {
      this.emit("error", e, `Cannot check for updates: ${(e.stack || e).toString()}`)
      throw e
    }
  }

  private async doCheckForUpdates(): Promise<UpdateCheckResult> {
    if (this.clientPromise == null) {
      this.clientPromise = this.loadUpdateConfig().then(it => createClient(it))
    }

    const client = await this.clientPromise
    client.setRequestHeaders(this.requestHeaders)
    const versionInfo = await client.getLatestVersion()

    const latestVersion = parseVersion(versionInfo.version)
    if (latestVersion == null) {
      throw new Error(`Latest version (from update server) is not valid semver version: "${latestVersion}`)
    }

    const currentVersionString = this.app.getVersion()
    const currentVersion = parseVersion(currentVersionString)
    if (currentVersion == null) {
      throw new Error(`App version is not valid semver version: "${currentVersion}`)
    }

    if (!isVersionGreaterThan(latestVersion, currentVersion)) {
      this.updateAvailable = false
      if (this.logger != null) {
        this.logger.info(`Update for version ${currentVersionString} is not available (latest version: ${versionInfo.version})`)
      }
      this.emit("update-not-available", versionInfo)
      return {
        versionInfo: versionInfo,
      }
    }

    const fileInfo = await client.getUpdateFile(versionInfo)

    this.updateAvailable = true
    this.versionInfo = versionInfo
    this.fileInfo = fileInfo

    this.onUpdateAvailable(versionInfo, fileInfo)

    //noinspection ES6MissingAwait
    return {
      versionInfo: versionInfo,
      fileInfo: fileInfo,
      downloadPromise: this.autoDownload ? this.downloadUpdate() : null,
    }
  }

  protected onUpdateAvailable(versionInfo: VersionInfo, fileInfo: FileInfo) {
    if (this.logger != null) {
      this.logger.info(`Found version ${versionInfo.version} (url: ${fileInfo.url})`)
    }
    this.emit("update-available", versionInfo)
  }

  /**
   * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
   * @returns {Promise<string>} Path to downloaded file.
   */
  async downloadUpdate(): Promise<any> {
    const versionInfo = this.versionInfo
    const fileInfo = this.fileInfo
    if (versionInfo == null || fileInfo == null) {
      const message = "Please check update first"
      const error = new Error(message)
      this.emit("error", error, message)
      throw error
    }

    if (this.logger != null) {
      this.logger.info(`Downloading update from ${fileInfo.url}`)
    }

    try {
      return await this.doDownloadUpdate(versionInfo, fileInfo)
    }
    catch (e) {
      this.dispatchError(e)
      throw e
    }
  }

  protected dispatchError(e: Error) {
    this.emit("error", e, (e.stack || e).toString())
  }

  protected async abstract doDownloadUpdate(versionInfo: VersionInfo, fileInfo: FileInfo): Promise<any>

  abstract quitAndInstall(): void

  async loadUpdateConfig() {
    if (this._appUpdateConfigPath == null) {
      this._appUpdateConfigPath = path.join(process.resourcesPath, "app-update.yml")
    }
    return safeLoad(await readFile(this._appUpdateConfigPath, "utf-8"))
  }
}

function createClient(data: string | PublishConfiguration | BintrayOptions | GithubOptions | S3Options) {
  if (typeof data === "string") {
    throw new Error("Please pass PublishConfiguration object")
  }

  const provider = (<PublishConfiguration>data).provider
  switch (provider) {
    case "github":
      return new GitHubProvider(<GithubOptions>data)
    case "s3":
      return new GenericProvider(<GenericServerOptions>{
        url: `https://s3.amazonaws.com/${(<S3Options>data).bucket || ""}`,
        channel: (<S3Options>data).channel || ""
      })
    case "generic":
      return new GenericProvider(<GenericServerOptions>data)
    case "bintray":
      return new BintrayProvider(<BintrayOptions>data)
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}