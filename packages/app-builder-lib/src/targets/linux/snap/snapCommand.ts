import { validateShellEmbeddable } from "builder-util"

// snapd restricts the value of `apps.<app-name>.command` to alphanumeric characters,
// spaces, and `/ . _ # : $ -`. Anything else (notably `=` and quotes — e.g. from
// `--ozone-platform=x11` or `--js-flags="..."`) is rejected by `snapcraft` at build time.
// See: https://documentation.ubuntu.com/snapcraft/stable/reference/snapcraft-yaml/#apps.%3Capp-name%3E.command
const SNAP_COMMAND_CHARSET = /^[A-Za-z0-9 /._#:$-]*$/

/** Whether `command` is accepted verbatim in `apps.<name>.command` (no forbidden characters). */
export function isSnapCommandSafe(command: string): boolean {
  return SNAP_COMMAND_CHARSET.test(command)
}

/** Single-quote a shell argument, escaping any embedded single quotes. */
export function shellQuote(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'"
}

export interface ResolvedSnapCommand {
  /** The value to place in `apps.<name>.command`. */
  command: string
  /**
   * When non-null, the resolved command could not be expressed inline (it contained characters
   * forbidden by snapd) and was redirected to a launcher script. These are the args the launcher
   * must pass to the executable. Null means `command` is the executable invocation itself.
   */
  launcherArgs: string[] | null
}

/**
 * Resolves the `apps.<name>.command` value for an app whose binary lives at `app/<execName>`
 * inside the snap. When `execName` + `args` contain characters not permitted in the snap command
 * field, the command is redirected to `launcherScriptName` and the args are returned for the
 * caller to embed in a generated launcher script (snapcraft's documented workaround).
 */
export function resolveSnapCommand(opts: { execName: string; args: string[]; launcherScriptName: string }): ResolvedSnapCommand {
  const { execName, args, launcherScriptName } = opts
  const direct = args.length > 0 ? `app/${execName} ${args.join(" ")}` : `app/${execName}`
  if (isSnapCommandSafe(direct)) {
    return { command: direct, launcherArgs: null }
  }
  return { command: launcherScriptName, launcherArgs: args }
}

/**
 * Builds the contents of a launcher script that execs `$SNAP/app/<execName>` with the given args.
 * Used when the args cannot be expressed inline in `apps.<name>.command` (see {@link resolveSnapCommand}).
 * `$@` is forwarded so launch-time arguments still reach the app.
 */
export function buildSnapCommandLauncherScript(opts: { execName: string; args: string[] }): string {
  const { execName, args } = opts
  validateShellEmbeddable(execName, "executableName")
  let content = `#!/bin/sh\nexec "$SNAP/app/${execName}"`
  if (args.length > 0) {
    content += " " + args.map(shellQuote).join(" ")
  }
  content += ' "$@"\n'
  return content
}
