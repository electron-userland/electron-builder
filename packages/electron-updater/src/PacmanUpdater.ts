import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter"
import { DownloadUpdateOptions } from "./AppUpdater"
import { InstallOptions } from "./BaseUpdater"
import { DOWNLOAD_PROGRESS } from "./types"
import { findFile } from "./providers/Provider"
import { LinuxUpdater } from "./LinuxUpdater"

export class PacmanUpdater extends LinuxUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "pacman", ["AppImage", "deb", "rpm"])!
    return this.executeDownload({
      fileExtension: "pacman",
      fileInfo,
      downloadUpdateOptions,
      task: async (updateFile, downloadOptions) => {
        if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
          downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
        }
        await this.httpExecutor.download(fileInfo.url, updateFile, downloadOptions)
      },
    })
  }

  protected doInstall(options: InstallOptions): boolean {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }
    try {
      this.runCommandWithSudoIfNeeded(["pacman", "-U", "--noconfirm", installerPath])
    } catch (error: any) {
      this._logger.warn("pacman installation failed, attempting to update package database and retry")
      this._logger.warn(error.message ?? error)

      try {
        // Update package database (not a full upgrade, just sync)
        this.runCommandWithSudoIfNeeded(["pacman", "-Sy", "--noconfirm"])
        // Retry installation
        this.runCommandWithSudoIfNeeded(["pacman", "-U", "--noconfirm", installerPath])
      } catch (retryError: any) {
        this._logger.error("Retry after pacman -Sy failed")
        this.dispatchError(retryError)
        return false
      }
    }
    if (options.isForceRunAfter) {
      this.app.relaunch() // note: `app` is undefined in tests since vite doesn't run in electron
    }
    return true
  }
}
