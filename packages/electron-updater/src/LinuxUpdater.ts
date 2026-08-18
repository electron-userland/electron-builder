import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter.js"
import { BaseUpdater } from "./BaseUpdater.js"
import { Logger } from "./types.js"

// Matches safe package manager names: alphanumeric, hyphens, underscores only.
// Rejects names with shell metacharacters that could cause command injection.
const SAFE_PM_REGEX = /^[a-zA-Z0-9_-]+$/

/**
 * An install plan: a list of alternatives, each a sequence of commands. The first alternative that succeeds
 * wins; the next one is attempted only when the previous failed. It exists so the commands of a package
 * manager are declared once and executed by both the synchronous on-quit path and the asynchronous one.
 */
export type InstallPlan = string[][][]

/** Runs an {@link InstallPlan} synchronously, for the on-quit path where an async install cannot be awaited. */
export function runInstallPlan(plan: InstallPlan, commandRunner: (commandWithArgs: string[]) => void, logger: Logger): void {
  for (let i = 0; i < plan.length; i++) {
    try {
      plan[i].forEach(commandRunner)
      return
    } catch (error: any) {
      if (i === plan.length - 1) {
        throw error
      }
      logger.warn(`${error.message ?? error} — trying the next install command`)
    }
  }
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
    return this.takesArgv(sudo[0]) ? "" : `"`
  }

  /**
   * {@link runCommandWithSudoIfNeeded} without blocking the main process, and without a shell wherever the
   * elevation helper accepts an argv array.
   *
   * pkexec and sudo do, so their authentication dialog shows the command being authorized
   * (`dpkg -i /path/app.deb`) instead of the `/bin/bash -c '…'` wrapper, the installer path needs no
   * escaping, and no `shell: true` deprecation applies. gksudo, kdesudo and beesu take the command as a
   * single string, so those keep the wrapped form.
   */
  protected async runCommandWithSudoIfNeededAsync(commandWithArgs: string[]): Promise<void> {
    if (this.isRunningAsRoot()) {
      this._logger.info("Running as root, no need to use sudo")
      await this.spawnAsyncLog(commandWithArgs[0], commandWithArgs.slice(1), {}, false)
      return
    }

    const sudo = this.sudoWithArgs(this.installComment())
    this._logger.info(`Running as non-root user, using sudo to install: ${sudo}`)
    const sudoArgs = sudo.length > 1 ? sudo.slice(1) : []

    if (this.takesArgv(sudo[0])) {
      await this.spawnAsyncLog(sudo[0], [...sudoArgs, ...commandWithArgs], {}, false)
      return
    }

    const wrapper = this.commandWrapperFor(sudo)
    await this.spawnAsyncLog(sudo[0], [...sudoArgs, `${wrapper}/bin/bash`, "-c", `'${commandWithArgs.join(" ")}'${wrapper}`])
  }

  /** Whether the elevation helper runs an argv array rather than a single command string. */
  private takesArgv(sudo: string): boolean {
    return /pkexec/i.test(sudo) || sudo === "sudo"
  }

  /**
   * The installer path for the asynchronous path: unescaped when the command is passed as argv, escaped when
   * it still goes through the `/bin/bash -c` wrapper.
   */
  protected get asyncInstallerPath(): string | null {
    return this.isRunningAsRoot() || this.takesArgv(this.determineSudoCommand()) ? this.rawInstallerPath : this.installerPath
  }

  /**
   * Runs an install plan: the first sequence of commands that succeeds wins, the next one is only attempted
   * when the previous failed. Both install paths share it so the commands themselves live in one place.
   */
  protected async runInstallPlanWithSudoIfNeededAsync(plan: InstallPlan): Promise<void> {
    for (let i = 0; i < plan.length; i++) {
      try {
        for (const command of plan[i]) {
          await this.runCommandWithSudoIfNeededAsync(command)
        }
        return
      } catch (error: any) {
        if (i === plan.length - 1) {
          throw error
        }
        this._logger.warn(`${error.message ?? error} — trying the next install command`)
      }
    }
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
