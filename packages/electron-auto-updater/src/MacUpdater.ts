import { AppUpdater } from "./AppUpdater"
import { BintrayOptions, PublishConfiguration, GithubOptions, VersionInfo } from "electron-builder-http/out/publishOptions"
import BluebirdPromise from "bluebird-lst-c"
import { FileInfo } from "./api"
import AutoUpdater = Electron.AutoUpdater

export class MacUpdater extends AppUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  constructor(options?: PublishConfiguration | BintrayOptions | GithubOptions) {
    super(options)

    this.nativeUpdater.on("error", it => {
      if (this.logger != null) {
        this.logger.warn(it)
      }
      this.emit("error", it)
    })
    this.nativeUpdater.on("update-downloaded", () => {
      const version = this.versionInfo!.version
      if (this.logger != null) {
        this.logger.info(`New version ${version} has been downloaded`)
      }
      this.emit("update-downloaded", this.versionInfo)
    })
  }

  protected onUpdateAvailable(versionInfo: VersionInfo, fileInfo: FileInfo) {
    this.nativeUpdater.setFeedURL((<any>versionInfo).releaseJsonUrl)
    super.onUpdateAvailable(versionInfo, fileInfo)
  }

  protected doDownloadUpdate(versionInfo: VersionInfo, fileInfo: FileInfo) {
    this.nativeUpdater.checkForUpdates()
    return BluebirdPromise.resolve()
  }

  quitAndInstall(): void {
    this.nativeUpdater.quitAndInstall()
  }
}