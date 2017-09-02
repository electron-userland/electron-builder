import { spawn } from "child_process"
import { CancellationError, CancellationToken, DownloadOptions } from "electron-builder-http"
import { GenericServerOptions, PublishConfiguration } from "electron-builder-http/out/publishOptions"
import { VersionInfo } from "electron-builder-http/out/updateInfo"
import { mkdtemp, remove } from "fs-extra-p"
import { tmpdir } from "os"
import * as path from "path"
import "source-map-support/register"
import { AppUpdater } from "./AppUpdater"
import { DifferentialDownloader } from "./differentialPackage"
import { DownloadedUpdateHelper } from "./DownloadedUpdateHelper"
import { DOWNLOAD_PROGRESS, FileInfo, UPDATE_DOWNLOADED } from "./main"
import { verifySignature } from "./windowsExecutableCodeSignatureVerifier"

export class NsisUpdater extends AppUpdater {
  private readonly downloadedUpdateHelper = new DownloadedUpdateHelper()

  private quitAndInstallCalled = false
  private quitHandlerAdded = false

  constructor(options?: PublishConfiguration | GenericServerOptions | null, app?: any) {
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

    let packagePath: string | null = this.downloadedUpdateHelper.packagePath

    let installerPath = this.downloadedUpdateHelper.getDownloadedFile(versionInfo, fileInfo)
    if (installerPath != null) {
      return packagePath == null ? [installerPath] : [installerPath, packagePath]
    }

    if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
      downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
    }

    // use TEST_APP_TMP_DIR if defined and developer machine (must be not windows due to security reasons - we must not use env var in the production)
    const tempDir = await mkdtemp(`${path.join((process.platform === "darwin" ? process.env.TEST_APP_TMP_DIR : null) || tmpdir(), "up")}-`)
    installerPath = path.join(tempDir, fileInfo.name)

    const removeTempDirIfAny = () => {
      this.downloadedUpdateHelper.clear()
      return remove(tempDir)
        .catch(() => {
          // ignored
        })
    }

    let signatureVerificationStatus
    try {
      await this.httpExecutor.download(fileInfo.url, installerPath, downloadOptions)
      signatureVerificationStatus = await this.verifySignature(installerPath)

      const packageInfo = fileInfo.packageInfo
      if (packageInfo != null) {
        packagePath = path.join(tempDir, `${fileInfo.name}-package${path.extname(packageInfo.file) || ".zip"}`)
        try {
          await new DifferentialDownloader(packageInfo, this.httpExecutor, this.requestHeaders, path.join(process.resourcesPath!, "..", "package.zip"), this._logger, packagePath).download()
        }
        catch (e) {
          this._logger.error(`Cannot download differentially, fallback to full download: ${e.stack || e}`)
          await this.httpExecutor.download(packageInfo.file, packagePath, {
            skipDirCreation: true,
            headers: this.computeRequestHeaders(fileInfo),
            cancellationToken,
            sha512: packageInfo.sha512,
          })
        }
      }
    }
    catch (e) {
      await removeTempDirIfAny()

      if (e instanceof CancellationError) {
        this.emit("update-cancelled", this.versionInfo)
        this._logger.info("Cancelled")
      }
      throw e
    }

    if (signatureVerificationStatus != null) {
      await removeTempDirIfAny()
      // noinspection ThrowInsideFinallyBlockJS
      throw new Error(`New version ${this.versionInfo!.version} is not signed by the application owner: ${signatureVerificationStatus}`)
    }

    this._logger.info(`New version ${this.versionInfo!.version} has been downloaded to ${installerPath}`)
    this.downloadedUpdateHelper.setDownloadedFile(installerPath, packagePath, versionInfo, fileInfo)
    this.addQuitHandler()
    this.emit(UPDATE_DOWNLOADED, this.versionInfo)
    return packagePath == null ? [installerPath] : [installerPath, packagePath]
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

  private addQuitHandler() {
    if (this.quitHandlerAdded) {
      return
    }

    this.quitHandlerAdded = true

    this.app.on("quit", () => {
      this._logger.info("Auto install update on quit")
      this.install(true, false)
    })
  }

  quitAndInstall(isSilent: boolean = false, isForceRunAfter: boolean = false): void {
    if (this.install(isSilent, isForceRunAfter)) {
      this.app.quit()
    }
  }

  private install(isSilent: boolean, isForceRunAfter: boolean): boolean {
    if (this.quitAndInstallCalled) {
      return false
    }

    const installerPath = this.downloadedUpdateHelper.file
    if (!this.updateAvailable || installerPath == null) {
      this.dispatchError(new Error("No update available, can't quit and install"))
      return false
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

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