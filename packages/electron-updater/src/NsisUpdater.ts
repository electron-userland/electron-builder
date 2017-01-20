import { spawn } from "child_process"
import * as path from "path"
import { tmpdir } from "os"
import { download, DownloadOptions } from "electron-builder-http"
import { DOWNLOAD_PROGRESS, FileInfo } from "./api"
import { BintrayOptions, PublishConfiguration, GithubOptions, VersionInfo } from "electron-builder-http/out/publishOptions"
import { mkdtemp } from "fs-extra-p"
import "source-map-support/register"
import { AppUpdater } from "./AppUpdater"

export class NsisUpdater extends AppUpdater {
  private setupPath: string | null
  private quitAndInstallCalled = false
  private quitHandlerAdded = false

  constructor(options?: PublishConfiguration | BintrayOptions | GithubOptions) {
    super(options)
  }

  /**
   * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
   * @returns {Promise<string>} Path to downloaded file.
   */
  protected async doDownloadUpdate(versionInfo: VersionInfo, fileInfo: FileInfo) {
    const downloadOptions: DownloadOptions = {
      skipDirCreation: true,
    }

    if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
      downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
    }

    if (fileInfo != null && fileInfo.sha2 != null) {
      downloadOptions.sha2 = fileInfo.sha2
    }

    return mkdtemp(`${path.join(tmpdir(), "up")}-`)
      .then(it => download(fileInfo.url, path.join(it, fileInfo.name), downloadOptions))
      .then(it => {
        this.setupPath = it
        this.addQuitHandler()
        const version = this.versionInfo!.version
        if (this.logger != null) {
          this.logger.info(`New version ${version} has been downloaded`)
        }
        this.emit("update-downloaded", this.versionInfo, null, version, null, null, () => {
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
}