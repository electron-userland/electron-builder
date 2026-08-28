import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter.js"
import { DownloadUpdateOptions } from "./AppUpdater.js"
import { InstallOptions } from "./BaseUpdater.js"
import { findFile } from "./providers/Provider.js"
import { DOWNLOAD_PROGRESS, Logger } from "./types.js"
import { LinuxUpdater } from "./LinuxUpdater.js"

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

  protected doInstall(options: InstallOptions): boolean {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }
    if (!this.hasCommand("dpkg") && !this.hasCommand("apt")) {
      this.dispatchError(new Error("Neither dpkg nor apt command found. Cannot install .deb package."))
      return false
    }
    const priorityList = ["dpkg", "apt"]
    const packageManager = this.detectPackageManager(priorityList)
    try {
      DebUpdater.installWithCommandRunner(packageManager as any, installerPath, this.runCommandWithSudoIfNeeded.bind(this), this._logger, this.allowUnverifiedLinuxPackages)
    } catch (error: any) {
      this.dispatchError(error)
      return false
    }
    if (options.isForceRunAfter) {
      this.app.relaunch()
    }
    return true
  }

  static installWithCommandRunner(
    packageManager: "dpkg" | "apt",
    installerPath: string,
    commandRunner: (commandWithArgs: string[]) => void,
    logger: Logger,
    allowUnverified = true
  ) {
    if (packageManager === "dpkg") {
      if (!allowUnverified) {
        logger.warn(
          "allowUnverifiedLinuxPackages=false has no effect when installing with dpkg: dpkg performs no signature verification. Enforcing .deb signature verification requires a debsig-verify/debsigs policy on the target system."
        )
      }
      try {
        // Primary: Install .deb directly with dpkg (dpkg performs no signature verification regardless of allowUnverified)
        commandRunner(["dpkg", "-i", installerPath])
      } catch (error: any) {
        // Handle missing dependencies via apt-get
        logger.warn(error.message ?? error)
        logger.warn("dpkg installation failed, trying to fix broken dependencies with apt-get")
        commandRunner(["apt-get", "install", "-f", "-y"])
      }
    } else if (packageManager === "apt") {
      if (allowUnverified) {
        logger.info(
          "Installing a local .deb with apt; package signature verification is bypassed (allowUnverifiedLinuxPackages defaults to true since electron-builder does not sign Linux packages). Set it to false to enforce verification if you sign your packages."
        )
      } else {
        logger.info("Installing a local .deb with apt with package signature verification enforced (allowUnverifiedLinuxPackages=false).")
      }
      commandRunner([
        "apt",
        "install",
        "-y",
        ...(allowUnverified ? ["--allow-unauthenticated"] : []), // unsigned .debs only when explicitly opted in
        "--allow-downgrades", // allow lower version installs
        "--allow-change-held-packages",
        installerPath,
      ])
    } else {
      throw new Error(`Package manager ${packageManager} not supported`)
    }
  }
}
