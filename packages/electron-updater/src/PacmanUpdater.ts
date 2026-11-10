import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter.js"
import { DownloadUpdateOptions } from "./AppUpdater.js"
import { DOWNLOAD_PROGRESS, Logger, DownloadExecutorResult } from "./types.js"
import { findFile } from "./providers/Provider.js"
import { InstallPlan, LinuxUpdater, runInstallPlan } from "./LinuxUpdater.js"

export class PacmanUpdater extends LinuxUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<DownloadExecutorResult> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "pacman", ["AppImage", "deb", "rpm"])!
    return this.executeDownload({
      fileExtension: "pacman",
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
    return PacmanUpdater.planInstall(installerPath)
  }

  static installWithCommandRunner(installerPath: string, commandRunner: (commandWithArgs: string[]) => void, logger: Logger) {
    runInstallPlan(PacmanUpdater.planInstall(installerPath), commandRunner, logger)
  }

  static planInstall(installerPath: string): InstallPlan {
    const install = ["pacman", "-U", "--noconfirm", installerPath]
    return {
      execCommand: install,
      recoveryMessage: "pacman installation failed, attempting to update package database and retry",
      // refresh the package database (not a full upgrade, just sync), then retry the install once
      recoveryChain: [{ execCommand: ["pacman", "-Sy", "--noconfirm"] }, { execCommand: install }],
    }
  }
}
