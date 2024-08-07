import { AllPublishOptions } from "builder-util-runtime"
import { spawn, SpawnOptions, spawnSync, StdioOptions } from "child_process"
import { AppAdapter } from "./AppAdapter"
import { AppUpdater, DownloadExecutorTask } from "./AppUpdater"

export abstract class BaseUpdater extends AppUpdater {
  protected quitAndInstallCalled = false
  private quitHandlerAdded = false

  protected constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  async quitAndInstall(isSilent = false, isForceRunAfter = false): Promise<void> {
    this._logger.info(`Install on explicit quitAndInstall`)
    // If NOT in silent mode use `autoRunAppAfterInstall` to determine whether to force run the app
    const isInstalled = await this.install(isSilent, isSilent ? isForceRunAfter : this.autoRunAppAfterInstall)
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
  protected abstract doInstall(options: InstallOptions): Promise<boolean>

  // must be sync (because quit even handler is not async)
  async install(isSilent = false, isForceRunAfter = false): Promise<boolean> {
    if (this.quitAndInstallCalled) {
      this._logger.warn("install call ignored: quitAndInstallCalled is set to true")
      return false
    }

    const downloadedUpdateHelper = this.downloadedUpdateHelper

    // Get the installer path, ensuring spaces are escaped on Linux
    // 1. Check if downloadedUpdateHelper is not null
    // 2. Check if downloadedUpdateHelper.file is not null
    // 3. If both checks pass:
    //    a. If the platform is Linux, replace spaces with '\ ' for shell compatibility
    //    b. If the platform is not Linux, use the original path
    // 4. If any check fails, set installerPath to null
    const installerPath =
      downloadedUpdateHelper && downloadedUpdateHelper.file
      ? (process.platform === 'linux'
        ? downloadedUpdateHelper.file.replace(/ /g, '\\ ')
        : downloadedUpdateHelper.file)
      : null;

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

    this.app.onQuit(async () => {
      if (this.quitAndInstallCalled) {
        this._logger.info("Update installer has already been triggered. Quitting application.")
        return
      }

      if (!this.autoInstallOnAppQuit) {
        this._logger.info("Update will not be installed on quit because autoInstallOnAppQuit is set to false.")
        return
      }

      this._logger.info("Auto install update on quit")
      await this.install(true, false)
    })
  }

  protected async wrapSudo() {
    const { name } = this.app
    const installComment = `"${name} would like to update"`
    const sudo = (await this.spawnLogAsync("which gksudo || which kdesudo || which pkexec || which beesu")).stdout
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

  protected async spawnLogAsync(
    cmd: string,
    args: string[] = [],
    env: any = undefined,
    stdio: StdioOptions = ["pipe", "pipe", "pipe"]
  ): Promise<{ stdout: string; stderr: string; success: boolean }> {
    this._logger.info(`Executing: ${cmd} with args: ${args.join(" ")}`)

    try {
      const params: SpawnOptions = {
        stdio, // Capture stdout and stderr
        env: { ...process.env, ...env },
        shell: true,
        detached: true,
      }

      const p = spawn(cmd, args, params)

      let stdout = ""
      let stderr = ""

      if (p.stdout) {
        p.stdout.on("data", data => {
          stdout += data.toString()
        })
      }

      if (p.stderr) {
        p.stderr.on("data", data => {
          stderr += data.toString()
        })
      }

      return await new Promise<{ stdout: string; stderr: string; success: boolean }>((resolve, reject) => {
        p.on("error", (error: unknown) => {
          let errorMessage = "Unknown error"
          if (error instanceof Error) {
            errorMessage = error.message
          }
          reject({ stdout: "", stderr: errorMessage, success: false })
        })
        p.on("spawn", () => {
          this._logger.info(`Command spawned successfully`)
        })
        p.on("close", code => {
          if (code === 0) {
            resolve({ stdout: stdout.trim(), stderr: stderr.trim(), success: true })
          } else {
            this._logger.error(`Process exited with code: ${code}, stderr: ${stderr.trim()}`)
            resolve({ stdout: stdout.trim(), stderr: stderr.trim(), success: false })
          }
        })

        p.unref()
      })
    } catch (error: unknown) {
      let errorMessage = "Unknown error"
      if (error instanceof Error) {
        errorMessage = error.message
      }
      this._logger.error(`Error executing ${cmd}: ${errorMessage}`)
      return { stdout: "", stderr: errorMessage, success: false }
    }
  }
}

export interface InstallOptions {
  readonly installerPath: string
  readonly isSilent: boolean
  readonly isForceRunAfter: boolean
  readonly isAdminRightsRequired: boolean
}
