import { AllPublishOptions, newError, PackageFileInfo, BlockMap, CURRENT_APP_PACKAGE_FILE_NAME, CURRENT_APP_INSTALLER_FILE_NAME } from "builder-util-runtime"
import { spawn } from "child_process"
import * as path from "path"
import { AppAdapter } from "./AppAdapter"
import { DownloadUpdateOptions } from "./AppUpdater"
import { BaseUpdater, InstallOptions } from "./BaseUpdater"
import { DifferentialDownloaderOptions } from "./differentialDownloader/DifferentialDownloader"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "./differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import { GenericDifferentialDownloader } from "./differentialDownloader/GenericDifferentialDownloader"
import { DOWNLOAD_PROGRESS, ResolvedUpdateFileInfo } from "./main"
import { blockmapFiles } from "./util"
import { findFile, Provider } from "./providers/Provider"
import { unlink } from "fs-extra"
import { verifySignature } from "./windowsExecutableCodeSignatureVerifier"
import { URL } from "url"
import { gunzipSync } from "zlib"

export class NsisUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  /*** @private */
  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const fileInfo = findFile(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "exe")!
    return this.executeDownload({
      fileExtension: "exe",
      downloadUpdateOptions,
      fileInfo,
      task: async (destinationFile, downloadOptions, packageFile, removeTempDirIfAny) => {
        const packageInfo = fileInfo.packageInfo
        const isWebInstaller = packageInfo != null && packageFile != null
        if (isWebInstaller || (await this.differentialDownloadInstaller(fileInfo, downloadUpdateOptions, destinationFile, provider))) {
          await this.httpExecutor.download(fileInfo.url, destinationFile, downloadOptions)
        }

        const signatureVerificationStatus = await this.verifySignature(destinationFile)
        if (signatureVerificationStatus != null) {
          await removeTempDirIfAny()
          // noinspection ThrowInsideFinallyBlockJS
          throw newError(
            `New version ${downloadUpdateOptions.updateInfoAndProvider.info.version} is not signed by the application owner: ${signatureVerificationStatus}`,
            "ERR_UPDATER_INVALID_SIGNATURE"
          )
        }

        if (isWebInstaller) {
          if (await this.differentialDownloadWebPackage(downloadUpdateOptions, packageInfo!, packageFile!, provider)) {
            try {
              await this.httpExecutor.download(new URL(packageInfo!.path), packageFile!, {
                headers: downloadUpdateOptions.requestHeaders,
                cancellationToken: downloadUpdateOptions.cancellationToken,
                sha512: packageInfo!.sha512,
              })
            } catch (e) {
              try {
                await unlink(packageFile!)
              } catch (ignored) {
                // ignore
              }

              throw e
            }
          }
        }
      },
    })
  }

  // $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
  // | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
  // | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
  private async verifySignature(tempUpdateFile: string): Promise<string | null> {
    let publisherName: Array<string> | string | null
    try {
      publisherName = (await this.configOnDisk.value).publisherName
      if (publisherName == null) {
        return null
      }
    } catch (e) {
      if (e.code === "ENOENT") {
        // no app-update.yml
        return null
      }
      throw e
    }
    return await verifySignature(Array.isArray(publisherName) ? publisherName : [publisherName], tempUpdateFile, this._logger)
  }

  protected doInstall(options: InstallOptions): boolean {
    const args = ["--updated"]
    if (options.isSilent) {
      args.push("/S")
    }

    if (options.isForceRunAfter) {
      args.push("--force-run")
    }

    const packagePath = this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.packageFile
    if (packagePath != null) {
      // only = form is supported
      args.push(`--package-file=${packagePath}`)
    }

    const callUsingElevation = (): void => {
      _spawn(path.join(process.resourcesPath!, "elevate.exe"), [options.installerPath].concat(args)).catch(e => this.dispatchError(e))
    }

    if (options.isAdminRightsRequired) {
      this._logger.info("isAdminRightsRequired is set to true, run installer using elevate.exe")
      callUsingElevation()
      return true
    }

    _spawn(options.installerPath, args).catch((e: Error) => {
      // https://github.com/electron-userland/electron-builder/issues/1129
      // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
      const errorCode = (e as NodeJS.ErrnoException).code
      this._logger.info(`Cannot run installer: error code: ${errorCode}, error message: "${e.message}", will be executed again using elevate if EACCES"`)
      if (errorCode === "UNKNOWN" || errorCode === "EACCES") {
        callUsingElevation()
      } else {
        this.dispatchError(e)
      }
    })
    return true
  }

  private async differentialDownloadInstaller(
    fileInfo: ResolvedUpdateFileInfo,
    downloadUpdateOptions: DownloadUpdateOptions,
    installerPath: string,
    provider: Provider<any>
  ): Promise<boolean> {
    try {
      if (this._testOnlyOptions != null && !this._testOnlyOptions.isUseDifferentialDownload) {
        return true
      }
      const blockmapFileUrls = blockmapFiles(fileInfo.url, this.app.version, downloadUpdateOptions.updateInfoAndProvider.info.version)
      this._logger.info(`Download block maps (old: "${blockmapFileUrls[0]}", new: ${blockmapFileUrls[1]})`)

      const downloadBlockMap = async (url: URL): Promise<BlockMap> => {
        const data = await this.httpExecutor.downloadToBuffer(url, {
          headers: downloadUpdateOptions.requestHeaders,
          cancellationToken: downloadUpdateOptions.cancellationToken,
        })

        if (data == null || data.length === 0) {
          throw new Error(`Blockmap "${url.href}" is empty`)
        }

        try {
          return JSON.parse(gunzipSync(data).toString())
        } catch (e) {
          throw new Error(`Cannot parse blockmap "${url.href}", error: ${e}`)
        }
      }

      const downloadOptions: DifferentialDownloaderOptions = {
        newUrl: fileInfo.url,
        oldFile: path.join(this.downloadedUpdateHelper!.cacheDir, CURRENT_APP_INSTALLER_FILE_NAME),
        logger: this._logger,
        newFile: installerPath,
        isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
        requestHeaders: downloadUpdateOptions.requestHeaders,
        cancellationToken: downloadUpdateOptions.cancellationToken,
      }

      if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
        downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
      }

      const blockMapDataList = await Promise.all(blockmapFileUrls.map(u => downloadBlockMap(u)))
      await new GenericDifferentialDownloader(fileInfo.info, this.httpExecutor, downloadOptions).download(blockMapDataList[0], blockMapDataList[1])
      return false
    } catch (e) {
      this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
      if (this._testOnlyOptions != null) {
        // test mode
        throw e
      }
      return true
    }
  }

  private async differentialDownloadWebPackage(
    downloadUpdateOptions: DownloadUpdateOptions,
    packageInfo: PackageFileInfo,
    packagePath: string,
    provider: Provider<any>
  ): Promise<boolean> {
    if (packageInfo.blockMapSize == null) {
      return true
    }

    try {
      const downloadOptions: DifferentialDownloaderOptions = {
        newUrl: new URL(packageInfo.path),
        oldFile: path.join(this.downloadedUpdateHelper!.cacheDir, CURRENT_APP_PACKAGE_FILE_NAME),
        logger: this._logger,
        newFile: packagePath,
        requestHeaders: this.requestHeaders,
        isUseMultipleRangeRequest: provider.isUseMultipleRangeRequest,
        cancellationToken: downloadUpdateOptions.cancellationToken,
      }

      if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
        downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
      }

      await new FileWithEmbeddedBlockMapDifferentialDownloader(packageInfo, this.httpExecutor, downloadOptions).download()
    } catch (e) {
      this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
      // during test (developer machine mac or linux) we must throw error
      return process.platform === "win32"
    }
    return false
  }
}

/**
 * This handles both node 8 and node 10 way of emitting error when spawning a process
 *   - node 8: Throws the error
 *   - node 10: Emit the error(Need to listen with on)
 */
async function _spawn(exe: string, args: Array<string>): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const process = spawn(exe, args, {
        detached: true,
        stdio: "ignore",
      })
      process.on("error", error => {
        reject(error)
      })
      process.unref()

      if (process.pid !== undefined) {
        resolve(true)
      }
    } catch (error) {
      reject(error)
    }
  })
}
