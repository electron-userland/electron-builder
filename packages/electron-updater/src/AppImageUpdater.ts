import { CancellationToken, DownloadOptions, AllPublishOptions, UpdateInfo } from "builder-util-runtime"
import { spawn, SpawnOptions } from "child_process"
import "source-map-support/register"
import { DifferentialDownloader } from "./differentialPackage"
import { UPDATE_DOWNLOADED, UpdateCheckResult } from "./main"
import { BaseUpdater } from "./BaseUpdater"
import { readBlockMapDataFromAppImage } from "builder-util-runtime/out/blockMapApi"
import { safeLoad } from "js-yaml"
import { chmod, move } from "fs-extra-p"
import * as path from "path"
import isDev from "electron-is-dev"
import BluebirdPromise from "bluebird-lst"
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
    const fileInfo = findFile((await this.provider).resolveFiles(updateInfo), "AppImage")

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
        await new DifferentialDownloader(fileInfo.info, this.httpExecutor, {
          newUrl: fileInfo.url.href,
          oldPackageFile: oldFile,
          logger: this._logger,
          newFile: installerPath,
          requestHeaders,
        }).downloadAppImage(safeLoad(await readBlockMapDataFromAppImage(oldFile)))
      }
      catch (e) {
        this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
        // during test (developer machine mac) we must throw error
        isDownloadFull = process.platform === "linux"
      }

      if (isDownloadFull) {
        await this.httpExecutor.download(fileInfo.url.href, installerPath, downloadOptions)
      }
    })

    this.downloadedUpdateHelper.setDownloadedFile(installerPath!!, null, updateInfo, fileInfo)
    this.addQuitHandler()
    this.emit(UPDATE_DOWNLOADED, this.updateInfo)
    return [installerPath!!]
  }

  protected doInstall(installerPath: string, isSilent: boolean, isForceRunAfter: boolean): boolean {
    const args = [""]
    if (isForceRunAfter) {
      args.push("--force-run")
    }

    const appImageFile = process.env.APPIMAGE!!
    if (appImageFile == null) {
      throw new Error("APPIMAGE env is not defined")
    }

    const spawnOptions: SpawnOptions = {
      detached: true,
      stdio: "ignore",
      env: {
        APPIMAGE_SILENT_INSTALL: "true",
      },
    }

    if (!isForceRunAfter) {
      spawnOptions.env.APPIMAGE_EXIT_AFTER_INSTALL = "true"
    }

    let destination: string
    if (path.basename(installerPath) === path.basename(appImageFile)) {
      // no version in the file name, overwrite existing
      destination = appImageFile
    }
    else {
      destination = path.join(path.dirname(appImageFile), path.basename(installerPath))
      spawnOptions.env.APPIMAGE_DELETE_OLD_FILE = appImageFile
    }
    move(installerPath, destination, {overwrite: true})
      .then(() => chmod(destination, "0755"))
      .then(() => {
        try {
          spawn(installerPath, args, spawnOptions)
            .unref()
        }
        catch (e) {
          this.dispatchError(e)
        }
      })
      .catch(e => this.dispatchError(e))

    return true
  }
}