import { EventEmitter } from "events"
import { spawn } from "child_process"
import * as path from "path"
import { tmpdir } from "os"
import semver = require("semver")
import { download } from "../../src/util/httpRequest"
import { Provider, UpdateCheckResult } from "./api"
import { BintrayProvider } from "./BintrayProvider"
import { Promise as BluebirdPromise } from "bluebird"
import { BintrayOptions, PublishConfiguration, GithubOptions } from "../../src/options/publishOptions"
import { readJson } from "fs-extra-p"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../../src/util/awaiter")

export class NsisUpdater extends EventEmitter {
  private setupPath: string | null

  private updateAvailable = false
  private quitAndInstallCalled = false

  private clientPromise: Promise<Provider>

  private readonly app: any

  constructor(options?: PublishConfiguration | BintrayOptions | GithubOptions) {
    super()

    this.app = (<any>global).__test_app || require("electron").app

    if (options == null) {
      this.clientPromise = loadUpdateConfig()
    }
    else {
      this.setFeedURL(options)
    }
  }

  getFeedURL(): string | null | undefined {
    return JSON.stringify(this.clientPromise, null, 2)
  }

  setFeedURL(value: string | PublishConfiguration | BintrayOptions | GithubOptions) {
    this.clientPromise = BluebirdPromise.resolve(createClient(value))
  }

  checkForUpdates(): Promise<UpdateCheckResult> {
    if (this.clientPromise == null) {
      const message = "Update URL is not set"
      this.emitError(message)
      return BluebirdPromise.reject(new Error(message))
    }

    this.emit("checking-for-update")
    return this.doCheckForUpdates()
      .catch(error => this.emitError(error))
  }

  private async doCheckForUpdates(): Promise<UpdateCheckResult> {
    const client = await this.clientPromise
    const versionInfo = await client.getLatestVersion()

    const latestVersion = semver.valid(versionInfo.version)
    if (latestVersion == null) {
      throw new Error(`Latest version (from update server) is not valid semver version: "${latestVersion}`)
    }

    const currentVersion = semver.valid(this.app.getVersion())
    if (currentVersion == null) {
      throw new Error(`App version is not valid semver version: "${currentVersion}`)
    }

    if (semver.gte(currentVersion, latestVersion)) {
      this.updateAvailable = false
      this.emit("update-not-available")
      return {
        versionInfo: versionInfo,
      }
    }

    const fileInfo = await client.getUpdateFile(versionInfo)

    this.updateAvailable = true
    this.emit("update-available")

    const mkdtemp: any = BluebirdPromise.promisify(require("fs").mkdtemp)
    return {
      versionInfo: versionInfo,
      fileInfo: fileInfo,
      downloadPromise: mkdtemp(`${path.join(tmpdir(), "up")}-`)
        .then((it: string) => {
          this.setupPath = path.join(it, fileInfo.name)
          return download(fileInfo.url, this.setupPath)
        }),
    }
  }

  quitAndInstall(): void {
    const setupPath = this.setupPath
    if (!this.updateAvailable || setupPath == null) {
      this.emitError("No update available, can't quit and install")
      return
    }

    if (this.quitAndInstallCalled) {
      return
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

    spawn(setupPath!!, ["/S"], {
      detached: true,
      stdio: "ignore",
    }).unref()

    this.app.quit()
  }

  // emit both error object and message, this is to keep compatibility with old APIs
  private emitError(message: string) {
    return this.emit("error", new Error(message), message)
  }
}

function createClient(data: string | PublishConfiguration | BintrayOptions | GithubOptions) {
  if (typeof data === "string") {
    throw new Error("Please pass PublishConfiguration object")
  }
  else {
    const provider = (<PublishConfiguration>data).provider
    if (provider === "bintray") {
      return new BintrayProvider(<BintrayOptions>data)
    }
    else {
      throw new Error(`Unsupported provider: ${provider}`)
    }
  }
}

async function loadUpdateConfig() {
  const data = await readJson(path.join((<any>global).__test_resourcesPath || (<any>process).resourcesPath, ".app-update.json"), "utf-8")
  return createClient(data)
}