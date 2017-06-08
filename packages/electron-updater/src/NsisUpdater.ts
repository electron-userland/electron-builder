import BluebirdPromise from "bluebird-lst"
import { execFile, spawn } from "child_process"
import { DownloadOptions } from "electron-builder-http"
import { CancellationError, CancellationToken } from "electron-builder-http/out/CancellationToken"
import { PublishConfiguration, VersionInfo } from "electron-builder-http/out/publishOptions"
import { mkdtemp, remove } from "fs-extra-p"
import { tmpdir } from "os"
import * as path from "path"
import "source-map-support/register"
import { AppUpdater } from "./AppUpdater"
import { DOWNLOAD_PROGRESS, FileInfo, UPDATE_DOWNLOADED } from "./main"

export class NsisUpdater extends AppUpdater {
  private setupPath: string | null
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
      cancellationToken: cancellationToken,
      sha2: fileInfo == null ? null : fileInfo.sha2,
      sha512: fileInfo == null ? null : fileInfo.sha512,
    }

    if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
      downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
    }

    const logger = this.logger
    const tempDir = await mkdtemp(`${path.join(tmpdir(), "up")}-`)
    const tempFile = path.join(tempDir, fileInfo.name)
    try {
      await this.httpExecutor.download(fileInfo.url, tempFile, downloadOptions)
    }
    catch (e) {
      try {
        await remove(tempDir)
      }
      catch (ignored) {
      }

      if (e instanceof CancellationError) {
        this.emit("update-cancelled", this.versionInfo)
        if (logger != null) {
          logger.info("Cancelled")
        }
      }
      throw e
    }

    const signatureVerificationStatus = await this.verifySignature(tempFile)
    if (signatureVerificationStatus != null) {
      try {
        await remove(tempDir)
      }
      finally {
        // noinspection ThrowInsideFinallyBlockJS
        throw new Error(`New version ${this.versionInfo!.version} is not signed by the application owner: ${signatureVerificationStatus}`)
      }
    }

    if (logger != null) {
      logger.info(`New version ${this.versionInfo!.version} has been downloaded to ${tempFile}`)
    }

    this.setupPath = tempFile
    this.addQuitHandler()
    this.emit(UPDATE_DOWNLOADED, this.versionInfo)
    return tempFile
  }

  // $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
  // | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
  // | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
  private async verifySignature(tempUpdateFile: string): Promise<string | null> {
    const updateConfig = await this.loadUpdateConfig()
    const publisherName = updateConfig.publisherName
    if (publisherName == null) {
      return null
    }

    return await new BluebirdPromise<string | null>((resolve, reject) => {
      const commonNameConstraint = (Array.isArray(publisherName) ? <Array<string>>publisherName : [publisherName]).map(it => `$_.SignerCertificate.Subject.Contains('CN=${it},')`).join(" -or ")
      const constraintCommand = `where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and (${commonNameConstraint})}`
      const verifySignatureCommand = `Get-AuthenticodeSignature '${tempUpdateFile}' | ${constraintCommand}`
      const powershellChild = spawn("powershell.exe", [(`$certificateInfo = (${verifySignatureCommand}) | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }`)])
      powershellChild.on("error", reject)
      powershellChild.on("exit", code => {
        if (code !== 1) {
          resolve(null)
          return
        }

        execFile("powershell.exe", [`Get-AuthenticodeSignature '${tempUpdateFile}' | ConvertTo-Json -Compress`], {maxBuffer: 4 * 1024000}, (error, stdout, stderr) => {
          if (error != null) {
            reject(error)
            return
          }

          if (stderr) {
            reject(new Error(`Cannot execute Get-AuthenticodeSignature: ${stderr}`))
            return
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
          }
          delete data.Path

          const result = JSON.stringify(data, (name, value) => name === "RawData" ? undefined : value, 2)
          if (this.logger != null) {
            this.logger.info(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
          }
          resolve(result)
        })
      })
    })
  }

  private addQuitHandler() {
    if (this.quitHandlerAdded) {
      return
    }

    this.quitHandlerAdded = true

    this.app.on("quit", () => {
      if (this.logger != null) {
        this.logger.info("Auto install update on quit")
      }
      this.install(true)
    })
  }

  quitAndInstall(isSilent: boolean = false): void {
    if (this.install(isSilent)) {
      this.app.quit()
    }
  }

  private install(isSilent: boolean): boolean {
    if (this.quitAndInstallCalled) {
      return false
    }

    const setupPath = this.setupPath
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
      if ((<any>e).code === "UNKNOWN" || (<any>e).code === "EACCES") { // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
        if (this.logger != null) {
          this.logger.info("Access denied or UNKNOWN error code on spawn, will be executed again using elevate")
        }

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