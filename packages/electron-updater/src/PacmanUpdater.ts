import { AllPublishOptions } from "builder-util-runtime"
import { DownloadUpdateOptions } from "./AppUpdater.js"
import { BaseUpdater, InstallOptions } from "./BaseUpdater.js"
import { ElectronAppAdapter } from "./ElectronAppAdapter.js"
import { DOWNLOAD_PROGRESS } from "./types.js"
import { findFile } from "./providers/Provider.js"

export class PacmanUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: ElectronAppAdapter) {
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
    const sudo = this.wrapSudo()
    // pkexec doesn't want the command to be wrapped in " quotes
    const wrapper = /pkexec/i.test(sudo) ? "" : `"`
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No valid update available, can't quit and install"))
      return false
    }
    const cmd = ["pacman", "-U", "--noconfirm", installerPath]
    this.spawnSyncLog(sudo, [`${wrapper}/bin/bash`, "-c", `'${cmd.join(" ")}'${wrapper}`])
    if (options.isForceRunAfter) {
      this.app.relaunch()
    }
    return true
  }
}
