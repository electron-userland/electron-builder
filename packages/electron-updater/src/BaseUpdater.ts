import { createRequire } from "node:module"
import { AllPublishOptions, newError } from "builder-util-runtime"
import { spawn, SpawnOptions, spawnSync, StdioOptions } from "child_process"
import { mkdtemp, open, rm } from "fs/promises"
import type { FileHandle } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import { eq as isVersionsEqual, gt as isVersionGreaterThan, parse as parseVersion } from "semver"
import { AppAdapter, CancellableQuitEvent } from "./AppAdapter.js"
import { AppUpdater, DownloadExecutorTask, UpdateInfoAndProvider } from "./AppUpdater.js"
import type { Logger, VerifyUpdateFileResult } from "./types.js"
import { QuitAndInstallOptions, DownloadExecutorResult, verificationFailureMessage } from "./types.js"
import { nonThrowingLogger } from "./util.js"

const require = createRequire(import.meta.url)

/** How much of a failed command's stderr goes into the error message, at most: its end, where the error is. */
const STDERR_MESSAGE_BYTES = 8 * 1024

/**
 * The command line a shell runs for `cmd` and `args`. Given `shell: true` and an argv array, Node joins them with spaces
 * and warns (DEP0190) that nothing is escaped; passing the joined line itself runs exactly the same command, without the
 * warning. The escaping is the caller's, as before.
 */
function shellCommandLine(cmd: string, args: readonly string[]): string {
  return [cmd, ...args].join(" ")
}

/**
 * A command that ran and did not succeed: it exited with a non-zero code, or was killed by a signal. Thrown by
 * {@link BaseUpdater.spawnSyncLog} and {@link BaseUpdater.spawnAsyncLog}, so that callers can tell from the exit code
 * why it failed without parsing the message. A command that could not be spawned at all fails with the spawn error.
 */
export class CommandExitError extends Error {
  constructor(
    message: string,
    /** The program that was spawned. */
    readonly command: string,
    /** `null` when the command was killed by a signal. */
    readonly exitCode: number | null,
    readonly signal: NodeJS.Signals | null
  ) {
    super(message)
    this.name = "CommandExitError"
  }
}

async function removeQuietly(file: string): Promise<void> {
  try {
    await rm(file, { recursive: true, force: true })
  } catch (_ignored) {
    // a temp file left behind must not change how the install ends
  }
}

/**
 * A command's stderr, written to a temp file rather than piped. A pipe ties the command to this process: when the app
 * quits while the command still runs, its next write to stderr kills it with SIGPIPE (or fails with EPIPE), half way
 * through an install. A file stays writable.
 *
 * The file is removed as soon as it is open: the descriptor keeps it readable here and writable for the command, and
 * nothing is left behind if the app quits before the command exits. {@link dispose} removes it on every other path.
 */
class StderrCapture {
  private constructor(
    private readonly dir: string,
    private readonly handle: FileHandle
  ) {}

  get fd(): number {
    return this.handle.fd
  }

  /** Never throws: resolves to `null` when no temp file can be created, and the command's stderr is then discarded. */
  static async open(parentDir: string, logger: Logger): Promise<StderrCapture | null> {
    let dir: string | null = null
    try {
      dir = await mkdtemp(path.join(parentDir, "electron-updater-stderr-"))
      const handle = await open(path.join(dir, "stderr.log"), "w+", 0o600)
      // on Windows an open file may not be removable yet; dispose() tries again
      await removeQuietly(dir)
      return new StderrCapture(dir, handle)
    } catch (error: unknown) {
      if (dir != null) {
        await removeQuietly(dir)
      }
      logger.warn(`Cannot capture the command's stderr, it is discarded: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /** The last {@link STDERR_MESSAGE_BYTES} the command wrote, trimmed. Never throws: resolves to "" when it cannot be read. */
  async read(): Promise<string> {
    try {
      const { size } = await this.handle.stat()
      const length = Math.min(size, STDERR_MESSAGE_BYTES)
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await this.handle.read(buffer, 0, length, size - length)
      let start = 0
      if (length < size) {
        // the cut can fall inside a multi-byte character: skip its continuation bytes
        while (start < bytesRead && (buffer[start] & 0xc0) === 0x80) {
          start++
        }
      }
      const text = buffer.toString("utf8", start, bytesRead).trim()
      return length < size && text.length !== 0 ? `…${text}` : text
    } catch (_ignored) {
      return ""
    }
  }

  /** Never throws. */
  async dispose(): Promise<void> {
    try {
      await this.handle.close()
    } catch (_ignored) {
      // already closed, nothing else to release
    }
    await removeQuietly(this.dir)
  }
}

export abstract class BaseUpdater extends AppUpdater {
  protected quitAndInstallCalled = false
  private quitHandlerAdded = false
  private sessionEndHandlerAdded = false
  private isSessionEnding = false
  private willQuitHandlerAdded = false
  /** Set while {@link runInstallAsync} waits for the install. */
  private isInstallInFlight = false
  /** A quit was cancelled to let the running install finish: the app quits once it settled. */
  private isQuitDeferredUntilInstalled = false
  /** An install failed while the app was quitting: no later quit in this session tries to install on quit again. */
  private isInstallOnQuitFailed = false
  /**
   * Set while {@link executeDownload} runs. The downloaded update helper can already point at an installer then, e.g. one
   * cached by an earlier launch that the app's `verifyUpdateFile` has not accepted yet, so the quit handler must not install it.
   */
  private isDownloadInProgress = false

  protected constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
    void this.app.whenReady().then(() => {
      if (this.autoInstallEvent === "onNextLaunch") {
        return this.installPendingUpdate(true).catch((e: any) => this._logger.warn(`Cannot install pending update on launch: ${e.message || e}`))
      }
      return Promise.resolve(false)
    })
  }

  quitAndInstall(options: QuitAndInstallOptions | boolean = {}, legacyIsForceRunAfter?: boolean): void {
    const { isSilent = false, isForceRunAfter = false, waitUntilNextLaunch = false } = this.normalizeQuitAndInstallOptions(options, legacyIsForceRunAfter)
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
    // the install runs asynchronously on targets whose install shows an elevation dialog (see installAsync), so the
    // app quits once it finished instead of right after this call returns
    void this.runInstallAsync(isSilent, isSilent ? isForceRunAfter : this.autoRunAppAfterInstall, true)
      .catch((error: unknown) => {
        // installAsync reports install failures itself; this is a failure to report one (an "error" listener that throws)
        nonThrowingLogger(this._logger).error(`Cannot install update: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
        return false
      })
      .then(isInstalled => {
        if (isInstalled) {
          setImmediate(() => {
            // this event is normally emitted when calling quitAndInstall, this emulates that
            require("electron").autoUpdater.emit("before-quit-for-update")
            this.app.quit()
          })
        } else {
          this.quitAndInstallCalled = false
        }
      })
  }

  installPendingUpdateIfAvailable(): Promise<boolean> {
    return this.installPendingUpdate(false)
  }

  /**
   * Whether this target supports the automatic `autoInstallEvent: "onNextLaunch"` install at startup. Targets whose install
   * always requires elevation (deb/rpm/pacman via pkexec/sudo) must not show an authentication prompt at app launch,
   * so they keep the pending update for an explicit `installPendingUpdateIfAvailable()` call instead.
   */
  protected get isAutoInstallOnNextLaunchSupported(): boolean {
    return false
  }

  /**
   * Whether a quit can be cancelled for this target (see {@link handleWillQuit}): a quit waits for an install that is
   * running, and an install on quit that fails cancels the quit, so the app keeps running. Only for targets whose
   * {@link doInstall} has finished, and knows whether it succeeded, when it returns: the Linux package targets. The
   * others keep installing in the quit itself, which cannot be cancelled; NSIS, for one, only starts an installer that
   * runs once the app exited.
   */
  protected get isQuitCancellable(): boolean {
    return false
  }

  protected executeDownload(taskOptions: DownloadExecutorTask): Promise<DownloadExecutorResult> {
    // registered when the download starts, not when it ends: an app quitting before then is told why nothing is installed
    this.addQuitHandler()
    this.isDownloadInProgress = true
    return super
      .executeDownload({
        ...taskOptions,
        done: event => {
          // the update is downloaded and verified: from now on, quitting installs it
          this.isDownloadInProgress = false
          this.dispatchUpdateDownloaded(event)
          this.addQuitHandler()
          return Promise.resolve()
        },
      })
      .finally(() => {
        this.isDownloadInProgress = false
      })
  }

  protected get installerPath(): string | null {
    return this.downloadedUpdateHelper == null ? null : this.downloadedUpdateHelper.file
  }

  // must be sync
  protected abstract doInstall(options: InstallOptions): boolean

  /**
   * Installs without blocking the main process. Defaults to the synchronous {@link doInstall}; targets whose
   * install shows an elevation dialog override it.
   */
  protected doInstallAsync(options: InstallOptions): Promise<boolean> {
    return Promise.resolve(this.doInstall(options))
  }

  private beginInstall(isSilent: boolean, isForceRunAfter: boolean): InstallOptions | null {
    if (this.quitAndInstallCalled) {
      this._logger.warn("install call ignored: quitAndInstallCalled is set to true")
      return null
    }

    const downloadedUpdateHelper = this.downloadedUpdateHelper
    const installerPath = this.installerPath
    const downloadedFileInfo = downloadedUpdateHelper == null ? null : downloadedUpdateHelper.downloadedFileInfo
    if (installerPath == null || downloadedFileInfo == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return null
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

    this._logger.info(`Install: isSilent: ${isSilent}, isForceRunAfter: ${isForceRunAfter}`)
    return {
      isSilent,
      isForceRunAfter,
      isAdminRightsRequired: downloadedFileInfo.isAdminRightsRequired,
    }
  }

  // must be sync (because quit even handler is not async)
  install(isSilent = false, isForceRunAfter = false): boolean {
    const options = this.beginInstall(isSilent, isForceRunAfter)
    if (options == null) {
      return false
    }

    try {
      return this.doInstall(options)
    } catch (e: any) {
      this.dispatchError(e)
      return false
    }
  }

  /**
   * Same as {@link install}, without blocking the main process while the install runs. Targets whose install
   * shows an elevation dialog need it: a synchronous spawn freezes the app for as long as the dialog is open,
   * and the desktop reports it as not responding. Targets that do not override {@link doInstallAsync} keep
   * installing synchronously, so their timing is unchanged.
   */
  installAsync(isSilent = false, isForceRunAfter = false): Promise<boolean> {
    return this.runInstallAsync(isSilent, isForceRunAfter, false)
  }

  /**
   * {@link installAsync}. A quit while the install runs waits for it (see {@link handleWillQuit}) and happens once it
   * settled; `isQuitOnSuccess` tells that the caller quits by itself once the install succeeded, so that quit is its own.
   */
  private async runInstallAsync(isSilent: boolean, isForceRunAfter: boolean, isQuitOnSuccess: boolean): Promise<boolean> {
    const options = this.beginInstall(isSilent, isForceRunAfter)
    if (options == null) {
      return false
    }

    this.addWillQuitHandler()
    let isInstalled = false
    this.isInstallInFlight = true
    try {
      isInstalled = await this.doInstallAsync(options)
      return isInstalled
    } catch (e: any) {
      this.dispatchError(e)
      return false
    } finally {
      this.isInstallInFlight = false
      this.quitIfDeferred(isInstalled, isQuitOnSuccess)
    }
  }

  private quitIfDeferred(isInstalled: boolean, isQuitOnSuccess: boolean): void {
    if (!this.isQuitDeferredUntilInstalled) {
      return
    }
    this.isQuitDeferredUntilInstalled = false
    if (isInstalled && isQuitOnSuccess) {
      // quitAndInstall and the install on launch quit once the install succeeded
      return
    }
    if (!isInstalled) {
      // the user cancelled the authentication dialog, for example: quitting must not show it again
      this.isInstallOnQuitFailed = true
    }
    nonThrowingLogger(this._logger).info("The update install finished, quitting")
    setImmediate(() => this.app.quit())
  }

  /**
   * Validates a pending update marked for install on next launch and installs it. Never trusts the cached installer
   * alone: fresh update info is fetched first and the cached file is validated against it. `isAutomatic` (the
   * `autoInstallEvent: "onNextLaunch"` startup path) is additionally restricted to targets that can install without an
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

    if (fileInfo.packageInfo != null && this.disableWebInstaller) {
      await downloadedUpdateHelper.clearPendingInstallMarker(this._logger)
      this.dispatchError(newError(`Unable to install pending update ${latestInfo.version}. Web Installers are disabled`, "ERR_UPDATER_WEB_INSTALLER_DISABLED"))
      return false
    }

    const installerPath = await downloadedUpdateHelper.validateCachedPendingInstall(fileInfo, this._logger)
    if (installerPath == null) {
      // validation already logged the reason and cleaned the pending cache
      this._logger.warn("Pending update failed validation and will not be installed")
      return false
    }

    const clearPendingCache = () =>
      downloadedUpdateHelper.clear().catch(() => {
        // ignore
      })

    const signatureFailure = verificationFailureMessage(await this.verifyInstallerSignatureOnLaunch(installerPath, updateInfoAndProvider))
    if (signatureFailure != null) {
      await clearPendingCache()
      this.dispatchError(newError(`Pending update ${latestInfo.version} is not signed by the application owner: ${signatureFailure}`, "ERR_UPDATER_INVALID_SIGNATURE"))
      return false
    }

    // the installer sat on disk since a previous launch, so the app's own verifier gets to inspect it again before it
    // is spawned — `verifyInstallerSignatureOnLaunch` only covers Authenticode, and only on Windows
    const updateFileFailure = verificationFailureMessage(
      await this.verifyUpdateFile({
        updateFilePath: installerPath,
        originalUpdateFileName: path.basename(installerPath),
        // the cached package of a web installer is passed to it with --package-file, so the verifier gets it as well
        packageFilePath: downloadedUpdateHelper.packageFile ?? undefined,
      })
    )
    if (updateFileFailure != null) {
      await clearPendingCache()
      this.dispatchError(newError(`Pending update ${latestInfo.version} failed verification: ${updateFileFailure}`, "ERR_UPDATER_INVALID_UPDATE_FILE"))
      return false
    }

    // clear the marker before spawning the installer so a silently failing install cannot produce an endless
    // spawn-and-quit loop on every launch
    await downloadedUpdateHelper.clearPendingInstallMarker(this._logger)
    this.updateInfoAndProvider = updateInfoAndProvider
    this._logger.info(`Installing pending update ${latestInfo.version} on launch`)
    const isInstalled = await this.runInstallAsync(true, true, true)
    if (isInstalled) {
      setImmediate(() => this.app.quit())
    } else {
      // install() sets quitAndInstallCalled = true before doInstall; a failed/throwing install (e.g. AppImage's
      // sync unlink+mv) would otherwise leave it stuck true and short-circuit every later install this session,
      // while the pending marker has already been cleared above. Reset it so autoInstallEvent: "onQuit" / an explicit
      // quitAndInstall can still install the cached update (matches the reset in quitAndInstall).
      this.quitAndInstallCalled = false
    }
    return isInstalled
  }

  /**
   * Re-verification of the cached installer's code signature before an install-on-next-launch is executed.
   * Platforms without installer signature verification resolve to `{ response: "success" }`.
   *
   * This covers only the platform's own signature scheme; {@link AppUpdater.verifyUpdateFile} is re-run on the same
   * installer right after, and is the cross-platform place for an app's own verification.
   *
   * `updateInfoAndProvider` is the latest update info the cached installer was just matched against (fetched, and its manifest
   * signature checked, on this launch), so manifest settings apply as they would to a download of that update.
   */
  protected verifyInstallerSignatureOnLaunch(_installerPath: string, _updateInfoAndProvider: UpdateInfoAndProvider): Promise<VerifyUpdateFileResult> {
    return Promise.resolve({ response: "success" })
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

  /**
   * Registers, once, the handler that installs (or defers) the downloaded update when the app quits. It is registered
   * whatever `autoInstallEvent` is, and reads it when the app quits: an app may set it after the download, e.g. switch
   * from `"manual"` to `"onQuit"`.
   */
  protected addQuitHandler(): void {
    this.addSessionEndHandler()
    if (this.quitHandlerAdded) {
      return
    }

    this.quitHandlerAdded = true
    this.addWillQuitHandler()

    this.app.onQuit(exitCode => {
      if (this.quitAndInstallCalled) {
        this._logger.info("Update installer has already been triggered. Quitting application.")
        return
      }

      if (this.isDownloadInProgress) {
        this._logger.info("No update is installed on quit: the update has not finished downloading and verifying")
        return
      }

      if (this.installerPath == null) {
        this._logger.info("No update is installed on quit: no update has finished downloading")
        return
      }

      if (exitCode !== 0) {
        this._logger.info(`Update will be not installed on quit because application is quitting with exit code ${exitCode}`)
        return
      }

      if (this.autoInstallEvent === "onNextLaunch") {
        this._logger.info("Deferring update install to next launch because autoInstallEvent is 'onNextLaunch'")
        this.markPendingInstallOnNextLaunch()
        return
      }

      // autoInstallEvent may have been changed to "manual" after the quit handler was registered
      if (this.autoInstallEvent !== "onQuit") {
        this._logger.info("Update will not be installed on quit because autoInstallEvent is not 'onQuit'.")
        return
      }

      if (this.isSessionEnding) {
        this._logger.warn(
          "Update will not be installed on quit because the OS session is ending — the OS would kill the installer before it finishes and can leave the app in a broken state (https://github.com/electron-userland/electron-builder/issues/7807). The downloaded update stays cached and will be installed on the next quit. Set autoInstallEvent to 'onNextLaunch' (planned default in v28) to install it on the next launch instead."
        )
        return
      }

      if (this.isInstallOnQuitFailed) {
        this._logger.info("Update will not be installed on quit because installing it failed earlier in this session")
        return
      }

      this._logger.info("Auto install update on quit")
      this.install(true, false)
    })
  }

  private addWillQuitHandler(): void {
    if (this.willQuitHandlerAdded || !this.isQuitCancellable || this.app.onWillQuit == null) {
      return
    }

    this.willQuitHandlerAdded = true
    this.app.onWillQuit(event => this.handleWillQuit(event))
  }

  /** Whether the quit handler would install the downloaded update now; it logs why not, when not. */
  private get isInstallOnQuitDue(): boolean {
    return (
      this.quitHandlerAdded &&
      !this.quitAndInstallCalled &&
      !this.isInstallOnQuitFailed &&
      !this.isSessionEnding &&
      !this.isDownloadInProgress &&
      this.installerPath != null &&
      this.autoInstallEvent === "onQuit"
    )
  }

  /**
   * Runs on every quit that can still be cancelled (Electron's `will-quit`: after all windows closed, not for
   * `app.exit()`), for targets where {@link isQuitCancellable}. It never throws.
   * - While an install runs (an explicit `quitAndInstall()`, the install on launch), the quit waits for it: when it is
   *   cancelled, the update would be left half installed, and the app would not be relaunched.
   * - The install on quit runs here rather than in the quit handler, which cannot cancel the quit: when it fails (the
   *   user dismissed the authentication dialog, for example), the quit is cancelled and the app keeps running, with
   *   its windows closed, and an `error` event is emitted. The next quit is not cancelled again and does not try to
   *   install; an explicit `quitAndInstall()` still can.
   *
   * When the OS session ends, the quit proceeds as before.
   */
  private handleWillQuit(event: CancellableQuitEvent): void {
    const logger = nonThrowingLogger(this._logger)
    if (this.isSessionEnding) {
      return
    }

    if (this.isInstallInFlight) {
      event.preventDefault()
      if (!this.isQuitDeferredUntilInstalled) {
        this.isQuitDeferredUntilInstalled = true
        logger.info("Waiting for the update install to finish before quitting")
      }
      return
    }

    if (!this.isInstallOnQuitDue) {
      return
    }

    logger.info("Auto install update on quit")
    let isInstalled = false
    try {
      isInstalled = this.install(true, false)
    } catch (error: unknown) {
      // install() reports a failed install itself; this is a failure to report it (an "error" listener that throws)
      logger.error(`Cannot install update on quit: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
    }
    if (isInstalled) {
      return
    }

    event.preventDefault()
    this.isInstallOnQuitFailed = true
    // install() leaves it set; an explicit quitAndInstall() must still be able to install
    this.quitAndInstallCalled = false
    logger.warn(
      'The update was not installed on quit, so the quit is cancelled: the app keeps running (its windows are already closed) and an "error" event is emitted. The next quit is not cancelled and does not try to install again; call quitAndInstall() to retry.'
    )
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

  /**
   * Runs a command and returns its trimmed stdout; throws when it cannot be spawned, or a {@link CommandExitError} when it
   * exits with a non-zero code or is killed by a signal.
   *
   * With `useShell` (the default), the shell gets the command line Node would have joined from `cmd` and `args` (see
   * {@link shellCommandLine}), so the caller escapes them. Without it, the arguments are passed as an argv array and
   * nothing has to be escaped.
   */
  protected spawnSyncLog(cmd: string, args: string[] = [], env = {}, useShell = true): string {
    this._logger.info(`Executing: ${cmd} with args: ${args}`)
    const mergedEnv: NodeJS.ProcessEnv = { ...process.env, ...env }
    const response = spawnSync(useShell ? shellCommandLine(cmd, args) : cmd, useShell ? [] : args, {
      env: { ...mergedEnv, PATH: this.sanitizeEnvPath(mergedEnv.PATH ?? "") },
      encoding: "utf-8",
      shell: useShell,
    })

    const { error, status, signal, stdout, stderr } = response
    if (error != null) {
      this._logger.error(stderr)
      throw error
    } else if (status !== 0) {
      // a command killed by a signal has no exit code, and did not succeed either
      this._logger.error(stderr)
      throw new CommandExitError(`Command ${cmd} exited with code ${status}${signal == null ? "" : `, signal ${signal}`}`, cmd, status, signal)
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

  /**
   * {@link spawnSyncLog} without blocking the main process: same command, same environment, awaited instead.
   * Rejects with a {@link CommandExitError} when the command exits with a non-zero code or is killed by a signal; its
   * message ends with what the command wrote to stderr (its last {@link STDERR_MESSAGE_BYTES}).
   *
   * Neither stdout nor stderr is a pipe, so a command still running when the app quits is not killed by SIGPIPE on its
   * next write: stdout is not read (as with {@link spawnSyncLog}, nothing uses it) and is discarded, stderr goes to a
   * temp file (see {@link StderrCapture}) that is read once the command exited.
   *
   * `useShell` is opt-out: without a shell the arguments are passed as an argv array, so nothing has to be
   * escaped. With a shell, the shell gets the command line Node would have joined from them (see {@link shellCommandLine}).
   */
  protected async spawnAsyncLog(cmd: string, args: string[] = [], env = {}, useShell = true): Promise<void> {
    // logging runs in child-process callbacks, where a throwing logger would escape as an uncaught exception
    const logger = nonThrowingLogger(this._logger)
    logger.info(`Executing: ${cmd} with args: ${args}`)
    const mergedEnv: NodeJS.ProcessEnv = { ...process.env, ...env }
    const stderr = await StderrCapture.open(this.commandStderrDir(), logger)
    try {
      const { status, signal } = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        const child = spawn(useShell ? shellCommandLine(cmd, args) : cmd, useShell ? [] : args, {
          env: { ...mergedEnv, PATH: this.sanitizeEnvPath(mergedEnv.PATH ?? "") },
          shell: useShell,
          stdio: ["ignore", "ignore", stderr == null ? "ignore" : stderr.fd],
        })
        child.on("error", error => reject(error))
        child.on("close", (status, signal) => resolve({ status, signal }))
      })
      if (status === 0) {
        return
      }
      const output = stderr == null ? "" : await stderr.read()
      throw new CommandExitError(
        `Command ${cmd} exited with code ${status}${signal == null ? "" : `, signal ${signal}`}${output.length === 0 ? "" : `: ${output}`}`,
        cmd,
        status,
        signal
      )
    } finally {
      await stderr?.dispose()
    }
  }

  /** Where {@link spawnAsyncLog} creates the temp file that captures a command's stderr. */
  protected commandStderrDir(): string {
    return tmpdir()
  }
}

export interface InstallOptions {
  readonly isSilent: boolean
  readonly isForceRunAfter: boolean
  readonly isAdminRightsRequired: boolean
}
