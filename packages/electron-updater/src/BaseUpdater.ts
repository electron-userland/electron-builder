import { AllPublishOptions, CancellationError, DownloadOptions } from "builder-util-runtime"
import { mkdtemp, remove } from "fs-extra-p"
import { tmpdir } from "os"
import * as path from "path"
import { AppUpdater } from "./AppUpdater"
import { DOWNLOAD_PROGRESS, ResolvedUpdateFileInfo } from "./main"

export abstract class BaseUpdater extends AppUpdater {
  protected quitAndInstallCalled = false
  private quitHandlerAdded = false

  protected constructor(options?: AllPublishOptions | null, app?: any) {
    super(options, app)
  }

  async quitAndInstall(isSilent: boolean = false, isForceRunAfter: boolean = false): Promise<void> {
    this._logger.info(`Install on explicit quitAndInstall`)
    const isInstalled = await this.install(isSilent, isSilent ? isForceRunAfter : true)
    if (isInstalled) {
      setImmediate(() => {
        if (this.app.quit !== undefined) {
          this.app.quit()
        }
        this.quitAndInstallCalled = false
      })
    }
  }

  protected async executeDownload(downloadOptions: DownloadOptions, fileInfo: ResolvedUpdateFileInfo, task: (tempDir: string, destinationFile: string, removeTempDirIfAny: () => Promise<any>) => Promise<any>) {
    if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
      downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
    }

    // use TEST_APP_TMP_DIR if defined and developer machine (must be not windows due to security reasons - we must not use env var in the production)
    const tempDir = await mkdtemp(`${path.join((process.platform === "darwin" ? process.env.TEST_APP_TMP_DIR : null) || tmpdir(), "up")}-`)

    const removeTempDirIfAny = () => {
      this.downloadedUpdateHelper.clear()
      return remove(tempDir)
        .catch(() => {
          // ignored
        })
    }

    try {
      const destinationFile = path.join(tempDir, path.posix.basename(fileInfo.info.url))
      await task(tempDir, destinationFile, removeTempDirIfAny)

      this._logger.info(`New version ${this.updateInfo!.version} has been downloaded to ${destinationFile}`)
    }
    catch (e) {
      await removeTempDirIfAny()

      if (e instanceof CancellationError) {
        this.emit("update-cancelled", this.updateInfo)
        this._logger.info("Cancelled")
      }
      throw e
    }
  }

  protected abstract doInstall(installerPath: string, isSilent: boolean, isRunAfter: boolean): boolean

  protected async install(isSilent: boolean, isRunAfter: boolean): Promise<boolean> {
    if (this.quitAndInstallCalled) {
      this._logger.warn("install call ignored: quitAndInstallCalled is set to true")
      return false
    }

    const installerPath = this.downloadedUpdateHelper.file
    const isValid = await this.isUpdaterValid(installerPath)
    if (installerPath == null || !isValid) {
      this.dispatchError(new Error("No valid update available, can't quit and install"))
      return false
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

    try {
      this._logger.info(`Install: isSilent: ${isSilent}, isRunAfter: ${isRunAfter}`)
      return this.doInstall(installerPath, isSilent, isRunAfter)
    }
    catch (e) {
      this.dispatchError(e)
      return false
    }
  }

  protected addQuitHandler() {
    if (this.quitHandlerAdded || !this.autoInstallOnAppQuit) {
      return
    }

    this.quitHandlerAdded = true

    this.app.once("quit", async () => {
      if (!this.quitAndInstallCalled) {
        this._logger.info("Auto install update on quit")
        await this.install(true, false)
      }
    })
  }
}