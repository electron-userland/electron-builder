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
      RpmUpdater.installWithCommandRunner(packageManager as any, installerPath, this.runCommandWithSudoIfNeeded.bind(this), this._logger, this.requireSignedLinuxPackages)
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
    packageManager: "zypper" | "dnf" | "yum" | "rpm",
    installerPath: string,
    commandRunner: (commandWithArgs: string[]) => void,
    logger: Logger,
    requireSigned = false
  ) {
    const warnUnsigned = (flag: string) => {
      if (!requireSigned) {
        logger.warn(
          `installing .rpm without distro signature verification (${flag}). Artifact integrity is still checked via the update manifest sha512. Set requireSignedLinuxPackages=true to enforce distro signatures.`
        )
      } else {
        logger.info("requireSignedLinuxPackages is enabled — the package manager will enforce RPM signature verification")
      }
    }
    if (packageManager === "zypper") {
      const args = ["zypper", "--non-interactive", "--no-refresh", "install"]
      if (!requireSigned) {
        warnUnsigned("--allow-unsigned-rpm")
        args.push("--allow-unsigned-rpm")
      }
      args.push("-f", installerPath)
      return commandRunner(args)
    }
    if (packageManager === "dnf") {
      const args = ["dnf", "install"]
      if (!requireSigned) {
        warnUnsigned("--nogpgcheck")
        args.push("--nogpgcheck")
      }
      args.push("-y", installerPath)
      return commandRunner(args)
    }
    if (packageManager === "yum") {
      const args = ["yum", "install"]
      if (!requireSigned) {
        warnUnsigned("--nogpgcheck")
        args.push("--nogpgcheck")
      }
      args.push("-y", installerPath)
      return commandRunner(args)
    }
    if (packageManager === "rpm") {
      logger.warn("Installing with rpm only (no dependency resolution).")
      // --nodeps is about dependency resolution, not signatures; rpm still checks the package signature
      // when a matching GPG key is imported. Keep replace flags; only drop --nodeps when signatures are required.
      const args = ["rpm", "-Uvh", "--replacepkgs", "--replacefiles"]
      if (!requireSigned) {
        args.push("--nodeps")
      }
      args.push(installerPath)
      return commandRunner(args)
    }
    throw new Error(`Package manager ${packageManager} not supported`)
  }
}
