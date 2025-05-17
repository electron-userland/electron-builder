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

  protected get installerPath(): string | null {
    return super.installerPath?.replace(/ /g, "\\ ") ?? null
  }

  protected doInstall(options: InstallOptions): boolean {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No valid update available, can't quit and install"))
      return false
    }
    this.runCommandWithSudoIfNeeded(["pacman", "-U", "--noconfirm", installerPath])
    if (options.isForceRunAfter) {
      this.app.relaunch() // note: `app` is undefined in tests since vite doesn't run in electron
    }
    return true
  }
}
