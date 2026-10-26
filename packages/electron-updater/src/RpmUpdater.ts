import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter.js"
import { DownloadUpdateOptions } from "./AppUpdater.js"
import { DOWNLOAD_PROGRESS, Logger, DownloadExecutorResult } from "./types.js"
import { findFile } from "./providers/Provider.js"
import { InstallPlan, isSupportedPackageManager, LinuxUpdater, runInstallPlan } from "./LinuxUpdater.js"

const RPM_PACKAGE_MANAGERS = ["zypper", "dnf", "yum", "rpm"] as const

export class RpmUpdater extends LinuxUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<DownloadExecutorResult> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "rpm", ["AppImage", "deb", "pacman"])!
    return this.executeDownload({
      fileExtension: "rpm",
      fileInfo,
      downloadUpdateOptions,
      task: async (updateFile, downloadOptions) => {
        if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
          downloadOptions.onProgress = it => this.emitDownloadProgress(it)
        }
        await this.httpExecutor.download(fileInfo.url, updateFile, downloadOptions)
      },
    })
  }

  protected resolveInstallPlan(installerPath: string): InstallPlan {
    const packageManager = this.detectPackageManager([...RPM_PACKAGE_MANAGERS])
    if (!isSupportedPackageManager(packageManager, RPM_PACKAGE_MANAGERS)) {
      throw new Error(`Package manager ${packageManager} not supported`)
    }
    return RpmUpdater.planInstall(packageManager, installerPath, this._logger, this.allowUnverifiedLinuxPackages)
  }

  static installWithCommandRunner(
    packageManager: "zypper" | "dnf" | "yum" | "rpm",
    installerPath: string,
    commandRunner: (commandWithArgs: string[]) => void,
    logger: Logger,
    allowUnverified = true
  ) {
    runInstallPlan(RpmUpdater.planInstall(packageManager, installerPath, logger, allowUnverified), commandRunner, logger)
  }

  static planInstall(packageManager: "zypper" | "dnf" | "yum" | "rpm", installerPath: string, logger: Logger, allowUnverified = true): InstallPlan {
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
      return { execCommand: ["zypper", "--non-interactive", "--no-refresh", "install", ...(allowUnverified ? ["--allow-unsigned-rpm"] : []), "-f", installerPath] }
    }
    if (packageManager === "dnf" || packageManager === "yum") {
      logVerificationMode()
      // Local package files are governed by localpkg_gpgcheck, which defaults to False on dnf4, dnf5, and yum,
      // so enforcement must enable it explicitly — merely omitting --nogpgcheck would not enforce anything.
      return { execCommand: [packageManager, "install", ...(allowUnverified ? ["--nogpgcheck"] : ["--setopt=localpkg_gpgcheck=1"]), "-y", installerPath] }
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
      return { execCommand: ["rpm", "-Uvh", "--replacepkgs", "--replacefiles", "--nodeps", installerPath] }
    }
    throw new Error(`Package manager ${packageManager} not supported`)
  }
}
