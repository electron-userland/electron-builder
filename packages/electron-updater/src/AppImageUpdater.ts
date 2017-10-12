import { CancellationToken, DownloadOptions, AllPublishOptions, VersionInfo, AppImageUpdateInfo } from "builder-util-runtime"
import { spawn, SpawnOptions } from "child_process"
import "source-map-support/register"
import { DifferentialDownloader } from "./differentialPackage"
import { FileInfo, UPDATE_DOWNLOADED } from "./main"
import { BaseUpdater } from "./BaseUpdater"
import { readBlockMapDataFromAppImage } from "builder-util-runtime/out/blockMapApi"
import { safeLoad } from "js-yaml"
import { chmod, move, unlink } from "fs-extra-p"
import * as path from "path"

export class AppImageUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: any) {
    super(options, app)
  }

  /*** @private */
  protected async doDownloadUpdate(versionInfo: VersionInfo, fileInfo: FileInfo, cancellationToken: CancellationToken): Promise<Array<string>> {
    const downloadOptions: DownloadOptions = {
      skipDirCreation: true,
      headers: this.computeRequestHeaders(fileInfo),
      cancellationToken,
      sha512: fileInfo == null ? null : fileInfo.sha512,
    }

    let installerPath = this.downloadedUpdateHelper.getDownloadedFile(versionInfo, fileInfo)
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
        await new DifferentialDownloader((versionInfo as any) as AppImageUpdateInfo, this.httpExecutor, {
          newUrl: fileInfo.url,
          oldPackageFile: oldFile,
          logger: this._logger,
          newFile: installerPath,
          requestHeaders: this.requestHeaders,
        }).downloadAppImage(safeLoad(await readBlockMapDataFromAppImage(oldFile)))
      }
      catch (e) {
        this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
        // during test (developer machine mac) we must throw error
        isDownloadFull = process.platform === "linux"
      }

      if (isDownloadFull) {
        await this.httpExecutor.download(fileInfo.url, installerPath, downloadOptions)
      }
    })

    this.downloadedUpdateHelper.setDownloadedFile(installerPath!!, null, versionInfo, fileInfo)
    this.addQuitHandler()
    this.emit(UPDATE_DOWNLOADED, this.versionInfo)
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

    let destination: string
    if (path.basename(installerPath) === path.basename(appImageFile)) {
      // no version in the file name, overwrite existing
      destination = appImageFile
    }
    else {
      destination = path.join(path.dirname(appImageFile), path.basename(installerPath))
    }
    move(installerPath, destination, {overwrite: true})
      .then(() => chmod(destination, "0755"))
      .then((): any => {
        if (destination === appImageFile) {
          return null
        }
        else {
          return unlink(appImageFile)
        }
      })
      .then(() => {
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