import { AllPublishOptions } from "builder-util-runtime"
import { AppUpdater, DownloadExecutorTask } from "./AppUpdater"

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
      })
    }
    else {
      this.quitAndInstallCalled = false
    }
  }

  protected executeDownload(taskOptions: DownloadExecutorTask): Promise<Array<string>> {
    return super.executeDownload({
      ...taskOptions,
      done: async event => {
        this.dispatchUpdateDownloaded(event)
        this.addQuitHandler()
      }
    })
  }

  protected abstract doInstall(installerPath: string, isSilent: boolean, isRunAfter: boolean): Promise<boolean>

  protected async install(isSilent: boolean, isRunAfter: boolean): Promise<boolean> {
    if (this.quitAndInstallCalled) {
      this._logger.warn("install call ignored: quitAndInstallCalled is set to true")
      return false
    }

    const installerPath = this.downloadedUpdateHelper.file
    if (installerPath == null) {
      this.dispatchError(new Error("No valid update available, can't quit and install"))
      return false
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

    try {
      this._logger.info(`Install: isSilent: ${isSilent}, isRunAfter: ${isRunAfter}`)
      return await this.doInstall(installerPath, isSilent, isRunAfter)
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
      else {
        this._logger.info("Update installer has already been triggered. Quitting application.")
      }
    })
  }
}