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
      this.dispatchError(new Error("No valid update available, can't quit and install"))
      return false
    }

    const runInstallationCommand = (cmd: string[]) => {
      this.runCommandWithSudoIfNeeded(cmd)
      if (options.isForceRunAfter) {
        this.app.relaunch()
      }
      return true
    }

    const packageManager = this.detectPackageManager()
    if (packageManager === "rpm") {
      return runInstallationCommand(["rpm", "-U", "--replacepkgs", "--replacefiles", "--nodeps", installerPath])
    } else if (packageManager === "dnf") {
      return runInstallationCommand(["dnf", "install", "-y", "--best", "--allowerasing", installerPath])
    } else if (packageManager === "yum") {
      return runInstallationCommand(["yum", "install", "-y", "--best", "--allowerasing", installerPath])
    } else if (packageManager === "zypper") {
      return runInstallationCommand(["zypper", "--no-refresh", "install", "--allow-unsigned-rpm", "-y", "-f", installerPath])
    } else if (packageManager === "apt") {
      // apt is not a supported package manager for rpm files, but some systems have it installed
      // and it can be used to install rpm files
      // this is a workaround for the case when rpm fails to install the package
      // due to missing dependencies.
      // This is not a perfect solution, but it should work in most cases.
      this._logger.warn("rpm installation failed, trying to fix broken dependencies with apt-get")
      return runInstallationCommand(["apt", "install", "-y", installerPath])
    }
    // If no supported package manager is found, log an error and return false
    this.dispatchError(new Error(`Package manager ${packageManager} not supported`))
    return false
  }
}
