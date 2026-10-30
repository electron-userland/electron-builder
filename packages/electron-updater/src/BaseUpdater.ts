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
import { DownloadedUpdateHelper } from "./DownloadedUpdateHelper.js"
import type { Logger, VerifyUpdateFileResult } from "./types.js"
import { QuitAndInstallOptions, DownloadExecutorResult, verificationFailureMessage } from "./types.js"

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

/** An app lifecycle event the updater listens to, see {@link BaseUpdater.registerHookOnce}. */
type LifecycleHook = "quit" | "willQuit" | "sessionEnd"

/** Why the quit handler does not install the downloaded update, and how loudly it says so. */
interface InstallOnQuitSkip {
  readonly level: "info" | "warn"
  readonly message: string
}

/**
 * Where the update install is in this session. {@link BaseUpdater.beginInstall} and {@link BaseUpdater.endInstall} move
 * it; a `quitAndInstall({ waitUntilNextLaunch: true })` that marked the update for the next launch hands it off directly.
 * - `idle`: no install runs, one can start.
 * - `installing`: an install runs. `updateId` is the update it installs (`downloadedUpdateId`), should the download
 *   helper move on to another one meanwhile; `isQuitDeferred`: a quit was cancelled to let it finish, and the app quits once it settled.
 * - `handedOff`: the update is installed, its installer started, or it is marked for the next launch, and the app
 *   quits: no other install starts in this session.
 */
type InstallState = { readonly kind: "idle" } | { readonly kind: "installing"; readonly updateId: string | null; isQuitDeferred: boolean } | { readonly kind: "handedOff" }

type Installing = Extract<InstallState, { readonly kind: "installing" }>

const IDLE: InstallState = { kind: "idle" }
const HANDED_OFF: InstallState = { kind: "handedOff" }

/**
 * What started an install: `install()` or `installAsync()` (the app's own call, or the install on quit),
 * `quitAndInstall()`, or the install on launch. The last two quit by themselves once the install succeeded.
 */
type InstallTrigger = "install" | "quitAndInstall" | "launch"

export abstract class BaseUpdater extends AppUpdater {
  private installState: InstallState = IDLE
  /** The app lifecycle events whose handler is registered: each one is registered once. */
  private readonly registeredHooks = new Set<LifecycleHook>()
  private isSessionEnding = false
  /**
   * The {@link downloadedUpdateId} of a downloaded update that no later quit in this session tries to install: installing it failed while
   * the app was quitting, or, on a target whose install shows an elevation dialog, when `install()` or `installAsync()`
   * installed it. A different update downloaded later is installed on quit, and an explicit install can still install
   * this one.
   */
  private skipInstallOnQuitUpdateId: string | null = null
  /**
   * Set while {@link executeDownload} runs. The downloaded update helper can already point at an installer then, e.g. one
   * cached by an earlier launch that the app's `verifyUpdateFile` has not accepted yet, so the quit handler must not install it.
   */
  private isDownloadInProgress = false
  /** The install of an update marked for install on next launch that runs, if any: they run one at a time, see {@link runPendingInstall}. */
  private pendingInstall: Promise<unknown> = Promise.resolve()

  /**
   * Whether an install started in this session: it runs, or it handed the update off (installed it, started its
   * installer, or marked it for the next launch). Setting it to `true` stops every later install in this session,
   * setting it to `false` lets one start again.
   *
   * @deprecated Kept for subclasses until the next major version: the install lifecycle is tracked in one private state
   * now, and a failed install no longer leaves this set. Do not set it: an install that failed can be retried as is.
   */
  protected get quitAndInstallCalled(): boolean {
    return this.installState.kind !== "idle"
  }

  protected set quitAndInstallCalled(value: boolean) {
    this.installState = value ? HANDED_OFF : IDLE
  }

  protected constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
    void this.app
      .whenReady()
      // a tick later, so that what the app configures in its own ready handler (autoInstallEvent, the feed, its headers) applies
      .then(() => new Promise<void>(resolve => setImmediate(resolve)))
      .then(() => this.installPendingUpdateOnLaunch())
      .catch((e: unknown) => this.log.warn(`Cannot install pending update on launch: ${e instanceof Error ? e.message : String(e)}`))
  }

  /**
   * The automatic install at launch of an update that a previous launch marked for it: its quit with `autoInstallEvent:
   * "onNextLaunch"`, or its `quitAndInstall({ waitUntilNextLaunch: true })` whatever `autoInstallEvent` was. The marker
   * records what that launch asked for, so it is installed with any `autoInstallEvent` but `"manual"`, which never installs
   * automatically: the app calls `installPendingUpdateIfAvailable()` then.
   */
  private installPendingUpdateOnLaunch(): Promise<boolean> {
    return this.runPendingInstall(async () => {
      if (this.autoInstallEvent === "manual" || !(await this.isPendingInstallMarked())) {
        return false
      }
      return this.installPendingUpdate(true)
    })
  }

  /**
   * Runs `install` once the install of the marked update that runs settled: the install at launch and the app's own
   * `installPendingUpdateIfAvailable()` must not both validate the update and install it. The second one finds no marker
   * when the first one installed the update (or rejected it), and installs it when the first one skipped it.
   */
  private runPendingInstall(install: () => Promise<boolean>): Promise<boolean> {
    const result = this.pendingInstall.then(install)
    this.pendingInstall = result.catch(() => false)
    return result
  }

  /**
   * Whether a previous launch marked an update for install on next launch. Without a marker nothing happens at launch:
   * nothing is logged, and the download helper is not created, which would fix the cache directory before the app had a
   * chance to set updateConfigPath.
   */
  private async isPendingInstallMarked(): Promise<boolean> {
    // like isUpdaterActive, without its log line: nothing is cached for an unpackaged app
    if (!this.app.isPackaged && !this.forceDevUpdateConfig) {
      return false
    }
    let downloadedUpdateHelper = this.downloadedUpdateHelper
    if (downloadedUpdateHelper == null) {
      let dirName: string | null | undefined
      try {
        dirName = (await this.configOnDisk.value).updaterCacheDirName
      } catch (e: unknown) {
        // no readable app-update.yml: nothing was downloaded with it, and the update check reports it
        this.log.debug(`Cannot look for an update marked for install on launch: ${e instanceof Error ? e.message : String(e)}`)
        return false
      }
      downloadedUpdateHelper = new DownloadedUpdateHelper(path.join(this.app.baseCachePath, dirName || this.app.name), this.log)
    }
    return (await downloadedUpdateHelper.getPendingInstallInfo()) != null
  }

  quitAndInstall(options: QuitAndInstallOptions | boolean = {}, legacyIsForceRunAfter?: boolean): void {
    const { isSilent = false, isForceRunAfter = false, waitUntilNextLaunch = false } = this.normalizeQuitAndInstallOptions(options, legacyIsForceRunAfter)
    if (waitUntilNextLaunch) {
      this.log.info(`Deferring install to next launch on explicit quitAndInstall (waitUntilNextLaunch)`)
      if (this.markPendingInstallOnNextLaunch()) {
        this.installState = HANDED_OFF
        setImmediate(() => this.app.quit())
      }
      return
    }
    this.log.info(`Install on explicit quitAndInstall`)
    // If NOT in silent mode use `autoRunAppAfterInstall` to determine whether to force run the app
    // the install runs asynchronously on targets whose install shows an elevation dialog (see installAsync), so the
    // app quits once it finished instead of right after this call returns
    void this.runInstallAsync(isSilent, isSilent ? isForceRunAfter : this.autoRunAppAfterInstall, "quitAndInstall")
      .catch((error: unknown) => {
        // installAsync reports install failures itself; this is a failure to report one (an "error" listener that throws)
        this.log.error(`Cannot install update: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
        return false
      })
      .then(isInstalled => {
        if (isInstalled) {
          setImmediate(() => {
            // this event is normally emitted when calling quitAndInstall, this emulates that
            require("electron").autoUpdater.emit("before-quit-for-update")
            this.app.quit()
          })
        }
      })
  }

  installPendingUpdateIfAvailable(): Promise<boolean> {
    return this.runPendingInstall(() => this.installPendingUpdate(false))
  }

  /**
   * Whether this target supports the automatic install at launch of an update marked for the next launch (see
   * {@link installPendingUpdateOnLaunch}). Targets whose install always requires elevation (deb/rpm/pacman via pkexec/sudo)
   * must not show an authentication prompt at app launch, so they keep the pending update for an explicit
   * `installPendingUpdateIfAvailable()` call.
   */
  protected get isAutoInstallOnNextLaunchSupported(): boolean {
    return false
  }

  /**
   * Whether a quit can be cancelled for this target (see {@link handleWillQuit}): a quit waits for an install that is
   * running, and with {@link cancelQuitOnInstallFailure} the install on quit runs while the quit can still be cancelled,
   * which a failed install then does. Only for targets whose {@link doInstall} has finished, and knows whether it
   * succeeded, when it returns: the Linux package targets. The others always install in the quit itself, which cannot
   * be cancelled; NSIS, for one, only starts an installer that runs once the app exited.
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

  /**
   * `idle` → `installing`. Refused, returning `null`, while an install runs or once one handed the update off, and when
   * no update finished downloading (an `error` event is emitted then). {@link endInstall} ends the install it begins.
   */
  private beginInstall(isSilent: boolean, isForceRunAfter: boolean): { readonly install: Installing; readonly options: InstallOptions } | null {
    if (this.installState.kind !== "idle") {
      this.log.warn("install call ignored: quitAndInstallCalled is set to true")
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
    const install: Installing = { kind: "installing", updateId: this.downloadedUpdateId, isQuitDeferred: false }
    this.installState = install

    this.log.info(`Install: isSilent: ${isSilent}, isForceRunAfter: ${isForceRunAfter}`)
    return {
      install,
      options: {
        isSilent,
        isForceRunAfter,
        isAdminRightsRequired: downloadedFileInfo.isAdminRightsRequired,
      },
    }
  }

  /**
   * `installing` → `handedOff` when `install` installed the update, → `idle` when it failed, so that a later install
   * can try again; unless the state moved on meanwhile (the deprecated {@link quitAndInstallCalled} was set).
   *
   * A failed install is not tried again on quit (see {@link skipInstallOnQuitUpdateId}) when a quit waited for it, or
   * when `install()` or `installAsync()` ran it on a target whose install shows an elevation dialog ({@link isQuitCancellable}):
   * a quit must not show the dialog the user just dismissed again.
   *
   * A quit that waited for the install (see {@link handleWillQuit}) happens now: once, with one `app.quit()`, which emits
   * `will-quit` again, so a `will-quit` listener that cancelled the deferred quit as well can cancel this one too. Not
   * when the install succeeded and its trigger quits by itself, nor when it failed and {@link cancelQuitOnInstallFailure}
   * is set: the quit stays cancelled then.
   */
  private endInstall(install: Installing, isInstalled: boolean, trigger: InstallTrigger): void {
    if (this.installState === install) {
      this.installState = isInstalled ? HANDED_OFF : IDLE
    }
    if (!isInstalled && (install.isQuitDeferred || (trigger === "install" && this.isQuitCancellable))) {
      // the user cancelled the authentication dialog, for example: quitting must not show it again for this update
      this.skipInstallOnQuitUpdateId = install.updateId
    }
    if (!install.isQuitDeferred || (isInstalled && trigger !== "install")) {
      // quitAndInstall and the install on launch quit once the install succeeded
      return
    }
    if (isInstalled) {
      this.log.info("The update install finished, quitting")
    } else if (this.cancelQuitOnInstallFailure) {
      this.log.warn(
        'The update was not installed, so the quit that waited for the install stays cancelled (cancelQuitOnInstallFailure): the app keeps running (its windows are already closed) and an "error" event was emitted. The next quit is not cancelled and does not try to install this update again; call quitAndInstall() to retry.'
      )
      return
    } else {
      this.log.warn('The update was not installed, and an "error" event was emitted: the quit that waited for the install proceeds without it')
    }
    setImmediate(() => this.app.quit())
  }

  // must be sync (because quit even handler is not async)
  install(isSilent = false, isForceRunAfter = false): boolean {
    const started = this.beginInstall(isSilent, isForceRunAfter)
    if (started == null) {
      return false
    }

    let isInstalled = false
    try {
      isInstalled = this.doInstall(started.options)
      return isInstalled
    } catch (e: any) {
      this.dispatchError(e)
      return false
    } finally {
      this.endInstall(started.install, isInstalled, "install")
    }
  }

  /**
   * Same as {@link install}, without blocking the main process while the install runs. Targets whose install
   * shows an elevation dialog need it: a synchronous spawn freezes the app for as long as the dialog is open,
   * and the desktop reports it as not responding. Targets that do not override {@link doInstallAsync} keep
   * installing synchronously, so their timing is unchanged.
   */
  installAsync(isSilent = false, isForceRunAfter = false): Promise<boolean> {
    return this.runInstallAsync(isSilent, isForceRunAfter, "install")
  }

  /**
   * {@link installAsync}. A quit while the install runs waits for it (see {@link handleWillQuit}) and happens once it
   * settled; `quitAndInstall` and the install on launch quit by themselves once the install succeeded, so that quit is theirs.
   */
  private async runInstallAsync(isSilent: boolean, isForceRunAfter: boolean, trigger: InstallTrigger): Promise<boolean> {
    const started = this.beginInstall(isSilent, isForceRunAfter)
    if (started == null) {
      return false
    }

    this.addWillQuitHandler()
    let isInstalled = false
    try {
      isInstalled = await this.doInstallAsync(started.options)
      return isInstalled
    } catch (e: any) {
      this.dispatchError(e)
      return false
    } finally {
      this.endInstall(started.install, isInstalled, trigger)
    }
  }

  /**
   * Validates a pending update marked for install on next launch and installs it. Never trusts the cached installer
   * alone: fresh update info is fetched first and the cached file is validated against it. `isAutomatic` (the
   * automatic install at launch, see {@link installPendingUpdateOnLaunch}) is additionally restricted to targets that can install without an
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
        this.log.info("No update is marked for install on next launch")
      }
      return false
    }

    if (isAutomatic && !this.isAutoInstallOnNextLaunchSupported) {
      this.log.info(
        "Skipping automatic install of the pending update on launch: this target installs via the system package manager and always requires elevation (pkexec/sudo), which would show an authentication prompt at startup. Call installPendingUpdateIfAvailable() explicitly to install it at a moment the app controls."
      )
      return false
    }

    if (isAutomatic && pendingInfo.isAdminRightsRequired) {
      this.log.info(
        "Skipping automatic install of the pending update on launch: it is a per-machine installation (isAdminRightsRequired is true). Call installPendingUpdateIfAvailable() explicitly to install it."
      )
      return false
    }

    this.log.info("Update is marked for install on next launch, validating it against the latest update info")
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
      this.log.info(
        `Pending update ${latestInfo.version} is not an installable change from the current version ${this.currentVersion.format()} (allowDowngrade: ${this.allowDowngrade}), clearing install-on-next-launch state`
      )
      await downloadedUpdateHelper.clearPendingInstallMarker(this.log)
      return false
    }

    const fileInfo = updateInfoAndProvider.provider.resolveFiles(latestInfo).find(it => it.info.sha512 === pendingInfo.sha512)
    if (fileInfo == null) {
      this.log.warn(
        `Pending update doesn't match any file of the latest update info (version ${latestInfo.version}), clearing install-on-next-launch state. The new update must be downloaded again.`
      )
      await downloadedUpdateHelper.clearPendingInstallMarker(this.log)
      return false
    }

    if (fileInfo.packageInfo != null && this.disableWebInstaller) {
      await downloadedUpdateHelper.clearPendingInstallMarker(this.log)
      this.dispatchError(newError(`Unable to install pending update ${latestInfo.version}. Web Installers are disabled`, "ERR_UPDATER_WEB_INSTALLER_DISABLED"))
      return false
    }

    const installerPath = await downloadedUpdateHelper.validateCachedPendingInstall(fileInfo)
    if (installerPath == null) {
      // validation already logged the reason and cleaned the pending cache
      this.log.warn("Pending update failed validation and will not be installed")
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
    await downloadedUpdateHelper.clearPendingInstallMarker(this.log)
    this.updateInfoAndProvider = updateInfoAndProvider
    this.log.info(`Installing pending update ${latestInfo.version} on launch`)
    // a failed install returns to idle (see endInstall): with the pending marker cleared above, autoInstallEvent: "onQuit"
    // or an explicit quitAndInstall can still install the cached update
    const isInstalled = await this.runInstallAsync(true, true, "launch")
    if (isInstalled) {
      setImmediate(() => this.app.quit())
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
    const isMarked = downloadedUpdateHelper.markInstallOnNextLaunchSync(this.log)
    if (isMarked) {
      this.log.info("Update is marked for install on next launch")
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
    this.registerHookOnce("quit", () => {
      this.addWillQuitHandler()
      this.app.onQuit(exitCode => this.handleQuit(exitCode))
      return true
    })
  }

  /**
   * Registers the handler of `hook` unless it is registered already. `register` returns whether it registered it: when
   * it could not (the app adapter or the target does not support it), a later call tries again.
   */
  private registerHookOnce(hook: LifecycleHook, register: () => boolean): void {
    if (this.registeredHooks.has(hook)) {
      return
    }
    this.registeredHooks.add(hook)
    if (!register()) {
      this.registeredHooks.delete(hook)
    }
  }

  /**
   * Why the quit handler has nothing to install: an install was triggered already, or no update finished downloading.
   * Checked before the exit code, see {@link handleQuit}.
   */
  private get installOnQuitUnavailableReason(): InstallOnQuitSkip | null {
    if (this.installState.kind !== "idle") {
      return { level: "info", message: "Update installer has already been triggered. Quitting application." }
    }
    if (this.isDownloadInProgress) {
      return { level: "info", message: "No update is installed on quit: the update has not finished downloading and verifying" }
    }
    if (this.installerPath == null) {
      return { level: "info", message: "No update is installed on quit: no update has finished downloading" }
    }
    return null
  }

  /**
   * Why the downloaded update is not installed on quit although there is one: it is not to be, or not now. Checked after
   * the exit code and the `"onNextLaunch"` deferral, see {@link handleQuit}.
   */
  private get installOnQuitSkipReason(): InstallOnQuitSkip | null {
    // autoInstallEvent may have been changed to "manual" after the quit handler was registered
    if (this.autoInstallEvent !== "onQuit") {
      return { level: "info", message: "Update will not be installed on quit because autoInstallEvent is not 'onQuit'." }
    }
    if (this.isSessionEnding) {
      return {
        level: "warn",
        message:
          "Update will not be installed on quit because the OS session is ending — the OS would kill the installer before it finishes and can leave the app in a broken state (https://github.com/electron-userland/electron-builder/issues/7807). The downloaded update stays cached and will be installed on the next quit. Set autoInstallEvent to 'onNextLaunch' (planned default in v28) to install it on the next launch instead.",
      }
    }
    if (this.isDownloadedUpdateSkippedOnQuit) {
      return { level: "info", message: "Update will not be installed on quit because installing it failed earlier in this session" }
    }
    return null
  }

  private handleQuit(exitCode: number): void {
    // it runs after a failed install on quit too, when the quit proceeds: logging must not throw
    const logger = this.log
    const unavailableReason = this.installOnQuitUnavailableReason
    if (unavailableReason != null) {
      logger[unavailableReason.level](unavailableReason.message)
      return
    }

    if (exitCode !== 0) {
      logger.info(`Update will be not installed on quit because application is quitting with exit code ${exitCode}`)
      return
    }

    if (this.autoInstallEvent === "onNextLaunch") {
      logger.info("Deferring update install to next launch because autoInstallEvent is 'onNextLaunch'")
      this.markPendingInstallOnNextLaunch()
      return
    }

    const skipReason = this.installOnQuitSkipReason
    if (skipReason != null) {
      logger[skipReason.level](skipReason.message)
      return
    }

    // with cancelQuitOnInstallFailure, will-quit installed already, unless the app adapter does not support it or the
    // app called app.exit(), which skips will-quit
    if (this.installOnQuit(logger) || !this.isQuitCancellable) {
      return
    }
    logger.warn(
      this.cancelQuitOnInstallFailure
        ? 'The update was not installed on quit, and an "error" event is emitted: the app quits without it, since this quit cannot be cancelled anymore (cancelQuitOnInstallFailure needs will-quit).'
        : 'The update was not installed on quit, and an "error" event is emitted: the app quits without it. Set cancelQuitOnInstallFailure to keep the app running instead.'
    )
  }

  /**
   * Installs the downloaded update on quit; returns whether it is installed. Never throws. When the install fails, no
   * later quit in this session tries to install that update again, and an explicit `quitAndInstall()` still can.
   */
  private installOnQuit(logger: Logger): boolean {
    logger.info("Auto install update on quit")
    const updateId = this.downloadedUpdateId
    let isInstalled = false
    try {
      isInstalled = this.install(true, false)
    } catch (error: unknown) {
      // install() reports a failed install itself; this is a failure to report it (an "error" listener that throws)
      logger.error(`Cannot install update on quit: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
    }
    if (!isInstalled) {
      // the failed install returned to idle, so an explicit quitAndInstall() can still install the update; a quit cannot
      this.skipInstallOnQuitUpdateId = updateId
    }
    return isInstalled
  }

  private addWillQuitHandler(): void {
    this.registerHookOnce("willQuit", () => {
      if (!this.isQuitCancellable || this.app.onWillQuit == null) {
        return false
      }
      this.app.onWillQuit(event => this.handleWillQuit(event))
      return true
    })
  }

  /**
   * Tells the downloaded update from another one (see `DownloadedUpdateHelper.downloadedUpdateId`): its sha512, or
   * the legacy sha2 checksum of update info that has no sha512.
   */
  private get downloadedUpdateId(): string | null {
    return this.downloadedUpdateHelper?.downloadedUpdateId ?? null
  }

  /** Whether no quit in this session installs the downloaded update, see {@link skipInstallOnQuitUpdateId}. */
  private get isDownloadedUpdateSkippedOnQuit(): boolean {
    const updateId = this.downloadedUpdateId
    return updateId != null && updateId === this.skipInstallOnQuitUpdateId
  }

  /** Whether the quit handler would install the downloaded update now; it logs why not, when not. */
  private get isInstallOnQuitDue(): boolean {
    return (
      // the quit handler is registered once a download started in this session
      this.registeredHooks.has("quit") && this.installOnQuitUnavailableReason == null && this.installOnQuitSkipReason == null
    )
  }

  /**
   * Runs on every quit that can still be cancelled (Electron's `will-quit`: after all windows closed, not for
   * `app.exit()`), for targets where {@link isQuitCancellable}. It never throws.
   * - While an install runs (an explicit `quitAndInstall()`, the install on launch), the quit waits for it: when it is
   *   cancelled, the update would be left half installed, and the app would not be relaunched. Once the install settled,
   *   the quit happens (see {@link endInstall}).
   * - With {@link cancelQuitOnInstallFailure}, the install on quit runs here rather than in the quit handler, which cannot
   *   cancel the quit. When it fails (the user dismissed the authentication dialog, for example), an `error` event is
   *   emitted and logged, and the quit is cancelled: the app keeps running, with its windows closed. No later quit in this
   *   session tries to install that update again; an explicit `quitAndInstall()` still can, and a different update
   *   downloaded later is installed on quit.
   *
   * Without that option, the install on quit runs in the quit handler ({@link handleQuit}), as on the other targets:
   * `quit` is only emitted once every `will-quit` listener let the quit through, while here only the listeners that ran
   * before this one can be seen to have cancelled it. With the option, a listener registered after this one (that is,
   * after the first update download or install started) that cancels the quit runs after the install.
   *
   * When the OS session ends, the quit proceeds as before. A quit that a `will-quit` listener called before this one
   * already cancelled (an app finishing async cleanup before it quits again, for example) is left alone: nothing is
   * installed and no quit is scheduled, the quit that follows does that.
   */
  private handleWillQuit(event: CancellableQuitEvent): void {
    const logger = this.log
    if (this.isSessionEnding) {
      return
    }

    const installState = this.installState
    // isInstallOnQuitDue is false while an install runs
    const isInstallOnQuitHere = this.cancelQuitOnInstallFailure && this.isInstallOnQuitDue
    // a custom app adapter may not tell: then the quit is taken as not cancelled
    if (event.defaultPrevented === true) {
      if (installState.kind === "installing" || isInstallOnQuitHere) {
        logger.info("The quit was cancelled by another will-quit listener: the update is installed on a quit that proceeds")
      }
      return
    }

    if (installState.kind === "installing") {
      event.preventDefault()
      if (!installState.isQuitDeferred) {
        installState.isQuitDeferred = true
        logger.info("Waiting for the update install to finish before quitting")
      }
      return
    }

    if (!isInstallOnQuitHere || this.installOnQuit(logger)) {
      return
    }

    // the "error" event was emitted already, while this quit can still be cancelled
    event.preventDefault()
    logger.warn(
      'The update was not installed on quit, so the quit is cancelled (cancelQuitOnInstallFailure): the app keeps running (its windows are already closed) and an "error" event is emitted. The next quit is not cancelled and does not try to install this update again; call quitAndInstall() to retry.'
    )
  }

  private addSessionEndHandler(): void {
    this.registerHookOnce("sessionEnd", () => {
      if (this.app.onSessionEnd == null) {
        return false
      }
      this.app.onSessionEnd(() => {
        this.isSessionEnding = true
        this.log.info("OS session is ending (shutdown/reboot/log off), install of the downloaded update on quit will be skipped")
      })
      return true
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
    this.log.info(`Executing: ${cmd} with args: ${args}`)
    const mergedEnv: NodeJS.ProcessEnv = { ...process.env, ...env }
    const response = spawnSync(useShell ? shellCommandLine(cmd, args) : cmd, useShell ? [] : args, {
      env: { ...mergedEnv, PATH: this.sanitizeEnvPath(mergedEnv.PATH ?? "") },
      encoding: "utf-8",
      shell: useShell,
    })

    const { error, status, signal, stdout, stderr } = response
    if (error != null) {
      this.log.error(stderr)
      throw error
    } else if (status !== 0) {
      // a command killed by a signal has no exit code, and did not succeed either
      this.log.error(stderr)
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
    this.log.info(`Executing: ${cmd} with args: ${args}`)
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
    const logger = this.log
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
