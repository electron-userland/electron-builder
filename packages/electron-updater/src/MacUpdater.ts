import { AppUpdater } from "./AppUpdater"
import { BintrayOptions, PublishConfiguration, GithubOptions, S3Options, VersionInfo } from "electron-builder-http/out/publishOptions"
import BluebirdPromise from "bluebird-lst-c"
import { FileInfo } from "./api"
import AutoUpdater = Electron.AutoUpdater

export class MacUpdater extends AppUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  constructor(options?: PublishConfiguration | BintrayOptions | GithubOptions | S3Options) {
    super(options)

    this.nativeUpdater.on("error", it => {
      if (this.logger != null) {
        this.logger.warn(it)
      }
      this.emit("error", it)
    })
    this.nativeUpdater.on("update-downloaded", () => {
      if (this.logger != null) {
        this.logger.info(`New version ${this.versionInfo!.version} has been downloaded`)
      }
      this.emit("update-downloaded", this.versionInfo)
    })
  }

  protected onUpdateAvailable(versionInfo: VersionInfo, fileInfo: FileInfo) {
    this.nativeUpdater.setFeedURL((<any>versionInfo).releaseJsonUrl, Object.assign({"Cache-Control": "no-cache"}, this.requestHeaders))
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
