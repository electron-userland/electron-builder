import { EventEmitter } from "events"
import { spawn } from "child_process"
import * as path from "path"
import { tmpdir } from "os"
import { gt as isVersionGreaterThan, valid as parseVersion } from "semver"
import { download } from "../../src/util/httpRequest"
import { Provider, UpdateCheckResult } from "./api"
import { BintrayProvider } from "./BintrayProvider"
import BluebirdPromise from "bluebird-lst-c"
import { BintrayOptions, PublishConfiguration, GithubOptions, GenericServerOptions } from "../../src/options/publishOptions"
import { readFile } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import { GenericProvider } from "./GenericProvider"
import { GitHubProvider } from "./GitHubProvider"

export class NsisUpdater extends EventEmitter {
  private setupPath: string | null

  private updateAvailable = false
  private quitAndInstallCalled = false

  private clientPromise: Promise<Provider<any>>

  private readonly app: any

  private quitHandlerAdded = false

  constructor(options?: PublishConfiguration | BintrayOptions | GithubOptions) {
    super()

    this.app = (<any>global).__test_app || require("electron").app

    if (options == null) {
      this.clientPromise = this.loadUpdateConfig()
    }
    else {
      this.setFeedURL(options)
    }
  }

  getFeedURL(): string | null | undefined {
    return JSON.stringify(this.clientPromise, null, 2)
  }

  setFeedURL(value: string | PublishConfiguration | BintrayOptions | GithubOptions | GenericServerOptions) {
    this.clientPromise = BluebirdPromise.resolve(createClient(value))
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (this.clientPromise == null) {
      const message = "Update URL is not set"
      const error = new Error(message)
      this.emit("error", error, message)
      throw error
    }

    this.emit("checking-for-update")
    try {
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
    this.emit("update-available")

    const mkdtemp: (prefix: string) => Promise<string> = require("fs-extra-p").mkdtemp
    return {
      versionInfo: versionInfo,
      fileInfo: fileInfo,
      downloadPromise: mkdtemp(`${path.join(tmpdir(), "up")}-`)
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
        }),
    }
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

  async loadUpdateConfig() {
    try {
      return createClient(safeLoad(await readFile(path.join((<any>global).__test_resourcesPath || (<any>process).resourcesPath, "app-update.yml"), "utf-8")))
    }
    catch (e) {
      this.emit("error", e, (e.stack || e).toString())
      throw e
    }
  }
}

function createClient(data: string | PublishConfiguration | BintrayOptions | GithubOptions) {
  if (typeof data === "string") {
    throw new Error("Please pass PublishConfiguration object")
  }
  else {
    const provider = (<PublishConfiguration>data).provider
    switch (provider) {
      case "github": return new GitHubProvider(<GithubOptions>data)
      case "generic": return new GenericProvider(<GenericServerOptions>data)
      case "bintray":  return new BintrayProvider(<BintrayOptions>data)
      default: throw new Error(`Unsupported provider: ${provider}`)
    }
  }
}