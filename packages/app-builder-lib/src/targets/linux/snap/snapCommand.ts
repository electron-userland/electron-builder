import { validateShellEmbeddable } from "builder-util"
import { buildLauncherScript, shellQuote } from "../launcherScript.js"

// snapd restricts the value of `apps.<app-name>.command` to alphanumeric characters, spaces, and
// `/ . _ # : $ -`, and splits it on whitespace. Rather than encode those rules per-arg, core24
// always routes the command through a launcher script (see buildSnapCommandLauncherScript), which
// sidesteps the character restrictions entirely and keeps a single, uniform command path.
// See: https://documentation.ubuntu.com/snapcraft/stable/reference/snapcraft-yaml/#apps.%3Capp-name%3E.command

// Re-exported for backwards compatibility with existing imports/tests.
export { shellQuote }

/**
 * Builds the contents of the launcher script that execs `$SNAP/app/<execName>` with the given args.
 * `$@` is forwarded so launch-time arguments still reach the app. The executable name is validated
 * against shell metacharacters and each arg is single-quoted, so embedded characters (e.g. `=`, quotes)
 * are passed literally.
 */
export function buildSnapCommandLauncherScript(opts: { execName: string; args: string[] }): string {
  const { execName, args } = opts
  validateShellEmbeddable(execName, "executableName")
  return buildLauncherScript({ command: [`"$SNAP/app/${execName}"`], args })
}
