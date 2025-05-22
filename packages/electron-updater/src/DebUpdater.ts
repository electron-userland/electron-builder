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
    const priorityList = ["dpkg", "apt"]
    const packageManager = this.detectPackageManager(priorityList)

    if (packageManager === "dpkg") {
      try {
        // Primary: Install unsigned .deb directly with dpkg
        this.runCommandWithSudoIfNeeded(["dpkg", "-i", installerPath])
      } catch (error: any) {
        // Handle missing dependencies via apt-get
        this._logger.warn("dpkg installation failed, trying to fix broken dependencies with apt-get")
        this._logger.warn(error.message ?? error)
        this.runCommandWithSudoIfNeeded(["apt-get", "install", "-f", "-y"])
      }
    } else if (packageManager === "apt") {
      // Fallback: Use apt for direct install (less safe for unsigned .deb)
      this._logger.warn("Using apt to install a local .deb. This may fail for unsigned packages unless properly configured.")
      this.runCommandWithSudoIfNeeded([
        "apt",
        "install",
        "-y",
        "--allow-unauthenticated", // needed for unsigned .debs
        "--allow-downgrades", // allow lower version installs
        "--allow-change-held-packages",
        installerPath,
      ])
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
