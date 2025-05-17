import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter"
import { DownloadUpdateOptions } from "./AppUpdater"
import { BaseUpdater, InstallOptions } from "./BaseUpdater"
import { DOWNLOAD_PROGRESS } from "./types"
import { findFile } from "./providers/Provider"

export class RpmUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "rpm", ["AppImage", "deb", "pacman"])!
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

  protected get installerPath(): string | null {
    return super.installerPath?.replace(/ /g, "\\ ") ?? null
  }

  protected doInstall(options: InstallOptions): boolean {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No valid update available, can't quit and install"))
      return false
    }

    const sudo = this.wrapSudo()
    // pkexec doesn't want the command to be wrapped in " quotes
    const wrapper = /pkexec/i.test(sudo) ? "" : `"`

    try {
      const packageManager = this.spawnSyncLog("which zypper")
      if (packageManager) {
        const cmd = [packageManager, "--no-refresh", "install", "--allow-unsigned-rpm", "-y", "-f", installerPath]
        this.spawnSyncLog(sudo, [`${wrapper}/bin/bash`, "-c", `'${cmd.join(" ")}'${wrapper}`])
        if (options.isForceRunAfter) {
          this.app.relaunch()
        }
        return true
      }
    } catch (_error) {
      // ignore, already logged
      // fallback to dnf/yum
    }
    try {
      const packageManager = this.spawnSyncLog("which dnf || which yum")
      if (packageManager) {
        const cmd = [packageManager, "-y", "install", installerPath]
        this.spawnSyncLog(sudo, [`${wrapper}/bin/bash`, "-c", `'${cmd.join(" ")}'${wrapper}`])
        if (options.isForceRunAfter) {
          this.app.relaunch()
        }
        return true
      }
    } catch (_error) {
      // ignore, already logged
    }
    this.dispatchError(new Error("No supported package manager available, can't quit and install. Please install zypper or dnf/yum"))
    return false

  }
}
