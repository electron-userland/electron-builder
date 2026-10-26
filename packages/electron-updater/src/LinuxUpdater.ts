import { AllPublishOptions } from "builder-util-runtime"
import { accessSync, constants as fsConstants } from "fs"
import * as path from "path"
import { AppAdapter } from "./AppAdapter.js"
import { BaseUpdater, InstallOptions } from "./BaseUpdater.js"
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
const TRUSTED_COMMAND_DIRS = ["/usr/sbin", "/usr/bin", "/sbin", "/bin"]

/**
 * How an install runs a privileged command, resolved once per install so that the installer path
 * escaping and the way the command is spawned cannot disagree.
 * - `root`: no elevation needed; the command is spawned directly, as argv.
 * - `argv`: the helper (pkexec, sudo) takes the command as an argv array, so no shell and no escaping are involved.
 * - `wrapped`: the helper (gksudo, kdesudo, beesu) takes a single command string: `/bin/bash -c '…'` and an escaped path.
 */
export type Elevation = { readonly kind: "root" } | { readonly kind: "argv" | "wrapped"; readonly helper: string[] }

/**
 * The commands that install a package, declared once per package manager so that the synchronous on-quit install
 * and the asynchronous one run exactly the same thing.
 *
 * `execCommand` runs first. Only if it fails, the `recoveryChain` runs, step by step; each step is itself a plan that
 * can declare its own recovery. The install fails when `execCommand` fails without a recovery chain, or when a step of
 * the recovery chain fails.
 */
export interface InstallPlan {
  /** The command and its arguments. */
  readonly execCommand: string[]
  /** Logged when {@link execCommand} failed, before the {@link recoveryChain} runs. */
  readonly recoveryMessage?: string
  /** Run in order, only when {@link execCommand} failed. */
  readonly recoveryChain?: InstallPlan[]
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
    if (recoveryChain.length === 0) {
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

  /**
   * Returns true if the current process is running as root.
   */
  protected isRunningAsRoot(): boolean {
    return process.getuid?.() === 0
  }

  /**
   * Sanitizes the installer path for use with shell:true spawn calls.
   * Backslash-escapes metacharacters that have special meaning in POSIX shell.
   * Note: paths containing single-quotes (') are not supported.
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
    this.spawnSyncLog(cmd, args, {}, useShell)
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
      this._logger.info("Running as root, no need to use sudo")
      return { kind: "root" }
    }
    const helper = this.sudoWithArgs(this.installComment())
    this._logger.info(`Running as non-root user, using sudo to install: ${helper}`)
    return { kind: this.takesArgv(helper[0]) ? "argv" : "wrapped", helper }
  }

  /**
   * Resolves a relative command name in {@link TRUSTED_COMMAND_DIRS}, for a command passed as argv to an elevation
   * helper. Throws when it is not found there; the install plan treats that as a failed command.
   */
  protected resolveTrustedCommand(command: string): string {
    if (path.isAbsolute(command)) {
      return command
    }
    for (const dir of TRUSTED_COMMAND_DIRS) {
      const candidate = path.join(dir, command)
      try {
        accessSync(candidate, fsConstants.X_OK)
        return candidate
      } catch {
        // not in this directory
      }
    }
    throw new Error(`${command} not found in ${TRUSTED_COMMAND_DIRS.join(":")}`)
  }

  /**
   * The program, arguments and shell use that run `commandWithArgs` with `elevation`. The synchronous (on-quit) and the
   * asynchronous install both spawn what this returns, so the authentication dialog shows the same command for both.
   *
   * pkexec and sudo take an argv array: no shell is involved, so their authentication dialog shows the command being
   * authorized (`/usr/bin/dpkg -i /path/app.deb`) instead of a `/bin/bash -c '…'` wrapper, the installer path needs no
   * escaping, and no `shell: true` deprecation applies. gksudo, kdesudo and beesu take the command as a single string, so
   * those keep the wrapped form, which goes through a shell.
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
    return { cmd: sudo, args: [...sudoArgs, `${wrapper}/bin/bash`, "-c", `'${commandWithArgs.join(" ")}'${wrapper}`], useShell: true }
  }

  /** {@link runCommandWithSudoIfNeeded} without blocking the main process while the elevation dialog is open. */
  protected async runCommandWithSudoIfNeededAsync(commandWithArgs: string[], elevation: Elevation): Promise<void> {
    const { cmd, args, useShell } = this.elevatedCommand(commandWithArgs, elevation)
    await this.spawnAsyncLog(cmd, args, {}, useShell)
  }

  /**
   * The {@link InstallPlan} that installs the downloaded package at `installerPath`. Throws when the package cannot
   * be installed on this system (no supported package manager).
   */
  protected abstract resolveInstallPlan(installerPath: string): InstallPlan

  /**
   * Resolves once per install how its commands are elevated, and the plan they run. The installer path is only escaped
   * when the commands go through the `/bin/bash -c` wrapper; as an argv element the escapes would reach the package
   * manager literally. Throws when the package cannot be installed.
   */
  private prepareInstall(): { elevation: Elevation; plan: InstallPlan } {
    const elevation = this.resolveElevation()
    const installerPath = elevation.kind === "wrapped" ? this.installerPath : this.rawInstallerPath
    if (installerPath == null) {
      throw new Error("No update filepath provided, can't quit and install")
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
      runInstallPlan(plan, commandWithArgs => this.runCommandWithSudoIfNeeded(commandWithArgs, elevation), this._logger)
    } catch (error: unknown) {
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
      await runInstallPlanAsync(plan, commandWithArgs => this.runCommandWithSudoIfNeededAsync(commandWithArgs, elevation), this._logger)
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
      this._logger.info(`Elevating the install with pkexec (polkit); ${installed.join(" and ")} ${installed.length === 1 ? "is" : "are"} only used on systems without polkit`)
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
        this._logger.warn(`ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER "${pmOverride}" contains unsafe characters. Ignoring override.`)
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
    this._logger.warn(`No package manager found in the list: ${searchList}${pms.join(", ")}. Utilizing default: ${defaultPM}`)
    return defaultPM
  }
}
