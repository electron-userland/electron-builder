import { EventEmitter } from "events"
import { spawn } from "child_process"
import * as path from "path"
import { tmpdir } from "os"
import { BintrayClient, BintrayOptions } from "../../src/publish/bintray"
import { HttpError } from "../../src/publish/restApiRequest"
import semver = require("semver")
import { download } from "../../src/util/httpRequest"
import { Provider, VersionInfo, UpdateCheckResult, FileInfo } from "./api"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../../src/util/awaiter")

class BintrayProvider implements Provider {
  private client: BintrayClient

  constructor(configuration: BintrayOptions) {
    this.client = new BintrayClient(configuration.user, configuration.package, configuration.repo)
  }

  async getLatestVersion(): Promise<VersionInfo> {
    try {
      const data = await this.client.getVersion("_latest")
      return {
        version: data.name,
      }
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`No latest version, please ensure that user, package and repository correctly configured. Or at least one version is published. ${e.stack || e.message}`)
      }
      throw e
    }
  }

  async getUpdateFile(versionInfo: VersionInfo): Promise<FileInfo> {
    try {
      const files = await this.client.getVersionFiles(versionInfo.version)
      const suffix = `${versionInfo.version}.exe`
      for (let file of files) {
        if (file.name.endsWith(suffix) && file.name.includes("Setup")) {
          return {
            url: ""
          }
        }
      }

      //noinspection ExceptionCaughtLocallyJS
      throw new Error(`Cannot find suitable file for version ${versionInfo.version} in: ${JSON.stringify(files, null, 2)}`)
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`No latest version, please ensure that user, package and repository correctly configured. Or at least one version is published. ${e.stack || e.message}`)
      }
      throw e
    }
  }
}

export class NsisUpdater extends EventEmitter {
  private setupPath = path.join(tmpdir(), 'innobox-upgrade.exe')

  private updateAvailable = false
  private quitAndInstallCalled = false

  private client: Provider

  private readonly app: any

  constructor(public updateUrl?: string) {
    super()

    this.app = (<any>global).__test_app || require("electron").app
  }

  getFeedURL(): string | null | undefined {
    return this.updateUrl
  }

  setFeedURL(value: string | BintrayOptions) {
    this.updateUrl = value.toString()

    this.client = new BintrayProvider(<BintrayOptions>value)
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (this.updateUrl == null) {
      const message = "Update URL is not set"
      this.emitError(message)
      throw new Error(message)
    }

    this.emit("checking-for-update")
    const versionInfo = await this.client.getLatestVersion()

    const latestVersion = semver.valid(versionInfo.version)
    if (latestVersion == null) {
      const error = `Latest version (from update server) is not valid semver version: "${latestVersion}`
      this.emitError(error)
      throw new Error(error)
    }

    const currentVersion = semver.valid(this.app.getVersion())
    if (currentVersion == null) {
      const error = `App version is not valid semver version: "${currentVersion}`
      this.emitError(error)
      throw new Error(error)
    }

    if (semver.gte(currentVersion, latestVersion)) {
      this.updateAvailable = false
      this.emit("update-not-available")
      return {
        versionInfo: versionInfo,
      }
    }

    this.updateAvailable = true
    this.emit("update-available")

    return {
      versionInfo: versionInfo,
      downloadPromise: this.client.getUpdateFile(versionInfo)
        .then(it => {}),
    }
  }

  quitAndInstall(): void {
    if (!this.updateAvailable) {
      this.emitError("No update available, can't quit and install")
      return
    }

    if (this.quitAndInstallCalled) {
      return
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

    spawn(this.setupPath, ["/S"], {
      detached: true,
      stdio: "ignore",
    }).unref()

    this.app.quit()
  }

  // emit both error object and message, this is to keep compatibility with old APIs
  private emitError (message: string) {
    return this.emit("error", new Error(message), message)
  }
}