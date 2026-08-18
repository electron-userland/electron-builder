import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter.js"
import { DownloadUpdateOptions } from "./AppUpdater.js"
import { InstallOptions } from "./BaseUpdater.js"
import { DOWNLOAD_PROGRESS, Logger } from "./types.js"
import { findFile } from "./providers/Provider.js"
import { InstallPlan, LinuxUpdater, runInstallPlan } from "./LinuxUpdater.js"

export class PacmanUpdater extends LinuxUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "pacman", ["AppImage", "deb", "rpm"])!
    return this.executeDownload({
      fileExtension: "pacman",
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
    const plan = this.planInstall(this.installerPath)
    if (plan == null) {
      return false
    }
    try {
      runInstallPlan(plan, this.runCommandWithSudoIfNeeded.bind(this), this._logger)
    } catch (error: any) {
      this.dispatchError(error)
      return false
    }
    if (options.isForceRunAfter) {
      this.app.relaunch() // note: `app` is undefined in tests since vite doesn't run in electron
    }
    return true
  }

  protected async doInstallAsync(options: InstallOptions): Promise<boolean> {
    const plan = this.planInstall(this.installerPath)
    if (plan == null) {
      return false
    }
    try {
      await this.runInstallPlanWithSudoIfNeededAsync(plan)
    } catch (error: any) {
      this.dispatchError(error)
      return false
    }
    if (options.isForceRunAfter) {
      this.app.relaunch()
    }
    return true
  }

  private planInstall(installerPath: string | null): InstallPlan | null {
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return null
    }
    return PacmanUpdater.planInstall(installerPath)
  }

  static installWithCommandRunner(installerPath: string, commandRunner: (commandWithArgs: string[]) => void, logger: Logger) {
    runInstallPlan(PacmanUpdater.planInstall(installerPath), commandRunner, logger)
  }

  static planInstall(installerPath: string): InstallPlan {
    const install = ["pacman", "-U", "--noconfirm", installerPath]
    // if the install fails, refresh the package database (not a full upgrade, just sync) and retry once
    return [[install], [["pacman", "-Sy", "--noconfirm"], install]]
  }
}
