import BluebirdPromise from "bluebird-lst"
import { AllPublishOptions, CancellationToken, DownloadOptions, UpdateInfo } from "builder-util-runtime"
import { readBlockMapDataFromAppImage } from "builder-util-runtime/out/blockMapApi"
import { execFileSync, spawn } from "child_process"
import isDev from "electron-is-dev"
import { chmod, unlinkSync } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import "source-map-support/register"
import { BaseUpdater } from "./BaseUpdater"
import { AppImageDifferentialDownloader } from "./differentialDownloader/AppImageDifferentialDownloader"
import { UPDATE_DOWNLOADED, UpdateCheckResult } from "./main"
import { findFile } from "./Provider"

export class AppImageUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: any) {
    super(options, app)
  }

  checkForUpdatesAndNotify(): Promise<UpdateCheckResult | null> {
    if (isDev) {
      return BluebirdPromise.resolve(null)
    }

    if (process.env.APPIMAGE == null) {
      this._logger.warn("APPIMAGE env is not defined, current application is not an AppImage")
      return BluebirdPromise.resolve(null)
    }

    return super.checkForUpdatesAndNotify()
  }

  /*** @private */
  protected async doDownloadUpdate(updateInfo: UpdateInfo, cancellationToken: CancellationToken): Promise<Array<string>> {
    const provider = await this.provider
    const fileInfo = findFile(provider.resolveFiles(updateInfo), "AppImage")!!

    const requestHeaders = await this.computeRequestHeaders()
    const downloadOptions: DownloadOptions = {
      skipDirCreation: true,
      headers: requestHeaders,
      cancellationToken,
      sha512: fileInfo.info.sha512,
    }

    let installerPath = this.downloadedUpdateHelper.getDownloadedFile(updateInfo, fileInfo)
    if (installerPath != null) {
      return [installerPath]
    }

    await this.executeDownload(downloadOptions, fileInfo, async (tempDir, destinationFile) => {
      installerPath = destinationFile

      const oldFile = process.env.APPIMAGE!!
      if (oldFile == null) {
        throw new Error("APPIMAGE env is not defined")
      }

      let isDownloadFull = false
      try {
        await new AppImageDifferentialDownloader(fileInfo.info, this.httpExecutor, {
          newUrl: fileInfo.url.href,
          oldPackageFile: oldFile,
          logger: this._logger,
          newFile: installerPath,
          useMultipleRangeRequest: provider.useMultipleRangeRequest,
          requestHeaders,
        }).download(safeLoad(await readBlockMapDataFromAppImage(oldFile)))
      }
      catch (e) {
        this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
        // during test (developer machine mac) we must throw error
        isDownloadFull = process.platform === "linux"
      }

      if (isDownloadFull) {
        await this.httpExecutor.download(fileInfo.url.href, installerPath, downloadOptions)
      }

      await chmod(installerPath, 0o755)
    })

    this.downloadedUpdateHelper.setDownloadedFile(installerPath!!, null, updateInfo, fileInfo)
    this.addQuitHandler()
    this.emit(UPDATE_DOWNLOADED, this.updateInfo)
    return [installerPath!!]
  }

  protected doInstall(installerPath: string, isSilent: boolean, isRunAfter: boolean): boolean {
    const appImageFile = process.env.APPIMAGE!!
    if (appImageFile == null) {
      throw new Error("APPIMAGE env is not defined")
    }

    // https://stackoverflow.com/a/1712051/1910191
    unlinkSync(appImageFile)

    let destination: string
    if (path.basename(installerPath) === path.basename(appImageFile)) {
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