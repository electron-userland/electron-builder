import { AllPublishOptions, newError } from "builder-util-runtime"
import { execFileSync } from "child_process"
import fsExtra from "fs-extra"
import { copyFileSync, linkSync, renameSync, rmSync } from "fs"
import * as path from "path"
import { DownloadUpdateOptions } from "./AppUpdater.js"
import { BaseUpdater, InstallOptions } from "./BaseUpdater.js"
import { DifferentialDownloaderOptions } from "./differentialDownloader/DifferentialDownloader.js"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "./differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader.js"
import { findFile, Provider } from "./providers/Provider.js"
import { DOWNLOAD_PROGRESS, ResolvedUpdateFileInfo, DownloadExecutorResult } from "./types.js"
import { throwIfCancelled } from "./util.js"

export class AppImageUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: any) {
    super(options, app)
  }

  public isUpdaterActive(): boolean {
    if (process.env["APPIMAGE"] == null && !this.forceDevUpdateConfig) {
      if (process.env["SNAP"] == null) {
        this._logger.warn("APPIMAGE env is not defined, current application is not an AppImage")
      } else {
        this._logger.info("SNAP env is defined, updater is disabled")
      }
      return false
    }
    return super.isUpdaterActive()
  }

  // replacing the AppImage file needs no elevation, so the automatic install at startup is allowed
  protected get isAutoInstallOnNextLaunchSupported(): boolean {
    return true
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<DownloadExecutorResult> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "AppImage", ["rpm", "deb", "pacman"])!
    return this.executeDownload({
      fileExtension: "AppImage",
      fileInfo,
      downloadUpdateOptions,
      task: async (updateFile, downloadOptions) => {
        const oldFile = process.env["APPIMAGE"]!
        if (oldFile == null) {
          throw newError("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND")
        }

        if (downloadUpdateOptions.disableDifferentialDownload || (await this.downloadDifferential(fileInfo, oldFile, updateFile, provider, downloadUpdateOptions))) {
          await this.httpExecutor.download(fileInfo.url, updateFile, downloadOptions)
        }
      },
      // deferred until after verification: the temporary path is predictable, so marking the AppImage executable
      // before it is verified would leave an unverified binary runnable for as long as verification takes
      afterVerification: updateFile => fsExtra.chmod(updateFile, 0o755),
    })
  }

  private async downloadDifferential(fileInfo: ResolvedUpdateFileInfo, oldFile: string, updateFile: string, provider: Provider<any>, downloadUpdateOptions: DownloadUpdateOptions) {
    try {
      const downloadOptions: DifferentialDownloaderOptions = {
        newUrl: fileInfo.url,
        oldFile,
        logger: this._logger,
        newFile: updateFile,
        isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
        requestHeaders: this.downloadRequestHeaders(fileInfo.url, downloadUpdateOptions),
        cancellationToken: downloadUpdateOptions.cancellationToken,
      }

      if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
        downloadOptions.onProgress = it => this.emitDownloadProgress(it)
      }

      await new FileWithEmbeddedBlockMapDifferentialDownloader(fileInfo.info, this.httpExecutor, downloadOptions).download()
      return false
    } catch (e: any) {
      // a user cancellation is not a differential failure: no fallback to a full download
      throwIfCancelled(e, downloadUpdateOptions.cancellationToken)
      this.logDifferentialDownloadFallback(e)
      // during test (developer machine mac) we must throw error
      return process.platform === "linux"
    }
  }

  protected doInstall(options: InstallOptions): boolean {
    const appImageFile = process.env["APPIMAGE"]!
    if (appImageFile == null) {
      throw newError("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND")
    }
    if (!path.isAbsolute(appImageFile) || appImageFile.includes("\0")) {
      throw newError(`APPIMAGE env is not a valid absolute path: "${appImageFile}"`, "ERR_UPDATER_OLD_FILE_NOT_FOUND")
    }

    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }

    let destination: string
    const existingBaseName = path.basename(appImageFile)
    // https://github.com/electron-userland/electron-builder/issues/2964
    // if no version in existing file name, it means that user wants to preserve current custom name
    if (path.basename(installerPath) === existingBaseName || !/\d+\.\d+\.\d+/.test(existingBaseName)) {
      // no version in the file name, overwrite existing
      destination = appImageFile
    } else {
      destination = path.join(path.dirname(appImageFile), path.basename(installerPath))
    }

    // Stage the new AppImage next to the destination, then rename it over the destination. The rename is atomic, so the
    // installed AppImage is never missing: if anything fails, the user still has the old one. Replacing the file
    // (instead of writing into it) is safe while the old AppImage runs (https://stackoverflow.com/a/1712051/1910191).
    // No external command is used: PATH can hold the dead FUSE mount of an earlier AppImage launch, which makes every lookup fail.
    const staged = path.join(path.dirname(destination), `.${existingBaseName}.update`)
    rmSync(staged, { force: true })
    try {
      try {
        linkSync(installerPath, staged)
      } catch {
        // EXDEV (download cache on another filesystem) or a filesystem without hard links
        copyFileSync(installerPath, staged)
      }
      renameSync(staged, destination)
    } catch (e: any) {
      rmSync(staged, { force: true })
      throw e
    }
    this.removeAfterInstall(installerPath)

    if (destination !== appImageFile) {
      this.emit("appimage-filename-updated", destination)
      this.removeAfterInstall(appImageFile)
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      APPIMAGE_SILENT_INSTALL: "true",
    }

    if (options.isForceRunAfter) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.spawnLog(destination, [], env)
    } else {
      env.APPIMAGE_EXIT_AFTER_INSTALL = "true"
      execFileSync(destination, [], { env })
    }
    return true
  }

  // The new AppImage is already in place, so a leftover file must not fail the install and skip the relaunch.
  private removeAfterInstall(file: string) {
    try {
      rmSync(file, { force: true })
    } catch (e: any) {
      this._logger.warn(`Cannot remove ${file} after install: ${e.message || e}`)
    }
  }
}
