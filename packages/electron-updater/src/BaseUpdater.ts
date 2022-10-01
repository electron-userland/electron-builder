import { AllPublishOptions } from "builder-util-runtime"
import { spawn, spawnSync } from "child_process"
import { AppAdapter } from "./AppAdapter"
import { AppUpdater, DownloadExecutorTask } from "./AppUpdater"

export abstract class BaseUpdater extends AppUpdater {
  protected quitAndInstallCalled = false
  private quitHandlerAdded = false

  protected constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  quitAndInstall(isSilent = false, isForceRunAfter = false): void {
    this._logger.info(`Install on explicit quitAndInstall`)
    // If NOT in silent mode use `autoRunAppAfterInstall` to determine whether to force run the app
    const isInstalled = this.install(isSilent, isSilent ? isForceRunAfter : this.autoRunAppAfterInstall)
    if (isInstalled) {
      setImmediate(() => {
        // this event is normally emitted when calling quitAndInstall, this emulates that
        require("electron").autoUpdater.emit("before-quit-for-update")
        this.app.quit()
      })
    } else {
      this.quitAndInstallCalled = false
    }
  }

  protected executeDownload(taskOptions: DownloadExecutorTask): Promise<Array<string>> {
    return super.executeDownload({
      ...taskOptions,
      done: event => {
        this.dispatchUpdateDownloaded(event)
        this.addQuitHandler()
        return Promise.resolve()
      },
    })
  }

  // must be sync
  protected abstract doInstall(options: InstallOptions): boolean

  // must be sync (because quit even handler is not async)
  protected install(isSilent: boolean, isForceRunAfter: boolean): boolean {
    if (this.quitAndInstallCalled) {
      this._logger.warn("install call ignored: quitAndInstallCalled is set to true")
      return false
    }

    const downloadedUpdateHelper = this.downloadedUpdateHelper
    const installerPath = downloadedUpdateHelper == null ? null : downloadedUpdateHelper.file
    const downloadedFileInfo = downloadedUpdateHelper == null ? null : downloadedUpdateHelper.downloadedFileInfo
    if (installerPath == null || downloadedFileInfo == null) {
      this.dispatchError(new Error("No valid update available, can't quit and install"))
      return false
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

    try {
      this._logger.info(`Install: isSilent: ${isSilent}, isForceRunAfter: ${isForceRunAfter}`)
      return this.doInstall({
        installerPath,
        isSilent,
        isForceRunAfter,
        isAdminRightsRequired: downloadedFileInfo.isAdminRightsRequired,
      })
    } catch (e: any) {
      this.dispatchError(e)
      return false
    }
  }

  protected addQuitHandler(): void {
    if (this.quitHandlerAdded || !this.autoInstallOnAppQuit) {
      return
    }

    this.quitHandlerAdded = true

    this.app.onQuit(exitCode => {
      if (this.quitAndInstallCalled) {
        this._logger.info("Update installer has already been triggered. Quitting application.")
        return
      }

      if (!this.autoInstallOnAppQuit) {
        this._logger.info("Update will not be installed on quit because autoInstallOnAppQuit is set to false.")
        return
      }

      if (exitCode !== 0) {
        this._logger.info(`Update will be not installed on quit because application is quitting with exit code ${exitCode}`)
        return
      }

      this._logger.info("Auto install update on quit")
      this.install(true, false)
    })
  }

  protected wrapSudo() {
    const { name } = this.app
    const installComment = `"${name} would like to update"`
    const sudo = this.spawnSyncLog("which gksudo || which kdesudo || which pkexec || which beesu")
    const command = [sudo]
    if (/kdesudo/i.test(sudo)) {
      command.push("--comment", installComment)
      command.push("-c")
    } else if (/gksudo/i.test(sudo)) {
      command.push("--message", installComment)
    } else if (/pkexec/i.test(sudo)) {
      command.push("--disable-internal-agent")
    }
    return command.join(" ")
  }

  protected spawnSyncLog(cmd: string, args: string[] = [], env = {}): string {
    this._logger.info(`Executing: ${cmd} with args: ${args}`)
    const response = spawnSync(cmd, args, {
      stdio: "pipe",
      env: { ...process.env, ...env },
      encoding: "utf-8",
      shell: true,
    })
    return response.stdout.trim()
  }

  /**
   * This handles both node 8 and node 10 way of emitting error when spawning a process
   *   - node 8: Throws the error
   *   - node 10: Emit the error(Need to listen with on)
   */
  // https://github.com/electron-userland/electron-builder/issues/1129
  // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
  protected async spawnLog(cmd: string, args: string[] = [], env: any = {}): Promise<boolean> {
    this._logger.info(`Executing: ${cmd} with args: ${args}`)
    return new Promise<boolean>((resolve, reject) => {
      try {
        const p = spawn(cmd, args, {
          stdio: "pipe",
          env: { ...process.env, ...env },
          detached: true,
        })
        p.on("error", error => {
          reject(error)
        })
        p.unref()
        resolve(p.pid !== undefined)
      } catch (error) {
        reject(error)
      }
    })
  }
}

export interface InstallOptions {
  readonly installerPath: string
  readonly isSilent: boolean
  readonly isForceRunAfter: boolean
  readonly isAdminRightsRequired: boolean
}
