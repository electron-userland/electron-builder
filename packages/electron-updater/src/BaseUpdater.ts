import { UpdateInfo, AllPublishOptions, CancellationError, DownloadOptions } from "builder-util-runtime"
import { ensureDir, rename, unlink } from "fs-extra-p"
import * as path from "path"
import { AppUpdater } from "./AppUpdater"
import { DOWNLOAD_PROGRESS, ResolvedUpdateFileInfo, UPDATE_DOWNLOADED } from "./main"

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

  protected async executeDownload(taskOptions: DownloadExecutorTask): Promise<Array<string>> {
    if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
      taskOptions.downloadOptions.onProgress = it => this.emit(DOWNLOAD_PROGRESS, it)
    }

    const updateInfo = taskOptions.updateInfo
    const version = updateInfo.version
    const fileInfo = taskOptions.fileInfo
    const packageInfo = fileInfo.packageInfo

    const cacheDir = this.downloadedUpdateHelper.cacheDir
    await ensureDir(cacheDir)
    const updateFileName = `installer-${version}.${taskOptions.fileExtension}`
    const updateFile = path.join(cacheDir, updateFileName)
    const packageFile = packageInfo == null ? null : path.join(cacheDir, `package-${version}.${path.extname(packageInfo.path) || "7z"}`)

    const done = () => {
      this.downloadedUpdateHelper.setDownloadedFile(updateFile, packageFile, updateInfo, fileInfo)
      this.addQuitHandler()
      this.emit(UPDATE_DOWNLOADED, updateInfo)
      return packageFile == null ? [updateFile] : [updateFile, packageFile]
    }

    const log = this._logger
    if (await this.downloadedUpdateHelper.validateDownloadedPath(updateFile, updateInfo, fileInfo, log)) {
      return done()
    }

    const removeFileIfAny = () => {
      this.downloadedUpdateHelper.clear()
      return unlink(updateFile)
        .catch(() => {
          // ignored
        })
    }

    // https://github.com/electron-userland/electron-builder/pull/2474#issuecomment-366481912
    let nameCounter = 0
    let tempUpdateFile = path.join(cacheDir, `temp-${updateFileName}`)
    for (let i = 0; i < 3; i++) {
      try {
        await unlink(tempUpdateFile)
      }
      catch (e) {
        if (e.code === "ENOENT") {
          break
        }

        log.warn(`Error on remove temp update file: ${e}`)
        tempUpdateFile = path.join(cacheDir, `temp-${nameCounter++}-${updateFileName}`)
      }
    }

    try {
      await taskOptions.task(tempUpdateFile, packageFile, removeFileIfAny)
      await rename(tempUpdateFile, updateFile)
    }
    catch (e) {
      await removeFileIfAny()

      if (e instanceof CancellationError) {
        log.info("Cancelled")
        this.emit("update-cancelled", updateInfo)
      }
      throw e
    }

    log.info(`New version ${version} has been downloaded to ${updateFile}`)
    return done()
  }

  protected abstract doInstall(installerPath: string, isSilent: boolean, isRunAfter: boolean): boolean

  protected async install(isSilent: boolean, isRunAfter: boolean): Promise<boolean> {
    if (this.quitAndInstallCalled) {
      this._logger.warn("install call ignored: quitAndInstallCalled is set to true")
      return false
    }

    const installerPath = this.downloadedUpdateHelper.file
    // todo check (for now it is ok to no check as before, cached (from previous launch) update file checked in any case)
    // const isValid = await this.isUpdateValid(installerPath)
    if (installerPath == null) {
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

export interface DownloadExecutorTask {
  readonly fileExtension: string
  readonly downloadOptions: DownloadOptions
  readonly fileInfo: ResolvedUpdateFileInfo
  readonly updateInfo: UpdateInfo
  readonly task: (destinationFile: string, packageFile: string | null, removeTempDirIfAny: () => Promise<any>) => Promise<any>
}