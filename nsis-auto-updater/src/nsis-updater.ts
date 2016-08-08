import { EventEmitter } from "events"
import { spawn } from "child_process"
import * as path from "path"
import { tmpdir } from "os"
import { Promise as BluebirdPromise } from "bluebird"
import { BintrayClient } from "../../src/publish/bintray"
import { HttpError } from "../../src/publish/restApiRequest"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../../src/util/awaiter")

interface VersionInfo {
  version: string
}

interface Provider {
  checkForUpdates(): Promise<VersionInfo>
}

//noinspection ReservedWordAsName
interface BintraySourceMetadata {
  // e.g. develar
  readonly user: string
  // e.g. onshape-desktop-shell
  readonly package: string

  // e.g. generic or bin, defaults to generic
  readonly repository?: string | null
}

class BintrayProvider {
  private client: BintrayClient

  constructor(configuration: BintraySourceMetadata) {
    this.client = new BintrayClient(configuration.user, configuration.package, configuration.repository || "generic")
  }

  async checkForUpdates(): Promise<VersionInfo> {
    try {
      const data = await this.client.getVersion("_latest")
      return {
        version: data.name,
      }
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`No latest version, please ensure that user, repository and package correctly configured. Or at least one version is published.${e.stack || e.message}`)
      }
      throw e
    }
  }
}

class NsisUpdater extends EventEmitter {
  private setupPath = path.join(tmpdir(), 'innobox-upgrade.exe')

  private updateAvailable = false
  private quitAndInstallCalled = false

  private client: Provider

  constructor(public updateUrl?: string) {
    super()
  }

  getFeedURL(): string | null | undefined {
    return this.updateUrl
  }

  setFeedURL(value: string | BintraySourceMetadata) {
    this.updateUrl = value.toString()

    this.client = new BintrayProvider(<BintraySourceMetadata>value)
  }

  checkForUpdates(): Promise<any> {
    if (this.updateUrl == null) {
      const message = "Update URL is not set"
      this.emitError(message)
      return BluebirdPromise.reject(new Error(message))
    }

    this.emit("checking-for-update")
    return this.client.checkForUpdates()
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

    require("electron").app.quit()
  }

  // emit both error object and message, this is to keep compatibility with old APIs
  private emitError (message: string) {
    return this.emit("error", new Error(message), message)
  }
}

const updater = new NsisUpdater()
export= updater