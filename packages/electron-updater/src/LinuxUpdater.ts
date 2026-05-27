import { AllPublishOptions } from "builder-util-runtime"
import { spawnSync } from "child_process"
import { AppAdapter } from "./AppAdapter"
import { BaseUpdater } from "./BaseUpdater"

/** POSIX-safe single-quoting: wraps `arg` in single quotes and escapes any
 *  embedded single quotes using the `'\''` idiom.  The result is safe to embed
 *  in a shell command string (e.g. `kdesudo -c '...'`).
 */
function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`
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

  protected runCommandWithSudoIfNeeded(commandWithArgs: string[]) {
    if (this.isRunningAsRoot()) {
      this._logger.info("Running as root, no need to use sudo")
      return this.spawnSyncLog(commandWithArgs[0], commandWithArgs.slice(1))
    }

    const { name } = this.app
    // Strip characters with shell/dialog-injection potential from the app name
    // before embedding it in the privilege-escalation prompt string.
    const safeComment = name.replace(/[^\w\s._-]/g, " ").trim()
    const installComment = `${safeComment} would like to update`
    const sudo = this.sudoWithArgs(installComment)
    this._logger.info(`Running as non-root user, using ${sudo[0]} to install`)

    if (/kdesudo/i.test(sudo[0])) {
      // kdesudo accepts a single shell-command string after -c.
      // Shell-quote every argument individually to prevent injection.
      const shellCmd = commandWithArgs.map(arg => shellQuote(arg)).join(" ")
      return this.spawnSyncLog(sudo[0], [...sudo.slice(1), shellCmd])
    }

    // pkexec, sudo, gksudo, beesu: command + args are separate process
    // arguments passed directly to execvp() — no shell, no injection surface.
    return this.spawnSyncLog(sudo[0], [...sudo.slice(1), ...commandWithArgs])
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
    // Use "which" (a standalone binary) rather than the shell builtin "command -v"
    // so this works when spawnSyncLog does not invoke a shell on Unix.
    const result = spawnSync("which", [cmd], { encoding: "utf-8" })
    return result.status === 0
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
   * If the environment variable is set, it will be validated against a plain-name allowlist and used directly.
   * (This is useful for testing each package manager logic path.)
   * Otherwise, it checks for the presence of the specified package manager commands in the order provided.
   * @param pms - An array of package manager commands to check for, in priority order.
   * @returns The detected package manager command or the first entry if none are found.
   */
  protected detectPackageManager(pms: string[]): string {
    const pmOverride = process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER?.trim()
    if (pmOverride) {
      // Guard against command injection: the value must be a plain command name
      // (letters, digits, hyphens, underscores only — no paths, spaces, or
      // shell metacharacters).
      const SAFE_PM_RE = /^[a-zA-Z0-9_-]+$/
      if (!SAFE_PM_RE.test(pmOverride)) {
        throw new Error(
          `ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER must be a plain command name ` +
            `(e.g. "dpkg", "apt", "rpm"). Got: "${pmOverride}"`
        )
      }
      return pmOverride
    }
    // Check for the package manager in the order of priority
    for (const pm of pms) {
      if (this.hasCommand(pm)) {
        return pm
      }
    }
    // return the first package manager in the list if none are found, this will throw upstream for proper logging
    this._logger.warn(`No package manager found in the list: ${pms.join(", ")}. Defaulting to the first one: ${pms[0]}`)
    return pms[0]
  }
}
