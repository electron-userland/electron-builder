/**
 * Shared launcher-entrypoint helpers for the Linux targets.
 *
 * Every Linux target (deb/rpm, AppImage, snap, flatpak) launches the app through a generated
 * launcher script rather than inlining `executableArgs` into the freedesktop `.desktop` Exec key.
 * Routing through a launcher keeps the Exec key a plain command (no fragile freedesktop quoting),
 * injects the arguments in a single, consistent place, and lets `"$@"` forward the launch-time
 * arguments (desktop field-code expansions) on to the app.
 */

/** Single-quote a shell argument, escaping any embedded single quotes. */
export function shellQuote(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'"
}

export interface LauncherScriptOptions {
  /**
   * The already-safe exec target tokens, joined with a space to form the start of the `exec` line
   * (e.g. `['"$SNAP/app/foo"']` or `['zypak-wrapper', '"foo"']`). Callers are responsible for
   * quoting these tokens — they are emitted verbatim so that shell variables such as `$SNAP`
   * remain expandable.
   */
  command: ReadonlyArray<string>
  /** User/derived arguments. Each is single-quoted so embedded characters are passed literally. */
  args?: ReadonlyArray<string>
  /** Shebang line. Defaults to `#!/bin/sh`. */
  shebang?: string
  /** Optional lines inserted between the shebang and the `exec` line (e.g. `export` statements). */
  preamble?: string
}

/**
 * Build a launcher entrypoint script that execs `command` with `args` (single-quoted) and always
 * forwards `"$@"`.
 */
export function buildLauncherScript(opts: LauncherScriptOptions): string {
  const shebang = opts.shebang ?? "#!/bin/sh"
  const argsPart = opts.args && opts.args.length > 0 ? " " + opts.args.map(shellQuote).join(" ") : ""
  const preamble = opts.preamble ? `\n${opts.preamble}\n` : "\n"
  return `${shebang}${preamble}exec ${opts.command.join(" ")}${argsPart} "$@"\n`
}
