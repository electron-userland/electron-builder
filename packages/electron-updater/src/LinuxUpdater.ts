import { AllPublishOptions } from "builder-util-runtime"
import { AppAdapter } from "./AppAdapter.js"
import { BaseUpdater } from "./BaseUpdater.js"

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
   * Sanitizies the installer path for using with command line tools.
   */
  protected get installerPath(): string | null {
    return super.installerPath?.replace(/\\/g, "\\\\").replace(/ /g, "\\ ") ?? null
  }

  protected runCommandWithSudoIfNeeded(commandWithArgs: string[]) {
    if (this.isRunningAsRoot()) {
      this._logger.info("Running as root, no need to use sudo")
      return this.spawnSyncLog(commandWithArgs[0], commandWithArgs.slice(1))
    }

    const { name } = this.app
    const installComment = `"${name} would like to update"`
    const sudo = this.sudoWithArgs(installComment)
    this._logger.info(`Running as non-root user, using sudo to install: ${sudo}`)
    let wrapper = `"`
    // some sudo commands dont want the command to be wrapped in " quotes
    if (/pkexec/i.test(sudo[0]) || sudo[0] === "sudo") {
      wrapper = ""
    }
    return this.spawnSyncLog(sudo[0], [...(sudo.length > 1 ? sudo.slice(1) : []), `${wrapper}/bin/bash`, "-c", `'${commandWithArgs.join(" ")}'${wrapper}`])
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
    const pmOverride = process.env.ELECTRON_BUILDER_LINUX_PACKAGE_MANAGER?.trim()
    if (pmOverride) {
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
