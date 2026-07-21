import { createRequire } from "node:module"
import { AllPublishOptions, newError } from "builder-util-runtime"
import { spawn, SpawnOptions, spawnSync, StdioOptions } from "child_process"
import * as path from "path"
import { eq as isVersionsEqual, gt as isVersionGreaterThan, parse as parseVersion } from "semver"
import { AppAdapter } from "./AppAdapter.js"
import { AppUpdater, DownloadExecutorTask } from "./AppUpdater.js"
import { QuitAndInstallOptions } from "./types.js"

const require = createRequire(import.meta.url)

export abstract class BaseUpdater extends AppUpdater {
  protected quitAndInstallCalled = false
  private quitHandlerAdded = false
  private sessionEndHandlerAdded = false
  private isSessionEnding = false

  protected constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
    void this.app.whenReady().then(() => {
      if (this.autoInstallOnNextLaunch) {
        return this.installPendingUpdate(true).catch((e: any) => this._logger.warn(`Cannot install pending update on launch: ${e.message || e}`))
      }
      return Promise.resolve(false)
    })
  }

  quitAndInstall(options: QuitAndInstallOptions = {}): void {
    const { isSilent = false, isForceRunAfter = false, waitUntilNextLaunch = false } = options
    if (waitUntilNextLaunch) {
      this._logger.info(`Deferring install to next launch on explicit quitAndInstall (waitUntilNextLaunch)`)
      if (this.markPendingInstallOnNextLaunch()) {
        this.quitAndInstallCalled = true
        setImmediate(() => this.app.quit())
      }
      return
    }
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

  installPendingUpdateIfAvailable(): Promise<boolean> {
    return this.installPendingUpdate(false)
  }

  /**
   * Whether this target supports the automatic `autoInstallOnNextLaunch` install at startup. Targets whose install
   * always requires elevation (deb/rpm/pacman via pkexec/sudo) must not show an authentication prompt at app launch,
   * so they keep the pending update for an explicit `installPendingUpdateIfAvailable()` call instead.
   */
  protected get isAutoInstallOnNextLaunchSupported(): boolean {
    return false
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

  protected get installerPath(): string | null {
    return this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.file
  }

  // must be sync
  protected abstract doInstall(options: InstallOptions): boolean

  // must be sync (because quit even handler is not async)
  install(isSilent = false, isForceRunAfter = false): boolean {
    if (this.quitAndInstallCalled) {
      this._logger.warn("install call ignored: quitAndInstallCalled is set to true")
      return false
    }

    const downloadedUpdateHelper = this.downloadedUpdateHelper
    const installerPath = this.installerPath
    const downloadedFileInfo = downloadedUpdateHelper == null ? null : downloadedUpdateHelper.downloadedFileInfo
    if (installerPath == null || downloadedFileInfo == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

    try {
      this._logger.info(`Install: isSilent: ${isSilent}, isForceRunAfter: ${isForceRunAfter}`)
      return this.doInstall({
        isSilent,
        isForceRunAfter,
        isAdminRightsRequired: downloadedFileInfo.isAdminRightsRequired,
      })
    } catch (e: any) {
      this.dispatchError(e)
      return false
    }
  }

  /**
   * Validates a pending update marked for install on next launch and installs it. Never trusts the cached installer
   * alone: fresh update info is fetched first and the cached file is validated against it. `isAutomatic` (the
   * `autoInstallOnNextLaunch` startup path) is additionally restricted to targets that can install without an
   * elevation prompt (`isAutoInstallOnNextLaunchSupported`) and to per-user installs, because an unattended
   * elevation prompt at startup is not acceptable.
   */
  private async installPendingUpdate(isAutomatic: boolean): Promise<boolean> {
    if (!this.isUpdaterActive()) {
      return false
    }

    const downloadedUpdateHelper = await this.getOrCreateDownloadHelper()
    const pendingInfo = await downloadedUpdateHelper.getPendingInstallInfo()
    if (pendingInfo == null) {
      if (!isAutomatic) {
        this._logger.info("No update is marked for install on next launch")
      }
      return false
    }

    if (isAutomatic && !this.isAutoInstallOnNextLaunchSupported) {
      this._logger.info(
        "Skipping automatic install of the pending update on launch: this target installs via the system package manager and always requires elevation (pkexec/sudo), which would show an authentication prompt at startup. Call installPendingUpdateIfAvailable() explicitly to install it at a moment the app controls."
      )
      return false
    }

    if (isAutomatic && pendingInfo.isAdminRightsRequired) {
      this._logger.info(
        "Skipping automatic install of the pending update on launch: it is a per-machine installation (isAdminRightsRequired is true). Call installPendingUpdateIfAvailable() explicitly to install it."
      )
      return false
    }

    this._logger.info("Update is marked for install on next launch, validating it against the latest update info")
    const updateInfoAndProvider = await this.getUpdateInfoAndProvider()
    const latestInfo = updateInfoAndProvider.info
    const latestVersion = parseVersion(latestInfo.version)
    // loop guard: install only a genuine version change so a silently succeeded install cannot re-trigger on every
    // launch. Version equality means the pending update was already installed successfully on a previous launch.
    // A downgrade is a valid target only when allowDowngrade is set — mirrors isUpdateAvailable so the deferred flow
    // does not silently discard a downgrade the immediate install path would have applied.
    const isInstallableChange =
      latestVersion != null && !isVersionsEqual(latestVersion, this.currentVersion) && (isVersionGreaterThan(latestVersion, this.currentVersion) || this.allowDowngrade)
    if (!isInstallableChange) {
      this._logger.info(
        `Pending update ${latestInfo.version} is not an installable change from the current version ${this.currentVersion.format()} (allowDowngrade: ${this.allowDowngrade}), clearing install-on-next-launch state`
      )
      await downloadedUpdateHelper.clearPendingInstallMarker(this._logger)
      return false
    }

    const fileInfo = updateInfoAndProvider.provider.resolveFiles(latestInfo).find(it => it.info.sha512 === pendingInfo.sha512)
    if (fileInfo == null) {
      this._logger.warn(
        `Pending update doesn't match any file of the latest update info (version ${latestInfo.version}), clearing install-on-next-launch state. The new update must be downloaded again.`
      )
      await downloadedUpdateHelper.clearPendingInstallMarker(this._logger)
      return false
    }

    const installerPath = await downloadedUpdateHelper.validateCachedPendingInstall(fileInfo, this._logger)
    if (installerPath == null) {
      // validation already logged the reason and cleaned the pending cache
      this._logger.warn("Pending update failed validation and will not be installed")
      return false
    }

    const signatureVerificationStatus = await this.verifyInstallerSignatureOnLaunch(installerPath)
    if (signatureVerificationStatus != null) {
      await downloadedUpdateHelper.clear().catch(() => {
        // ignore
      })
      this.dispatchError(newError(`Pending update ${latestInfo.version} is not signed by the application owner: ${signatureVerificationStatus}`, "ERR_UPDATER_INVALID_SIGNATURE"))
      return false
    }

    // clear the marker before spawning the installer so a silently failing install cannot produce an endless
    // spawn-and-quit loop on every launch
    await downloadedUpdateHelper.clearPendingInstallMarker(this._logger)
    this.updateInfoAndProvider = updateInfoAndProvider
    this._logger.info(`Installing pending update ${latestInfo.version} on launch`)
    const isInstalled = this.install(true, true)
    if (isInstalled) {
      setImmediate(() => this.app.quit())
    } else {
      // install() sets quitAndInstallCalled = true before doInstall; a failed/throwing install (e.g. AppImage's
      // sync unlink+mv) would otherwise leave it stuck true and short-circuit every later install this session,
      // while the pending marker has already been cleared above. Reset it so autoInstallOnAppQuit / an explicit
      // quitAndInstall can still install the cached update (matches the reset in quitAndInstall).
      this.quitAndInstallCalled = false
    }
    return isInstalled
  }

  /**
   * Re-verification of the cached installer's code signature before an install-on-next-launch is executed.
   * Platforms without installer signature verification resolve to `null` (no error).
   */
  protected verifyInstallerSignatureOnLaunch(_installerPath: string): Promise<string | null> {
    return Promise.resolve(null)
  }

  private markPendingInstallOnNextLaunch(): boolean {
    const downloadedUpdateHelper = this.downloadedUpdateHelper
    if (downloadedUpdateHelper == null || this.installerPath == null || downloadedUpdateHelper.downloadedFileInfo == null) {
      this.dispatchError(new Error("No update filepath provided, can't defer install to next launch"))
      return false
    }
    const isMarked = downloadedUpdateHelper.markInstallOnNextLaunchSync(this._logger)
    if (isMarked) {
      this._logger.info("Update is marked for install on next launch")
    }
    return isMarked
  }

  protected addQuitHandler(): void {
    this.addSessionEndHandler()
    if (this.quitHandlerAdded || !(this.autoInstallOnAppQuit || this.autoInstallOnNextLaunch)) {
      return
    }

    this.quitHandlerAdded = true

    this.app.onQuit(exitCode => {
      if (this.quitAndInstallCalled) {
        this._logger.info("Update installer has already been triggered. Quitting application.")
        return
      }

      if (exitCode !== 0) {
        this._logger.info(`Update will be not installed on quit because application is quitting with exit code ${exitCode}`)
        return
      }

      if (this.autoInstallOnNextLaunch) {
        this._logger.info("Deferring update install to next launch because autoInstallOnNextLaunch is enabled")
        this.markPendingInstallOnNextLaunch()
        return
      }

      if (!this.autoInstallOnAppQuit) {
        this._logger.info("Update will not be installed on quit because autoInstallOnAppQuit is set to false.")
        return
      }

      if (this.isSessionEnding) {
        this._logger.warn(
          "Update will not be installed on quit because the OS session is ending — the OS would kill the installer before it finishes and can leave the app in a broken state (https://github.com/electron-userland/electron-builder/issues/7807). The downloaded update stays cached and will be installed on the next quit. Enable autoInstallOnNextLaunch (planned default in v28) to install it on the next launch instead."
        )
        return
      }

      this._logger.info("Auto install update on quit")
      this.install(true, false)
    })
  }

  private addSessionEndHandler(): void {
    if (this.sessionEndHandlerAdded || this.app.onSessionEnd == null) {
      return
    }

    this.sessionEndHandlerAdded = true

    this.app.onSessionEnd(() => {
      this.isSessionEnding = true
      this._logger.info("OS session is ending (shutdown/reboot/log off), install of the downloaded update on quit will be skipped")
    })
  }

  /**
   * Strips relative-path entries from a PATH string.
   * Prevents PATH-poisoning where a writable directory earlier in PATH shadows
   * a trusted package manager binary.
   */
  protected sanitizeEnvPath(envPath: string): string {
    return envPath
      .split(path.delimiter)
      .filter((dir: string) => path.isAbsolute(dir))
      .join(path.delimiter)
  }

  protected spawnSyncLog(cmd: string, args: string[] = [], env = {}): string {
    this._logger.info(`Executing: ${cmd} with args: ${args}`)
    const mergedEnv: NodeJS.ProcessEnv = { ...process.env, ...env }
    const response = spawnSync(cmd, args, {
      env: { ...mergedEnv, PATH: this.sanitizeEnvPath(mergedEnv.PATH ?? "") },
      encoding: "utf-8",
      shell: true,
    })

    const { error, status, stdout, stderr } = response
    if (error != null) {
      this._logger.error(stderr)
      throw error
    } else if (status != null && status !== 0) {
      this._logger.error(stderr)
      throw new Error(`Command ${cmd} exited with code ${status}`)
    }

    return stdout.trim()
  }

  /**
   * This handles both node 8 and node 10 way of emitting error when spawning a process
   *   - node 8: Throws the error
   *   - node 10: Emit the error(Need to listen with on)
   */
  // https://github.com/electron-userland/electron-builder/issues/1129
  // Node 8 sends errors: https://nodejs.org/dist/latest-v8.x/docs/api/errors.html#errors_common_system_errors
  protected async spawnLog(cmd: string, args: string[] = [], env: any = undefined, stdio: StdioOptions = "ignore"): Promise<boolean> {
    this._logger.info(`Executing: ${cmd} with args: ${args}`)
    return new Promise<boolean>((resolve, reject) => {
      try {
        const params: SpawnOptions = { stdio, env, detached: true }
        const p = spawn(cmd, args, params)
        p.on("error", error => {
          reject(error)
        })
        p.unref()
        if (p.pid !== undefined) {
          resolve(true)
        }
      } catch (error) {
        reject(error)
      }
    })
  }
}

export interface InstallOptions {
  readonly isSilent: boolean
  readonly isForceRunAfter: boolean
  readonly isAdminRightsRequired: boolean
}
