import { AllPublishOptions, newError } from "builder-util-runtime"
import { accessSync, constants as fsConstants, realpathSync, statSync } from "fs"
import * as path from "path"
import { AppAdapter } from "./AppAdapter.js"
import { BaseUpdater, CommandExitError, InstallOptions } from "./BaseUpdater.js"
import { Logger } from "./types.js"
import { nonThrowingLogger } from "./util.js"

// Matches safe package manager names: alphanumeric, hyphens, underscores only.
// Rejects names with shell metacharacters that could cause command injection.
const SAFE_PM_REGEX = /^[a-zA-Z0-9_-]+$/

/**
 * Where a privileged command passed as argv is looked up. An elevation helper resolves a relative program name with the
 * caller's PATH, which can hold user-writable directories (`~/.local/bin`): a program planted there would run as root
 * once the user authenticates. A relative name is resolved in these system directories instead.
 */
const TRUSTED_COMMAND_DIRS: readonly string[] = ["/usr/sbin", "/usr/bin", "/sbin", "/bin"]

/** The directories that `dirs` resolve to, following symlinks (`/bin` is `/usr/bin` on merged-/usr systems). */
function realDirs(dirs: readonly string[]): string[] {
  const result: string[] = []
  for (const dir of dirs) {
    try {
      result.push(realpathSync(dir))
    } catch {
      // a directory this system does not have
    }
  }
  return result
}

function isWithin(file: string, dir: string): boolean {
  const relative = path.relative(dir, file)
  return relative.length !== 0 && !relative.startsWith("..") && !path.isAbsolute(relative)
}

/**
 * Whether `candidate` is an executable regular file that, symlinks followed, still lies in one of `trustedRealDirs`.
 * Symlinks are allowed: package managers are commonly reached through one (`/bin` → `/usr/bin` on merged-/usr systems,
 * `/usr/bin/dnf` → `dnf5`), and only root can create one in a trusted directory; the target has to be trusted as well.
 */
function isTrustedExecutable(candidate: string, trustedRealDirs: readonly string[]): boolean {
  try {
    const real = realpathSync(candidate)
    if (!trustedRealDirs.some(dir => isWithin(real, dir)) || !statSync(real).isFile()) {
      return false
    }
    accessSync(real, fsConstants.X_OK)
    return true
  } catch {
    // missing, or not executable
    return false
  }
}

/**
 * How an install runs a privileged command, resolved once per install so that the installer path
 * escaping and the way the command is spawned cannot disagree.
 * - `root`: no elevation needed; the command is spawned directly, as argv.
 * - `argv`: the helper (pkexec, sudo) takes the command as an argv array, so no shell and no escaping are involved.
 * - `wrapped`: the helper (gksudo, kdesudo, beesu) takes a single command string: `/bin/bash -c '…'` and an escaped path.
 */
export type Elevation = { readonly kind: "root" } | { readonly kind: "argv" | "wrapped"; readonly helper: string[] }

/**
 * The installer paths that can be passed to a `wrapped` helper: characters that none of the parsers of its command string
 * treats specially. These are ASCII letters, digits and `._/+,:=@%-`, and every non-ASCII character except the controls,
 * format characters (bidi and zero-width ones among them), surrogates, private-use and unassigned code points (`\p{C}`)
 * and the separators (`\p{Z}`: Unicode spaces, U+2028 and U+2029). The UTF-8 bytes of a non-ASCII character are all 0x80
 * or above, which no shell treats specially; a separator is refused as a tokenizer that splits on Unicode whitespace
 * would split the path there.
 */
const WRAPPED_SAFE_PATH = /^(?:[A-Za-z0-9._/+,:=@%-]|[^\p{C}\p{Z}\p{ASCII}])+$/u
/** {@link WRAPPED_SAFE_PATH} and a space, which kdesudo's `sh -c` keeps in one word once it is backslash-escaped. */
const KDESUDO_SAFE_PATH = /^(?:[A-Za-z0-9._/+,:=@% -]|[^\p{C}\p{Z}\p{ASCII}])+$/u
const UNSAFE_INSTALLER_PATH_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#linux-gksudo-kdesudo-and-beesu-refuse-unsafe-installer-paths"

/**
 * Throws when `rawPath` cannot be passed to `helper`, a `wrapped` elevation helper. The install command reaches it as one
 * string that is parsed several times: by the `/bin/sh -c` of `shell: true`, inside the double-quoted wrapper (where `\$`
 * and `` \` `` lose their backslash), then by gksu's own tokenizer (which drops every backslash and splits on spaces) or
 * kdesudo's `sh -c`, then by `/bin/bash -c`. No escaping is right for all of them, so the path may only hold characters
 * that none of them treats specially. How beesu parses the string is not known, so it gets no space either.
 */
function checkWrappedInstallerPath(helper: string, rawPath: string): void {
  const safePath = /kdesudo/i.test(helper) ? KDESUDO_SAFE_PATH : WRAPPED_SAFE_PATH
  if (!safePath.test(rawPath)) {
    throw newError(
      `${helper} takes the install command as a single string, and the installer path ${JSON.stringify(rawPath)} contains characters that cannot be passed through it safely, so electron-updater does not install it. To install this update, install polkit (pkexec). See ${UNSAFE_INSTALLER_PATH_DOCS}`,
      "ERR_UPDATER_UNSAFE_INSTALLER_PATH"
    )
  }
}

/**
 * The commands that install a package, declared once per package manager so that the synchronous on-quit install
 * and the asynchronous one run exactly the same thing.
 *
 * `execCommand` runs first. Only if it fails, the `recoveryChain` runs, step by step; each step is itself a plan that
 * can declare its own recovery. The install fails when `execCommand` fails without a recovery chain, or when a step of
 * the recovery chain fails. A command the elevation helper refused to run ({@link ElevationDeniedError}) ends the
 * install at once, without recovery.
 */
export interface InstallPlan {
  /** The command and its arguments. */
  readonly execCommand: string[]
  /** Logged when {@link execCommand} failed, before the {@link recoveryChain} runs. */
  readonly recoveryMessage?: string
  /** Run in order, only when {@link execCommand} failed. */
  readonly recoveryChain?: InstallPlan[]
}

/**
 * A privileged command that did not run because the elevation helper refused to run it: the authentication dialog
 * was dismissed, or authorization was not obtained. Ends the {@link InstallPlan} without its recovery chain, which would
 * only show the authentication dialog again.
 */
export class ElevationDeniedError extends Error {
  constructor(
    /** The helper's failure, as {@link BaseUpdater.spawnSyncLog} or {@link BaseUpdater.spawnAsyncLog} reported it. */
    readonly commandError: CommandExitError,
    /** The helper's exit code: 126 or 127, see {@link elevationDenial}. */
    readonly exitCode: number
  ) {
    super(`${commandError.message} (${exitCode === 126 ? "the authentication dialog was dismissed" : "authorization was not obtained"}), the update is not installed`)
    this.name = "ElevationDeniedError"
  }
}

/**
 * The {@link ElevationDeniedError} that `error` stands for, or `null` when the command itself failed.
 *
 * Only pkexec, in the `argv` mode where it runs the package manager itself, reports a refusal with exit codes of its
 * own (pkexec(1)): 126 when the authentication dialog was dismissed, 127 when the caller is not authorized, the
 * authentication failed or pkexec failed itself. Otherwise it exits with the package manager's code, and none of the
 * package managers installed with (dpkg, apt, apt-get, dnf, yum, zypper, rpm, pacman) exits with 126 or 127. The
 * shell's 126/127 (not executable, command not found) cannot be mistaken for it: the command is a resolved absolute
 * path, passed as argv without a shell.
 *
 * sudo exits with 1 when the authentication fails, the same code a failing dpkg exits with, and gksudo, kdesudo and
 * beesu run the command through `/bin/bash -c`, where 126 and 127 are the shell's: neither tells a refusal apart from a
 * failed command, so their failures keep running the recovery chain.
 */
function elevationDenial(error: unknown, elevation: Elevation): ElevationDeniedError | null {
  if (elevation.kind !== "argv" || !(error instanceof CommandExitError)) {
    return null
  }
  const [helper] = elevation.helper
  if (helper == null || !/pkexec/i.test(helper)) {
    return null
  }
  return error.exitCode === 126 || error.exitCode === 127 ? new ElevationDeniedError(error, error.exitCode) : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Walks an {@link InstallPlan}: yields each command to run, and expects a failed command to be reported back with
 * `throw()`. The recovery logic lives here only, so {@link runInstallPlan} and {@link runInstallPlanAsync} differ in
 * nothing but whether they await the command.
 */
function* installPlanCommands(plan: InstallPlan, logger: Logger): Generator<string[], void, void> {
  try {
    yield plan.execCommand
  } catch (error: unknown) {
    const recoveryChain = plan.recoveryChain ?? []
    // the recovery steps are elevated as well: after a dismissed dialog, they would only show it again
    if (recoveryChain.length === 0 || error instanceof ElevationDeniedError) {
      throw error
    }
    logger.warn(errorMessage(error))
    logger.warn(plan.recoveryMessage ?? `${plan.execCommand[0]} failed, attempting recovery`)
    try {
      for (const step of recoveryChain) {
        yield* installPlanCommands(step, logger)
      }
    } catch (recoveryError: unknown) {
      logger.error(`Recovery after ${plan.execCommand[0]} failed`)
      throw recoveryError
    }
  }
}

/** Runs an {@link InstallPlan} synchronously, for the on-quit path where an async install cannot be awaited. */
export function runInstallPlan(plan: InstallPlan, commandRunner: (commandWithArgs: string[]) => unknown, logger: Logger): void {
  const commands = installPlanCommands(plan, nonThrowingLogger(logger))
  let next = commands.next()
  while (!next.done) {
    let failure: { error: unknown } | null = null
    try {
      commandRunner(next.value)
    } catch (error: unknown) {
      failure = { error }
    }
    next = failure == null ? commands.next() : commands.throw(failure.error)
  }
}

/** {@link runInstallPlan} for a command runner that does not block the main process. */
export async function runInstallPlanAsync(plan: InstallPlan, commandRunner: (commandWithArgs: string[]) => Promise<unknown>, logger: Logger): Promise<void> {
  const commands = installPlanCommands(plan, nonThrowingLogger(logger))
  let next = commands.next()
  while (!next.done) {
    let failure: { error: unknown } | null = null
    try {
      await commandRunner(next.value)
    } catch (error: unknown) {
      failure = { error }
    }
    next = failure == null ? commands.next() : commands.throw(failure.error)
  }
}

/** Narrows a detected package manager name to the ones a target supports. */
export function isSupportedPackageManager<T extends string>(packageManager: string, supported: readonly T[]): packageManager is T {
  return (supported as readonly string[]).includes(packageManager)
}

export abstract class LinuxUpdater extends BaseUpdater {
  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app)
  }

  // doInstall runs the install plan to its end before it returns, so the install on quit can run from will-quit
  protected get isQuitCancellable(): boolean {
    return true
  }

  /**
   * Returns true if the current process is running as root.
   */
  protected isRunningAsRoot(): boolean {
    return process.getuid?.() === 0
  }

  /**
   * Sanitizes the installer path for use with shell:true spawn calls.
   * Backslash-escapes metacharacters that have special meaning in POSIX shell.
   * Note: this is not enough for the command string of a wrapped helper (gksudo, kdesudo, beesu), so an install with one
   * of those refuses a path with an ASCII character other than letters, digits, `._/+,:=@%-` and, for kdesudo, a space,
   * or with a non-ASCII control, format or separator character (see {@link WRAPPED_SAFE_PATH}).
   */
  protected get installerPath(): string | null {
    const raw = super.installerPath
    if (raw == null) {
      return null
    }
    return raw
      .replace(/\\/g, "\\\\") // must come first
      .replace(/([`$!" ;|&()<>])/g, "\\$1")
      .replace(/[\n\r]/g, "")
  }

  /**
   * The installer path as downloaded. {@link installerPath} escapes shell metacharacters, which is only
   * correct when the command goes through a shell — passed as an argv element, the escapes would reach the
   * package manager literally.
   */
  protected get rawInstallerPath(): string | null {
    return super.installerPath
  }

  /**
   * Runs a privileged command synchronously, for the on-quit install: the app exits as soon as the quit handler returns,
   * so the command has to have finished by then. Spawned exactly as {@link runCommandWithSudoIfNeededAsync} spawns it.
   */
  protected runCommandWithSudoIfNeeded(commandWithArgs: string[], elevation: Elevation): void {
    const { cmd, args, useShell } = this.elevatedCommand(commandWithArgs, elevation)
    try {
      this.spawnSyncLog(cmd, args, {}, useShell)
    } catch (error: unknown) {
      throw elevationDenial(error, elevation) ?? error
    }
  }

  private installComment(): string {
    // Strip characters that could break shell quoting in the sudo dialog comment string
    const safeName = this.app.name.replace(/["`$\\!\n\r;|&<>(){}*?[\]#~]/g, "")
    return `"${safeName} would like to update"`
  }

  private commandWrapperFor(sudo: string[]): string {
    // some sudo commands dont want the command to be wrapped in " quotes
    return this.takesArgv(sudo[0]) ? "" : `"`
  }

  /** Whether the elevation helper runs an argv array rather than a single command string. */
  private takesArgv(sudo: string): boolean {
    return /pkexec/i.test(sudo) || sudo === "sudo"
  }

  /** Determines once per install how {@link runCommandWithSudoIfNeeded} and {@link runCommandWithSudoIfNeededAsync} run privileged commands. */
  protected resolveElevation(): Elevation {
    if (this.isRunningAsRoot()) {
      this.log.info("Running as root, no need to use sudo")
      return { kind: "root" }
    }
    const helper = this.sudoWithArgs(this.installComment())
    this.log.info(`Running as non-root user, using sudo to install: ${helper}`)
    return { kind: this.takesArgv(helper[0]) ? "argv" : "wrapped", helper }
  }

  /** Where {@link resolveTrustedCommand} looks up a command name: {@link TRUSTED_COMMAND_DIRS}. Overridden by tests only. */
  protected get trustedCommandDirs(): readonly string[] {
    return TRUSTED_COMMAND_DIRS
  }

  /**
   * Resolves a relative command name in {@link trustedCommandDirs}, for a command run by an elevation helper: the first
   * executable regular file of that name, which, symlinks followed, lies in a trusted directory as well. Only a bare name is looked up: one with a `/`, `.` and `..` would reach outside those directories. Throws when
   * it is not found there; the install plan treats that as a failed command.
   */
  protected resolveTrustedCommand(command: string): string {
    if (path.isAbsolute(command)) {
      return command
    }
    const dirs = this.trustedCommandDirs
    if (command.length === 0 || command === "." || command === ".." || command.includes("/") || command.includes("\0")) {
      throw new Error(`${JSON.stringify(command)} is not a command name, it cannot be looked up in ${dirs.join(":")}`)
    }
    const trustedRealDirs = realDirs(dirs)
    for (const dir of dirs) {
      const candidate = path.join(dir, command)
      if (isTrustedExecutable(candidate, trustedRealDirs)) {
        return candidate
      }
    }
    throw new Error(`${command} not found in ${dirs.join(":")}`)
  }

  /**
   * The program, arguments and shell use that run `commandWithArgs` with `elevation`. The synchronous (on-quit) and the
   * asynchronous install both spawn what this returns, so the authentication dialog shows the same command for both.
   *
   * pkexec and sudo take an argv array: no shell is involved, so their authentication dialog shows the command being
   * authorized (`/usr/bin/dpkg -i /path/app.deb`) instead of a `/bin/bash -c '…'` wrapper, the installer path needs no
   * escaping, and no `shell: true` deprecation applies. gksudo, kdesudo and beesu take the command as a single string, so
   * those keep the wrapped form, which goes through a shell. Its root command runs the package manager by the absolute path
   * {@link resolveTrustedCommand} found, and `env -i` starts `/bin/bash` with an empty environment but for a PATH of
   * {@link TRUSTED_COMMAND_DIRS}: whatever of the app's environment the helper passes on to root (`BASH_ENV`, which
   * `bash -c` sources, `ENV`, `LD_PRELOAD`, `PYTHONPATH` …) reaches neither the shell nor the package manager.
   */
  protected elevatedCommand(commandWithArgs: string[], elevation: Elevation): { cmd: string; args: string[]; useShell: boolean } {
    const [command, ...args] = commandWithArgs
    if (elevation.kind === "root") {
      return { cmd: command, args, useShell: false }
    }

    const [sudo, ...sudoArgs] = elevation.helper
    if (elevation.kind === "argv") {
      return { cmd: sudo, args: [...sudoArgs, this.resolveTrustedCommand(command), ...args], useShell: false }
    }

    const wrapper = this.commandWrapperFor(elevation.helper)
    const rootCommand = [this.resolveTrustedCommand(command), ...args].join(" ")
    const cleanEnv = ["-i", `PATH=${TRUSTED_COMMAND_DIRS.join(":")}`]
    return { cmd: sudo, args: [...sudoArgs, `${wrapper}/usr/bin/env`, ...cleanEnv, "/bin/bash", "-c", `'${rootCommand}'${wrapper}`], useShell: true }
  }

  /** {@link runCommandWithSudoIfNeeded} without blocking the main process while the elevation dialog is open. */
  protected async runCommandWithSudoIfNeededAsync(commandWithArgs: string[], elevation: Elevation): Promise<void> {
    const { cmd, args, useShell } = this.elevatedCommand(commandWithArgs, elevation)
    try {
      await this.spawnAsyncLog(cmd, args, {}, useShell)
    } catch (error: unknown) {
      throw elevationDenial(error, elevation) ?? error
    }
  }

  /**
   * The {@link InstallPlan} that installs the downloaded package at `installerPath`. Throws when the package cannot
   * be installed on this system (no supported package manager).
   */
  protected abstract resolveInstallPlan(installerPath: string): InstallPlan

  /**
   * Resolves once per install how its commands are elevated, and the plan they run. The installer path is only escaped
   * when the commands go through the `/bin/bash -c` wrapper; as an argv element the escapes would reach the package
   * manager literally. Throws when the package cannot be installed, or when its path cannot be passed safely to a wrapped
   * helper.
   */
  private prepareInstall(): { elevation: Elevation; plan: InstallPlan } {
    const elevation = this.resolveElevation()
    const rawInstallerPath = this.rawInstallerPath
    const installerPath = elevation.kind === "wrapped" ? this.installerPath : rawInstallerPath
    if (installerPath == null || rawInstallerPath == null) {
      throw new Error("No update filepath provided, can't quit and install")
    }
    if (elevation.kind === "wrapped") {
      checkWrappedInstallerPath(elevation.helper[0], rawInstallerPath)
    }
    return { elevation, plan: this.resolveInstallPlan(installerPath) }
  }

  private finishInstall(options: InstallOptions): boolean {
    if (options.isForceRunAfter) {
      this.app.relaunch()
    }
    return true
  }

  // must be sync (on-quit install)
  protected doInstall(options: InstallOptions): boolean {
    if (this.installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }
    try {
      const { elevation, plan } = this.prepareInstall()
      runInstallPlan(plan, commandWithArgs => this.runCommandWithSudoIfNeeded(commandWithArgs, elevation), this.log)
    } catch (error: unknown) {
      // on quit, an "error" listener that shows the error has no window left to show it in: the updater's own "error"
      // listener logs it, as for the async install
      this.dispatchError(error instanceof Error ? error : new Error(String(error)))
      return false
    }
    return this.finishInstall(options)
  }

  /** {@link doInstall} without blocking the main process while the elevation dialog is open. */
  protected async doInstallAsync(options: InstallOptions): Promise<boolean> {
    if (this.installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }
    try {
      const { elevation, plan } = this.prepareInstall()
      await runInstallPlanAsync(plan, commandWithArgs => this.runCommandWithSudoIfNeededAsync(commandWithArgs, elevation), this.log)
    } catch (error: unknown) {
      this.dispatchError(error instanceof Error ? error : new Error(String(error)))
      return false
    }
    return this.finishInstall(options)
  }

  protected sudoWithArgs(installComment: string): string[] {
    const sudo = this.determineSudoCommand()
    const command = [sudo]
    if (/kdesudo/i.test(sudo)) {
      command.push("--comment", installComment)
      command.push("-c")
    } else if (/gksudo/i.test(sudo)) {
      command.push("--message", installComment)
    } else if (/pkexec/i.test(sudo)) {
      command.push("--disable-internal-agent")
    }
    return command
  }

  protected hasCommand(cmd: string): boolean {
    try {
      this.spawnSyncLog(`command`, ["-v", cmd])
      return true
    } catch {
      return false
    }
  }

  protected determineSudoCommand(): string {
    // pkexec first: it is the maintained, polkit-based mechanism, it is the only helper here that takes an
    // argv array (so the dialog shows the install command and the path needs no escaping), and it works under
    // Wayland. gksudo and kdesudo are unmaintained and were removed from Debian and Ubuntu; they stay as
    // fallbacks for systems without polkit.
    const sudos = ["pkexec", "gksudo", "kdesudo", "beesu"]
    for (const sudo of sudos) {
      if (this.hasCommand(sudo)) {
        if (sudo === "pkexec") {
          this.announceSkippedLegacyHelpers()
        }
        return sudo
      }
    }
    return "sudo"
  }

  private legacyHelpersChecked = false

  // once per updater: on a system that also has gksudo or kdesudo, the authentication prompt comes from polkit
  private announceSkippedLegacyHelpers(): void {
    if (this.legacyHelpersChecked) {
      return
    }
    this.legacyHelpersChecked = true
    const installed = ["gksudo", "kdesudo"].filter(helper => this.hasCommand(helper))
    if (installed.length !== 0) {
      this.log.info(`Elevating the install with pkexec (polkit); ${installed.join(" and ")} ${installed.length === 1 ? "is" : "are"} only used on systems without polkit`)
    }
  }

  /**
   * Detects the package manager to use based on the available commands.
   * Allows overriding the default behavior by setting the ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER environment variable.
   * If the environment variable is set, it will be used directly. (This is useful for testing each package manager logic path.)
   * Otherwise, it checks for the presence of the specified package manager commands in the order provided.
   * @param pms - An array of package manager commands to check for, in priority order.
   * @returns The detected package manager command or "unknown" if none are found.
   */
  protected detectPackageManager(pms: string[]): string {
    let availablePMs = pms
    const pmOverride = process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER?.trim()
    if (pmOverride) {
      if (!SAFE_PM_REGEX.test(pmOverride)) {
        this.log.warn(`ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER "${pmOverride}" contains unsafe characters. Ignoring override.`)
      } else {
        availablePMs = [pmOverride]
      }
    }
    // Check for the package manager in the order of priority
    for (const pm of availablePMs) {
      if (this.hasCommand(pm)) {
        return pm
      }
    }
    // return the first/default package manager in the original list if none are found, this will throw upstream for proper logging
    const searchList = pmOverride ? `ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER override "${pmOverride}", ` : ""
    const defaultPM = pms[0]
    this.log.warn(`No package manager found in the list: ${searchList}${pms.join(", ")}. Utilizing default: ${defaultPM}`)
    return defaultPM
  }
}
