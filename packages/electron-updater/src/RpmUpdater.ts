import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter.js"
import { DownloadUpdateOptions } from "./AppUpdater.js"
import { InstallOptions } from "./BaseUpdater.js"
import { DOWNLOAD_PROGRESS, Logger } from "./types.js"
import { findFile } from "./providers/Provider.js"
import { LinuxUpdater } from "./LinuxUpdater.js"

export class RpmUpdater extends LinuxUpdater {
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

  protected doInstall(options: InstallOptions): boolean {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }

    const priorityList = ["zypper", "dnf", "yum", "rpm"]
    const packageManager = this.detectPackageManager(priorityList)
    try {
      RpmUpdater.installWithCommandRunner(packageManager as any, installerPath, this.runCommandWithSudoIfNeeded.bind(this), this._logger)
    } catch (error: any) {
      this.dispatchError(error)
      return false
    }
    if (options.isForceRunAfter) {
      this.app.relaunch()
    }
    return true
  }

  static installWithCommandRunner(packageManager: "zypper" | "dnf" | "yum" | "rpm", installerPath: string, commandRunner: (commandWithArgs: string[]) => void, logger: Logger) {
    if (packageManager === "zypper") {
      return commandRunner(["zypper", "--non-interactive", "--no-refresh", "install", "--allow-unsigned-rpm", "-f", installerPath])
    }
    if (packageManager === "dnf") {
      return commandRunner(["dnf", "install", "--nogpgcheck", "-y", installerPath])
    }
    if (packageManager === "yum") {
      return commandRunner(["yum", "install", "--nogpgcheck", "-y", installerPath])
    }
    if (packageManager === "rpm") {
      logger.warn("Installing with rpm only (no dependency resolution).")
      return commandRunner(["rpm", "-Uvh", "--replacepkgs", "--replacefiles", "--nodeps", installerPath])
    }
    throw new Error(`Package manager ${packageManager} not supported`)
  }
}
