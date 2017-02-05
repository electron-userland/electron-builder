import { AppUpdater } from "./AppUpdater"
import { PublishConfiguration, VersionInfo } from "electron-builder-http/out/publishOptions"
import BluebirdPromise from "bluebird-lst-c"
import { FileInfo } from "./api"
import AutoUpdater = Electron.AutoUpdater

export class MacUpdater extends AppUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  constructor(options?: PublishConfiguration) {
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