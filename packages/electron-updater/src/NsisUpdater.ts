import { spawn } from "child_process"
import { Platform } from "electron-builder"
import { download, DownloadOptions } from "electron-builder-http"
import { CancellationError, CancellationToken } from "electron-builder-http/out/CancellationToken"
import { PublishConfiguration, VersionInfo } from "electron-builder-http/out/publishOptions"
import { mkdtemp, remove } from "fs-extra-p"
import { tmpdir } from "os"
import * as path from "path"
import "source-map-support/register"
import { AppUpdater } from "./AppUpdater"
import { DOWNLOAD_PROGRESS, FileInfo } from "./main"

export class NsisUpdater extends AppUpdater {
  private setupPath: string | null
  private quitAndInstallCalled = false
  private quitHandlerAdded = false

  constructor(options?: PublishConfiguration, app?: any) {
    super(options, app)
  }

  /**
   * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
   * @returns {Promise<string>} Path to downloaded file.
   */
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
      await download(fileInfo.url, tempFile, downloadOptions)
    }
    catch (e) {
      try {
        await remove(tempDir)
      }
      catch (ignored) {
        // ignored
      }

      if (e instanceof CancellationError) {
        this.emit("update-cancelled", this.versionInfo)
        if (logger != null) {
          logger.info("Cancelled")
        }
      }
      throw e
    }

    let hasValidSignature = await this.spawnVerifySignature(tempFile)
    if (hasValidSignature) {
      if (logger != null) {
        logger.info(`New version ${this.versionInfo!.version} has been downloaded to ${tempFile}`)
      }

      this.setupPath = tempFile
      this.addQuitHandler()
      this.emit("update-downloaded", this.versionInfo)
      return tempFile
    } else {
      if (logger != null) {
        logger.error(`New version ${this.versionInfo!.version} is not signed by the application owner`)
      }
      return await remove(tempDir)
    }
  }

  // $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
  // | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=circuitdev.siemens.com")})
  // | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
  private async spawnVerifySignature(tempUpdateFile: string) : Promise<boolean> {
    const isWin = Platform.WINDOWS === Platform.fromString(process.platform)
    if (!isWin) {
      return Promise.resolve(true)
    }

    var signVerificationOptions = await this.loadUpdateConfig().then(it => {
      return { publisherName: it.publisherName, forceCodeSigningVerification: it.forceCodeSigningVerification }
    })
    var publisherName = (signVerificationOptions && signVerificationOptions.publisherName) || ''
    var forceCodeSigningVerification = (signVerificationOptions && signVerificationOptions.forceCodeSigningVerification)

    if (!forceCodeSigningVerification) {
      return Promise.resolve(true)
    }

    return new Promise<boolean>((resolve) => {
      try {
        const getSignatureCommand = "Get-AuthenticodeSignature '" + tempUpdateFile + "'"
        const commonNameConstraint = "$_.SignerCertificate.Subject.Contains(\"CN=" + publisherName + "\")"
        const statusConstraint = "$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid)"
        const constraintCommand = "where {"+ statusConstraint + " -and "+ commonNameConstraint + "}"
        const verifySignatureCommand = getSignatureCommand + " | " + constraintCommand
        const command = "$certificateInfo = (" + verifySignatureCommand + ") | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }"
        const terminal = "powershell.exe"

        var powershellChild = spawn(terminal, [command])

        powershellChild.on('uncaughtException', (error: string) => {
          if (this.logger) {
            this.logger.error("uncaughtException: " + error);
          }
          resolve(false)
        })

        powershellChild.on('exit', (code) => {
          if (this.logger != null) {
            this.logger.error(`Sign verification finished with code ` + code)
          }
          if (code === 0) {
            resolve(true)
          } else {
            resolve(false)
          }
        })
      } catch (e) {
        if (this.logger != null) {
          this.logger.error("Sign Verification exception: " + e)
        }
        this.dispatchError(e)
      }
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
      if ((<any>e).code === "UNKNOWN") {
        if (this.logger != null) {
          this.logger.info("UNKNOWN error code on spawn, will be executed again using elevate")
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
