import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter"
import { DownloadUpdateOptions } from "./AppUpdater"
import { InstallOptions } from "./BaseUpdater"
import { DOWNLOAD_PROGRESS } from "./types"
import { findFile } from "./providers/Provider"
import { LinuxUpdater } from "./LinuxUpdater"

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

  protected get installerPath(): string | null {
    return super.installerPath?.replace(/ /g, "\\ ") ?? null
  }

  protected doInstall(options: InstallOptions): boolean {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }

    const runInstallationCommand = (cmd: string[]) => {
      this.runCommandWithSudoIfNeeded(cmd)
      if (options.isForceRunAfter) {
        this.app.relaunch()
      }
      return true
    }

    const priorityList = ["zypper", "dnf", "yum", "rpm"]
    const packageManager = this.detectPackageManager(priorityList)
    if (packageManager === "zypper") {
      return runInstallationCommand(["zypper", "--non-interactive", "--no-refresh", "install", "--allow-unsigned-rpm", "-f", installerPath])
    }
    if (packageManager === "dnf") {
      return runInstallationCommand(["dnf", "install", "--nogpgcheck", "-y", installerPath])
    }
    if (packageManager === "yum") {
      return runInstallationCommand(["yum", "install", "--nogpgcheck", "-y", installerPath])
    }
    if (packageManager === "rpm") {
      this._logger.warn("Installing with rpm only (no dependency resolution).")
      return runInstallationCommand(["rpm", "-Uvh", "--replacepkgs", "--replacefiles", "--nodeps", installerPath])
    }
    // If no supported package manager is found, log an error and return false
    this.dispatchError(new Error(`Package manager ${packageManager} not supported`))
    return false
  }
}
