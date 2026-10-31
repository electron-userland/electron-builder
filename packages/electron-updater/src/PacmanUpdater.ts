import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter.js"
import { DownloadUpdateOptions } from "./AppUpdater.js"
import { DOWNLOAD_PROGRESS, Logger, DownloadExecutorResult, ResolvedUpdateFileInfo } from "./types.js"
import { findFile } from "./providers/Provider.js"
import { InstallPlan, LinuxUpdater, runInstallPlan } from "./LinuxUpdater.js"

export class PacmanUpdater extends LinuxUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  protected findUpdateFile(files: Array<ResolvedUpdateFileInfo>): ResolvedUpdateFileInfo | null | undefined {
    return findFile(files, "pacman", ["AppImage", "deb", "rpm"])
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<DownloadExecutorResult> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = this.findUpdateFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info))!
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
