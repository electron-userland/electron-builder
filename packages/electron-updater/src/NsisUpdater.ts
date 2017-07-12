import BluebirdPromise from "bluebird-lst"
import { execFile, execFileSync, spawn } from "child_process"
import { CancellationError, CancellationToken, DownloadOptions } from "electron-builder-http"
import { PublishConfiguration } from "electron-builder-http/out/publishOptions"
import { parseDn } from "electron-builder-http/out/rfc2253Parser"
import { VersionInfo } from "electron-builder-http/out/updateInfo"
import { mkdtemp, remove } from "fs-extra-p"
import { tmpdir } from "os"
import * as path from "path"
import "source-map-support/register"
import { AppUpdater } from "./AppUpdater"
import { DownloadedUpdateHelper } from "./DownloadedUpdateHelper"
import { DOWNLOAD_PROGRESS, FileInfo, UPDATE_DOWNLOADED } from "./main"

export class NsisUpdater extends AppUpdater {
  private readonly downloadedUpdateHelper = new DownloadedUpdateHelper()

  private quitAndInstallCalled = false
  private quitHandlerAdded = false

  constructor(options?: PublishConfiguration, app?: any) {
    super(options, app)
  }

  /*** @private */
  protected async doDownloadUpdate(versionInfo: VersionInfo, fileInfo: FileInfo, cancellationToken: CancellationToken) {
    const downloadOptions: DownloadOptions = {
      skipDirCreation: true,
      headers: this.computeRequestHeaders(fileInfo),
      cancellationToken,
      sha2: fileInfo == null ? null : fileInfo.sha2,
      sha512: fileInfo == null ? null : fileInfo.sha512,
    }

    const downloadedFile = this.downloadedUpdateHelper.getDownloadedFile(versionInfo, fileInfo)
    if (downloadedFile != null) {
      return downloadedFile
    }

    if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
      downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
    }

    const tempDir = await mkdtemp(`${path.join(tmpdir(), "up")}-`)
    const tempFile = path.join(tempDir, fileInfo.name)

    const removeTempDirIfAny = () => {
      this.downloadedUpdateHelper.clear()
      return remove(tempDir)
        .catch(error => {
          // ignored
        })
    }

    let signatureVerificationStatus
    try {
      await this.httpExecutor.download(fileInfo.url, tempFile, downloadOptions)
      signatureVerificationStatus = await this.verifySignature(tempFile)
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

    this._logger.info(`New version ${this.versionInfo!.version} has been downloaded to ${tempFile}`)
    this.downloadedUpdateHelper.setDownloadedFile(tempFile, versionInfo, fileInfo)
    this.addQuitHandler()
    this.emit(UPDATE_DOWNLOADED, this.versionInfo)
    return tempFile
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

    return await new BluebirdPromise<string | null>((resolve, reject) => {
      execFile("powershell.exe", [`Get-AuthenticodeSignature '${tempUpdateFile}' | ConvertTo-Json -Compress`], {maxBuffer: 4 * 1024000, timeout: 60 * 1000}, (error, stdout, stderr) => {
        if (error != null || stderr) {
          try {
            execFileSync("powershell.exe", ["ConvertTo-Json test"], {timeout: 10 * 1000})
          }
          catch (testError) {
            this._logger.warn(`Cannot execute ConvertTo-Json: ${testError.message}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`)
            resolve(null)
            return
          }

          if (error != null) {
            reject(error)
            return
          }

          if (stderr) {
            reject(new Error(`Cannot execute Get-AuthenticodeSignature: ${stderr}`))
            return
          }
        }

        const data = JSON.parse(stdout)
        delete data.PrivateKey
        delete data.IsOSBinary
        delete data.SignatureType
        const signerCertificate = data.SignerCertificate
        if (signerCertificate != null) {
          delete signerCertificate.Archived
          delete signerCertificate.Extensions
          delete signerCertificate.Handle
          delete signerCertificate.HasPrivateKey
          // duplicates data.SignerCertificate (contains RawData)
          delete signerCertificate.SubjectName
        }
        delete data.Path

        if (data.Status === 0) {
          const name = parseDn(data.SignerCertificate.Subject).get("CN")!
          if ((Array.isArray(publisherName) ? publisherName : [publisherName]).includes(name)) {
            resolve(null)
            return
          }
        }

        const result = JSON.stringify(data, (name, value) => name === "RawData" ? undefined : value, 2)
        this._logger.info(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
        resolve(result)
      })
    })
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

    const setupPath = this.downloadedUpdateHelper.file
    if (!this.updateAvailable || setupPath == null) {
      const message = "No update available, can't quit and install"
      this.emit("error", new Error(message), message)
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

    const spawnOptions = {
      detached: true,
      stdio: "ignore",
    }

    try {
      spawn(setupPath, args, spawnOptions)
        .unref()
    }
    catch (e) {
      // yes, such errors dispatched not as error event
      // https://github.com/electron-userland/electron-builder/issues/1129
      if ((e as any).code === "UNKNOWN" || (e as any).code === "EACCES") { // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
        this._logger.info("Access denied or UNKNOWN error code on spawn, will be executed again using elevate")
        try {
          spawn(path.join(process.resourcesPath!, "elevate.exe"), [setupPath].concat(args), spawnOptions)
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