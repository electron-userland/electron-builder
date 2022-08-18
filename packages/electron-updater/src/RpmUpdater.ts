import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter"
import { DownloadUpdateOptions } from "./AppUpdater"
import { BaseUpdater, InstallOptions } from "./BaseUpdater"
import { DOWNLOAD_PROGRESS } from "./main"
import { findFile } from "./providers/Provider"

export class RpmUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "rpm", ["AppImage", "deb"])!
    return this.executeDownload({
      fileExtension: "rpm",
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
    const sudo = this.wrapSudo()
    const packageManager = this.spawnSyncLog("which zypper")
    if (!packageManager) {
      const packageManager = this.spawnSyncLog("which dnf || which yum")
      const cmd = ['"', packageManager, "-y", "remove", `'${this.app.name}'`, ";", packageManager, "-y", "install", `'${options.installerPath}'`, '"']
      this.spawnSyncLog(sudo, ["/bin/bash", "-c", cmd.join(" ")])
    } else {
      const cmd = [
        '"',
        packageManager,
        "remove",
        "-y",
        `'${this.app.name}'`,
        ";",
        packageManager,
        "clean",
        "--all",
        ";",
        packageManager,
        "--no-refresh",
        "install",
        "--allow-unsigned-rpm",
        "-y",
        "-f",
        `'${options.installerPath}'`,
        '"',
      ]
      this.spawnSyncLog(sudo, ["/bin/bash", "-c", cmd.join(" ")])
    }
    return true
  }
}
