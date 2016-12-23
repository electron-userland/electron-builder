import { EventEmitter } from "events"
import { spawn } from "child_process"
import * as path from "path"
import { tmpdir } from "os"
import { gt as isVersionGreaterThan, valid as parseVersion } from "semver"
import { download } from "../../src/util/httpRequest"
import { Provider, UpdateCheckResult, FileInfo } from "./api"
import { BintrayProvider } from "./BintrayProvider"
import BluebirdPromise from "bluebird-lst-c"
import { BintrayOptions, PublishConfiguration, GithubOptions, GenericServerOptions, VersionInfo } from "../../src/options/publishOptions"
import { readFile, mkdtemp } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import { GenericProvider } from "./GenericProvider"
import { GitHubProvider } from "./GitHubProvider"
import { executorHolder } from "../../src/util/httpExecutor"
import { ElectronHttpExecutor } from "./electronHttpExecutor"

export class NsisUpdater extends EventEmitter {
  /**
   * Automatically download an update when it is found.
   */
  public autoDownload = true

  private setupPath: string | null

  private updateAvailable = false
  private quitAndInstallCalled = false

  private clientPromise: Promise<Provider<any>>

  private readonly untilAppReady: Promise<boolean>

  private readonly app: any

  private quitHandlerAdded = false

  private versionInfo: VersionInfo | null
  private fileInfo: FileInfo | null

  constructor(options?: PublishConfiguration | BintrayOptions | GithubOptions) {
    super()

    if ((<any>global).__test_app) {
      this.app = (<any>global).__test_app
      this.untilAppReady = BluebirdPromise.resolve()
    }
    else {
      this.app = require("electron").app
      executorHolder.httpExecutor = new ElectronHttpExecutor()
      this.untilAppReady = new BluebirdPromise(resolve => {
        if (this.app.isReady()) {
          resolve()
        }
        else {
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

  setFeedURL(value: PublishConfiguration | BintrayOptions | GithubOptions | GenericServerOptions) {
    this.clientPromise = BluebirdPromise.resolve(createClient(value))
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    await this.untilAppReady
    this.emit("checking-for-update")
    try {
      if (this.clientPromise == null) {
        this.clientPromise = NsisUpdater.loadUpdateConfig()
      }
      return await this.doCheckForUpdates()
    }
    catch (e) {
      this.emit("error", e, (e.stack || e).toString())
      throw e
    }
  }

  private async doCheckForUpdates(): Promise<UpdateCheckResult> {
    const client = await this.clientPromise
    const versionInfo = await client.getLatestVersion()

    const latestVersion = parseVersion(versionInfo.version)
    if (latestVersion == null) {
      throw new Error(`Latest version (from update server) is not valid semver version: "${latestVersion}`)
    }

    const currentVersion = parseVersion(this.app.getVersion())
    if (currentVersion == null) {
      throw new Error(`App version is not valid semver version: "${currentVersion}`)
    }

    if (!isVersionGreaterThan(latestVersion, currentVersion)) {
      this.updateAvailable = false
      this.emit("update-not-available")
      return {
        versionInfo: versionInfo,
      }
    }

    const fileInfo = await client.getUpdateFile(versionInfo)

    this.updateAvailable = true
    this.versionInfo = versionInfo
    this.fileInfo = fileInfo

    this.emit("update-available")

    //noinspection ES6MissingAwait
    return {
      versionInfo: versionInfo,
      fileInfo: fileInfo,
      downloadPromise: this.autoDownload ? this.downloadUpdate() : null,
    }
  }

  /**
   * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
   * @returns {Promise<string>} Path to downloaded file.
   */
  async downloadUpdate() {
    const versionInfo = this.versionInfo
    const fileInfo = this.fileInfo

    if (versionInfo == null || fileInfo == null) {
      const message = "Please check update first"
      const error = new Error(message)
      this.emit("error", error, message)
      throw error
    }

    return mkdtemp(`${path.join(tmpdir(), "up")}-`)
      .then(it => download(fileInfo.url, path.join(it, fileInfo.name), fileInfo.sha2 == null ? null : {sha2: fileInfo.sha2}))
      .then(it => {
        this.setupPath = it
        this.addQuitHandler()
        this.emit("update-downloaded", {}, null, versionInfo.version, null, null, () => {
          this.quitAndInstall()
        })
        return it
      })
      .catch(e => {
        this.emit("error", e, (e.stack || e).toString())
        throw e
      })
  }

  private addQuitHandler() {
    if (this.quitHandlerAdded) {
      return
    }

    this.quitHandlerAdded = true

    this.app.on("quit", () => {
      this.install(true)
    })
  }

  quitAndInstall(): void {
    if (this.install(false)) {
      this.app.quit()
    }
  }

  private install(isSilent: boolean): boolean {
    if (this.quitAndInstallCalled) {
      return false
    }

    const setupPath = this.setupPath
    if (!this.updateAvailable || setupPath == null) {
      const message = "No update available, can't quit and install"
      this.emit("error", new Error(message), message)
      return false
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

    const args = ["--updated"]
    if (isSilent) {
      args.push("/S")
    }
    spawn(setupPath, args, {
      detached: true,
      stdio: "ignore",
    }).unref()

    return true
  }

  private static async loadUpdateConfig() {
    return createClient(safeLoad(await readFile(path.join((<any>global).__test_resourcesPath || (<any>process).resourcesPath, "app-update.yml"), "utf-8")))
  }
}

function createClient(data: string | PublishConfiguration | BintrayOptions | GithubOptions) {
  if (typeof data === "string") {
    throw new Error("Please pass PublishConfiguration object")
  }

  const provider = (<PublishConfiguration>data).provider
  switch (provider) {
    case "github":
      return new GitHubProvider(<GithubOptions>data)
    case "generic":
      return new GenericProvider(<GenericServerOptions>data)
    case "bintray":
      return new BintrayProvider(<BintrayOptions>data)
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}