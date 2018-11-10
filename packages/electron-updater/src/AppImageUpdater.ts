import { AllPublishOptions, newError } from "builder-util-runtime"
import { execFileSync, spawn } from "child_process"
import isDev from "electron-is-dev"
import { chmod, unlinkSync } from "fs-extra-p"
import * as path from "path"
import "source-map-support/register"
import { DownloadUpdateOptions } from "./AppUpdater"
import { BaseUpdater } from "./BaseUpdater"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "./differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import { UpdateCheckResult } from "./main"
import { findFile } from "./providers/Provider"

export class AppImageUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: any) {
    super(options, app)
  }

  checkForUpdatesAndNotify(): Promise<UpdateCheckResult | null> {
    if (isDev) {
      return Promise.resolve(null)
    }

    if (process.env.APPIMAGE == null) {
      if (process.env.SNAP == null) {
        this._logger.warn("APPIMAGE env is not defined, current application is not an AppImage")
      }
      else {
        this._logger.info("SNAP env is defined, updater is disabled")
      }
      return Promise.resolve(null)
    }

    return super.checkForUpdatesAndNotify()
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "AppImage")!!
    return this.executeDownload({
      fileExtension: "AppImage",
      fileInfo,
      downloadUpdateOptions,
      task: async (updateFile, downloadOptions) => {
        const oldFile = process.env.APPIMAGE!!
        if (oldFile == null) {
          throw newError("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND")
        }

        let isDownloadFull = false
        try {
          await new FileWithEmbeddedBlockMapDifferentialDownloader(fileInfo.info, this.httpExecutor, {
            newUrl: fileInfo.url,
            oldFile,
            logger: this._logger,
            newFile: updateFile,
            isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
            requestHeaders: downloadUpdateOptions.requestHeaders,
          })
            .download()
        }
        catch (e) {
          this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
          // during test (developer machine mac) we must throw error
          isDownloadFull = process.platform === "linux"
        }

        if (isDownloadFull) {
          await this.httpExecutor.download(fileInfo.url, updateFile, downloadOptions)
        }

        await chmod(updateFile, 0o755)
      },
    })
  }

  protected async doInstall(installerPath: string, isSilent: boolean, isRunAfter: boolean): Promise<boolean> {
    const appImageFile = process.env.APPIMAGE!!
    if (appImageFile == null) {
      throw newError("APPIMAGE env is not defined", "ERR_UPDATER_OLD_FILE_NOT_FOUND")
    }

    // https://stackoverflow.com/a/1712051/1910191
    unlinkSync(appImageFile)

    let destination: string
    const existingBaseName = path.basename(appImageFile)
    // https://github.com/electron-userland/electron-builder/issues/2964
    // if no version in existing file name, it means that user wants to preserve current custom name
    if (path.basename(installerPath) === existingBaseName || !/\d+\.\d+\.\d+/.test(existingBaseName)) {
      // no version in the file name, overwrite existing
      destination = appImageFile
    }
    else {
      destination = path.join(path.dirname(appImageFile), path.basename(installerPath))
    }

    execFileSync("mv", ["-f", installerPath, destination])

    const env: any = {
      ...process.env,
      APPIMAGE_SILENT_INSTALL: "true",
    }

    if (isRunAfter) {
      spawn(destination, [], {
        detached: true,
        stdio: "ignore",
        env,
      })
        .unref()
    }
    else {
      env.APPIMAGE_EXIT_AFTER_INSTALL = "true"
      execFileSync(destination, [], {env})
    }
    return true
  }
}