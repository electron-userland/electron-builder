import { AllPublishOptions, CancellationToken, DownloadOptions, newError, PackageFileInfo, UpdateInfo } from "builder-util-runtime"
import { spawn } from "child_process"
import { OutgoingHttpHeaders } from "http"
import * as path from "path"
import "source-map-support/register"
import { BaseUpdater } from "./BaseUpdater"
import { FileWithEmbeddedBlockMapDifferentialDownloader } from "./differentialDownloader/FileWithEmbeddedBlockMapDifferentialDownloader"
import { GenericDifferentialDownloader } from "./differentialDownloader/GenericDifferentialDownloader"
import { newUrlFromBase, ResolvedUpdateFileInfo } from "./main"
import { findFile, Provider } from "./Provider"
import { unlink } from "fs-extra-p"
import { verifySignature } from "./windowsExecutableCodeSignatureVerifier"

export class NsisUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: any) {
    super(options, app)
  }

  /*** @private */
  protected async doDownloadUpdate(updateInfo: UpdateInfo, cancellationToken: CancellationToken): Promise<Array<string>> {
    const provider = await this.provider
    const fileInfo = findFile(provider.resolveFiles(updateInfo), "exe")!!
    const requestHeaders = await this.computeRequestHeaders()
    const downloadOptions: DownloadOptions = {
      skipDirCreation: true,
      headers: requestHeaders,
      cancellationToken,
      sha512: fileInfo.info.sha512,
    }

    return await this.executeDownload({
      fileExtension: "exe",
      downloadOptions,
      fileInfo,
      updateInfo,
      task: async (destinationFile, packageFile, removeTempDirIfAny) => {
        if (await this.differentialDownloadInstaller(fileInfo, destinationFile, requestHeaders, provider)) {
          await this.httpExecutor.download(fileInfo.url.href, destinationFile, downloadOptions)
        }

        const signatureVerificationStatus = await this.verifySignature(destinationFile)
        if (signatureVerificationStatus != null) {
          await removeTempDirIfAny()
          // noinspection ThrowInsideFinallyBlockJS
          throw newError(`New version ${updateInfo!.version} is not signed by the application owner: ${signatureVerificationStatus}`, "ERR_UPDATER_INVALID_SIGNATURE")
        }

        const packageInfo = fileInfo.packageInfo
        if (packageInfo != null && packageFile != null) {
          if (await this.differentialDownloadWebPackage(packageInfo, packageFile, provider)) {
            try {
              await this.httpExecutor.download(packageInfo.path, packageFile, {
                skipDirCreation: true,
                headers: requestHeaders,
                cancellationToken,
                sha512: packageInfo.sha512,
              })
            }
            catch (e) {
              try {
                await unlink(packageFile)
              }
              catch (ignored) {
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
    }
    catch (e) {
      if (e.code === "ENOENT") {
        // no app-update.yml
        return null
      }
      throw e
    }
    return await verifySignature(Array.isArray(publisherName) ? publisherName : [publisherName], tempUpdateFile, this._logger)
  }

  protected doInstall(installerPath: string, isSilent: boolean, isForceRunAfter: boolean): boolean {
    const args = ["--updated"]
    if (isSilent) {
      args.push("/S")
    }

    if (isForceRunAfter) {
      args.push("--force-run")
    }

    const packagePath = this.downloadedUpdateHelper.packageFile
    if (packagePath != null) {
      // only = form is supported
      args.push(`--package-file="${packagePath}"`)
    }

    const spawnOptions = {
      detached: true,
      stdio: "ignore",
    }

    try {
      spawn(installerPath, args, spawnOptions)
        .unref()
    }
    catch (e) {
      // yes, such errors dispatched not as error event
      // https://github.com/electron-userland/electron-builder/issues/1129
      if ((e as any).code === "UNKNOWN" || (e as any).code === "EACCES") { // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
        this._logger.info("Access denied or UNKNOWN error code on spawn, will be executed again using elevate")
        try {
          spawn(path.join(process.resourcesPath!, "elevate.exe"), [installerPath].concat(args), spawnOptions)
            .unref()
        }
        catch (e) {
          this.dispatchError(e)
        }
      }
      else {
        this.dispatchError(e)
      }
    }

    return true
  }

  private async differentialDownloadInstaller(fileInfo: ResolvedUpdateFileInfo, installerPath: string, requestHeaders: OutgoingHttpHeaders, provider: Provider<any>) {
    if (process.env.__NSIS_DIFFERENTIAL_UPDATE__ == null) {
      return true
    }

    try {
      const blockMapData = JSON.parse((await provider.httpRequest(newUrlFromBase(`${fileInfo.url.pathname}.blockMap.json`, fileInfo.url)))!!)
      await new GenericDifferentialDownloader(fileInfo.info, this.httpExecutor, {
        newUrl: fileInfo.url.href,
        oldFile: path.join(this.app.getPath("userData"), "installer.exe"),
        logger: this._logger,
        newFile: installerPath,
        useMultipleRangeRequest: provider.useMultipleRangeRequest,
        requestHeaders,
      })
        .download(blockMapData)
    }
    catch (e) {
      this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
      // during test (developer machine mac) we must throw error
      return process.platform === "win32"
    }

    return false
  }

  private async differentialDownloadWebPackage(packageInfo: PackageFileInfo, packagePath: string, provider: Provider<any>): Promise<boolean> {
    if (packageInfo.blockMapSize == null) {
      return true
    }

    try {
      await new FileWithEmbeddedBlockMapDifferentialDownloader(packageInfo, this.httpExecutor, {
        newUrl: packageInfo.path,
        oldFile: path.join(process.resourcesPath!, "..", "package.7z"),
        logger: this._logger,
        newFile: packagePath,
        requestHeaders: this.requestHeaders,
        useMultipleRangeRequest: provider.useMultipleRangeRequest,
      })
        .download()
    }
    catch (e) {
      this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
      // during test (developer machine mac or linux) we must throw error
      return process.platform === "win32"
    }
    return false
  }
}
