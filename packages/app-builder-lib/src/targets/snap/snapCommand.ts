/**
 * Validates that a value is safe to embed in a double-quoted shell string.
 * Rejects characters that would be interpreted as shell metacharacters inside `"..."`:
 * `$`, backtick, `"`, `\`, and newlines.
 */
export function validateShellEmbeddable(value: string, fieldName: string): void {
  if (/[$`"\\\n]/.test(value)) {
    throw new Error(
      `${fieldName} contains characters that are not safe in shell scripts: ${JSON.stringify(value)}. ` + `Avoid $, backtick, double-quote, backslash, and newline characters.`
    )
  }
}

// snapd restricts the value of `apps.<app-name>.command` to alphanumeric characters, spaces, and
// `/ . _ # : $ -`, and splits it on whitespace. Rather than encode those rules per-arg, core24
// always routes the command through a launcher script (see buildSnapCommandLauncherScript), which
// sidesteps the character restrictions entirely and keeps a single, uniform command path.
// See: https://documentation.ubuntu.com/snapcraft/stable/reference/snapcraft-yaml/#apps.%3Capp-name%3E.command

/** Single-quote a shell argument, escaping any embedded single quotes. */
export function shellQuote(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'"
}

/**
 * Builds the contents of the launcher script that execs `$SNAP/app/<execName>` with the given args.
 * `$@` is forwarded so launch-time arguments still reach the app. The executable name is validated
 * against shell metacharacters and each arg is single-quoted, so embedded characters (e.g. `=`, quotes)
 * are passed literally.
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
