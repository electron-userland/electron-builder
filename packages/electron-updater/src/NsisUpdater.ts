import { CancellationToken, DownloadOptions, AllPublishOptions, UpdateInfo } from "builder-util-runtime"
import { BLOCK_MAP_FILE_NAME } from "builder-util-runtime/out/blockMapApi"
import { spawn } from "child_process"
import * as path from "path"
import "source-map-support/register"
import { SevenZipDifferentialDownloader } from "./differentialPackage"
import { FileInfo, UPDATE_DOWNLOADED } from "./main"
import { verifySignature } from "./windowsExecutableCodeSignatureVerifier"
import { BaseUpdater } from "./BaseUpdater"

export class NsisUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: any) {
    super(options, app)
  }

  /*** @private */
  protected async doDownloadUpdate(versionInfo: UpdateInfo, fileInfo: FileInfo, cancellationToken: CancellationToken): Promise<Array<string>> {
    const downloadOptions: DownloadOptions = {
      skipDirCreation: true,
      headers: this.computeRequestHeaders(fileInfo),
      cancellationToken,
      sha512: fileInfo == null ? null : fileInfo.sha512,
    }

    let packagePath: string | null = this.downloadedUpdateHelper.packagePath

    let installerPath = this.downloadedUpdateHelper.getDownloadedFile(versionInfo, fileInfo)
    if (installerPath != null) {
      return packagePath == null ? [installerPath] : [installerPath, packagePath]
    }

    await this.executeDownload(downloadOptions, fileInfo, async (tempDir, destinationFile, removeTempDirIfAny) => {
      installerPath = destinationFile
      let signatureVerificationStatus
      await this.httpExecutor.download(fileInfo.url, installerPath, downloadOptions)
      signatureVerificationStatus = await this.verifySignature(installerPath)

      const packageInfo = fileInfo.packageInfo
      if (packageInfo != null) {
        packagePath = path.join(tempDir, `package-${versionInfo.version}${path.extname(packageInfo.path) || ".7z"}`)

        let isDownloadFull = packageInfo.blockMapSize == null || packageInfo.headerSize == null
        if (!isDownloadFull) {
          try {
            await new SevenZipDifferentialDownloader(packageInfo, this.httpExecutor, {
              newUrl: packageInfo.path,
              oldPackageFile: path.join(process.resourcesPath!, "..", "package.7z"),
              logger: this._logger,
              newFile: packagePath,
              requestHeaders: this.requestHeaders,
            }).downloadNsisPackage(path.join(process.resourcesPath!, "..", BLOCK_MAP_FILE_NAME))
          }
          catch (e) {
            this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
            // during test (developer machine mac or linux) we must throw error
            isDownloadFull = process.platform === "win32"
          }
        }

        if (isDownloadFull) {
          await this.httpExecutor.download(packageInfo.path, packagePath!!, {
            skipDirCreation: true,
            headers: this.computeRequestHeaders(fileInfo),
            cancellationToken,
            sha512: packageInfo.sha512,
          })
        }
      }

      if (signatureVerificationStatus != null) {
        await removeTempDirIfAny()
        // noinspection ThrowInsideFinallyBlockJS
        throw new Error(`New version ${this.versionInfo!.version} is not signed by the application owner: ${signatureVerificationStatus}`)
      }
    })

    this.downloadedUpdateHelper.setDownloadedFile(installerPath!!, packagePath, versionInfo, fileInfo)
    this.addQuitHandler()
    this.emit(UPDATE_DOWNLOADED, this.versionInfo)
    return packagePath == null ? [installerPath!!] : [installerPath!!, packagePath]
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

    const packagePath = this.downloadedUpdateHelper.packagePath
    if (packagePath != null) {
      // only = form is supported
      args.push(`--package-file=${packagePath}`)
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
}