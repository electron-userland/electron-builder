import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter"
import { DownloadUpdateOptions } from "./AppUpdater"
import { InstallOptions } from "./BaseUpdater"
import { findFile } from "./providers/Provider"
import { DOWNLOAD_PROGRESS } from "./types"
import { LinuxUpdater } from "./LinuxUpdater"

export class DebUpdater extends LinuxUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "deb", ["AppImage", "rpm", "pacman"])!
    return this.executeDownload({
      fileExtension: "deb",
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
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }
    const packageManager = this.detectPackageManager()
    if (packageManager === "apt") {
      this.runCommandWithSudoIfNeeded(["apt", "install", "-y", installerPath])
    } else if (packageManager === "dpkg") {
      try {
        this.runCommandWithSudoIfNeeded(["dpkg", "-i", installerPath])
      } catch (error: any) {
        // If dpkg fails, try to fix broken dependencies
        this._logger.warn("dpkg installation failed, trying to fix broken dependencies with apt-get")
        this._logger.warn(error.message ?? error)
        this.runCommandWithSudoIfNeeded(["apt-get", "install", "-f", "-y"])
      }
    } else {
      this.dispatchError(new Error(`Package manager ${packageManager} not supported`))
      return false
    }
    if (options.isForceRunAfter) {
      this.app.relaunch()
    }
    return true
  }
}
