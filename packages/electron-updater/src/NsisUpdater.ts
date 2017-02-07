import { spawn } from "child_process"
import * as path from "path"
import { tmpdir } from "os"
import { download, DownloadOptions } from "electron-builder-http"
import { DOWNLOAD_PROGRESS, FileInfo } from "./api"
import { PublishConfiguration, VersionInfo } from "electron-builder-http/out/publishOptions"
import { mkdtemp, remove } from "fs-extra-p"
import "source-map-support/register"
import { AppUpdater } from "./AppUpdater"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"

export class NsisUpdater extends AppUpdater {
  private setupPath: string | null
  private quitAndInstallCalled = false
  private quitHandlerAdded = false

  constructor(options?: PublishConfiguration) {
    super(options)
  }

  /**
   * Start downloading update manually. You can use this method if `autoDownload` option is set to `false`.
   * @returns {Promise<string>} Path to downloaded file.
   */
  protected async doDownloadUpdate(versionInfo: VersionInfo, fileInfo: FileInfo) {
    const downloadOptions: DownloadOptions = {
      skipDirCreation: true,
      headers: this.requestHeaders || undefined,
      cancellationToken: new CancellationToken(),
      sha2: fileInfo == null ? null : fileInfo.sha2,
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

      throw e
    }

    if (logger != null) {
      logger.info(`New version ${this.versionInfo!.version} has been downloaded to ${tempFile}`)
    }

    this.setupPath = tempFile
    this.addQuitHandler()
    this.emit("update-downloaded", this.versionInfo)
    return tempFile
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

  quitAndInstall(): void {
    if (this.install(false)) {
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
          spawn(path.join(process.resourcesPath, "elevate.exe"), [setupPath].concat(args), spawnOptions)
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