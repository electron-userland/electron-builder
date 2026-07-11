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
      RpmUpdater.installWithCommandRunner(packageManager as any, installerPath, this.runCommandWithSudoIfNeeded.bind(this), this._logger, this.allowUnverifiedLinuxPackages)
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
    allowUnverified = true
  ) {
    const logVerificationMode = () => {
      if (allowUnverified) {
        logger.info(
          "Installing .rpm with GPG/signature verification bypassed (allowUnverifiedLinuxPackages defaults to true since electron-builder does not sign Linux packages). Set it to false to enforce verification if you sign your packages."
        )
      } else {
        logger.info("Installing .rpm with GPG/signature verification enforced (allowUnverifiedLinuxPackages=false).")
      }
    }
    if (packageManager === "zypper") {
      logVerificationMode()
      return commandRunner(["zypper", "--non-interactive", "--no-refresh", "install", ...(allowUnverified ? ["--allow-unsigned-rpm"] : []), "-f", installerPath])
    }
    if (packageManager === "dnf" || packageManager === "yum") {
      logVerificationMode()
      // Local package files are governed by localpkg_gpgcheck, which defaults to False on dnf4, dnf5, and yum,
      // so enforcement must enable it explicitly — merely omitting --nogpgcheck would not enforce anything.
      return commandRunner([packageManager, "install", ...(allowUnverified ? ["--nogpgcheck"] : ["--setopt=localpkg_gpgcheck=1"]), "-y", installerPath])
    }
    if (packageManager === "rpm") {
      if (!allowUnverified) {
        logger.warn(
          'allowUnverifiedLinuxPackages=false cannot be enforced via the CLI when installing with bare rpm: the default %_pkgverify_level is "digest", so unsigned or untrusted packages still install. Configure "%_pkgverify_level signature" on the target system to enforce it. The install command is unchanged.'
        )
      }
      // --nodeps is a dependency-resolution bypass, not a signature bypass, and the rpm branch is the
      // no-resolver fallback, so it is left in place regardless of allowUnverifiedLinuxPackages.
      logger.warn("Installing with rpm only (no dependency resolution).")
      return commandRunner(["rpm", "-Uvh", "--replacepkgs", "--replacefiles", "--nodeps", installerPath])
    }
    throw new Error(`Package manager ${packageManager} not supported`)
  }
}
