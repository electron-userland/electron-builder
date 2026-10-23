import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter.js"
import { BaseUpdater, InstallOptions } from "./BaseUpdater.js"
import { Logger } from "./types.js"
import { nonThrowingLogger } from "./util.js"

// Matches safe package manager names: alphanumeric, hyphens, underscores only.
// Rejects names with shell metacharacters that could cause command injection.
const SAFE_PM_REGEX = /^[a-zA-Z0-9_-]+$/

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

  protected runCommandWithSudoIfNeeded(commandWithArgs: string[]) {
    if (this.isRunningAsRoot()) {
      this._logger.info("Running as root, no need to use sudo")
      return this.spawnSyncLog(commandWithArgs[0], commandWithArgs.slice(1))
    }

    const sudo = this.sudoWithArgs(this.installComment())
    this._logger.info(`Running as non-root user, using sudo to install: ${sudo}`)
    const wrapper = this.commandWrapperFor(sudo)
    return this.spawnSyncLog(sudo[0], [...(sudo.length > 1 ? sudo.slice(1) : []), `${wrapper}/bin/bash`, "-c", `'${commandWithArgs.join(" ")}'${wrapper}`])
  }

  private installComment(): string {
    // Strip characters that could break shell quoting in the sudo dialog comment string
    const safeName = this.app.name.replace(/["`$\\!\n\r;|&<>(){}*?[\]#~]/g, "")
    return `"${safeName} would like to update"`
  }

  private commandWrapperFor(sudo: string[]): string {
    // some sudo commands dont want the command to be wrapped in " quotes
    return /pkexec/i.test(sudo[0]) || sudo[0] === "sudo" ? "" : `"`
  }

  /** {@link runCommandWithSudoIfNeeded} without blocking the main process while the elevation dialog is open. */
  protected async runCommandWithSudoIfNeededAsync(commandWithArgs: string[]): Promise<void> {
    if (this.isRunningAsRoot()) {
      this._logger.info("Running as root, no need to use sudo")
      await this.spawnAsyncLog(commandWithArgs[0], commandWithArgs.slice(1))
      return
    }

    const sudo = this.sudoWithArgs(this.installComment())
    this._logger.info(`Running as non-root user, using sudo to install: ${sudo}`)
    const wrapper = this.commandWrapperFor(sudo)
    await this.spawnAsyncLog(sudo[0], [...(sudo.length > 1 ? sudo.slice(1) : []), `${wrapper}/bin/bash`, "-c", `'${commandWithArgs.join(" ")}'${wrapper}`])
  }

  /**
   * The {@link InstallPlan} that installs the downloaded package at `installerPath`. Throws when the package cannot
   * be installed on this system (no supported package manager).
   */
  protected abstract resolveInstallPlan(installerPath: string): InstallPlan

  // must be sync (on-quit install)
  protected doInstall(options: InstallOptions): boolean {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }
    try {
      runInstallPlan(this.resolveInstallPlan(installerPath), commandWithArgs => this.runCommandWithSudoIfNeeded(commandWithArgs), this._logger)
    } catch (error: unknown) {
      this.dispatchError(error instanceof Error ? error : new Error(String(error)))
      return false
    }
    if (options.isForceRunAfter) {
      this.app.relaunch()
    }
    return true
  }

  /** {@link doInstall} without blocking the main process while the elevation dialog is open. */
  protected async doInstallAsync(options: InstallOptions): Promise<boolean> {
    const installerPath = this.installerPath
    if (installerPath == null) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"))
      return false
    }
    try {
      await runInstallPlanAsync(this.resolveInstallPlan(installerPath), commandWithArgs => this.runCommandWithSudoIfNeededAsync(commandWithArgs), this._logger)
    } catch (error: unknown) {
      this.dispatchError(error instanceof Error ? error : new Error(String(error)))
      return false
    }
    if (options.isForceRunAfter) {
      this.app.relaunch()
    }
    return true
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
    const sudos = ["gksudo", "kdesudo", "pkexec", "beesu"]
    for (const sudo of sudos) {
      if (this.hasCommand(sudo)) {
        return sudo
      }
    }
    return "sudo"
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
