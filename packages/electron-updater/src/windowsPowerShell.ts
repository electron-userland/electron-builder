import * as path from "path"

/**
 * Hardened Windows PowerShell (5.1, `powershell.exe`) invocation shared by the code-signature verifier and the
 * per-machine (UAC) installer launcher.
 *
 * - `$PSHOME` is a PS automatic variable pointing to the trusted PS installation directory. Importing the needed
 *   modules by their full `$PSHOME` path avoids relying on `PSModulePath` for module discovery, which prevents a
 *   shadowing attack via user-writable `PSModulePath` entries. `$env:PSModulePath` is also cleared inside the script
 *   as belt-and-suspenders, and stripped from the inherited env on the Node side so it is never present when
 *   PowerShell starts. Because auto-loading is therefore unavailable, every module a command needs has to be listed.
 *   https://github.com/electron-userland/electron-builder/issues/2421
 *   https://github.com/electron-userland/electron-builder/issues/2535
 *   https://github.com/electron-userland/electron-builder/issues/7127
 * - The script is passed via `-EncodedCommand` so no quoting rules of a shell or of `powershell.exe`'s own `-Command`
 *   parser apply to user-controlled values (paths); `-NoProfile`, `-NonInteractive` and `-InputFormat None` keep the
 *   host from loading profile scripts, prompting, or waiting for stdin.
 * - UTF-8 output encoding is configured inside PowerShell itself rather than via `chcp 65001` (which required cmd.exe
 *   as the host). Both `$OutputEncoding` and `[Console]::OutputEncoding` must be set so that `ConvertTo-Json` emits
 *   UTF-8 when stdout is captured by Node. https://github.com/electron-userland/electron-builder/issues/8162
 * - Progress-stream output (CLIXML) is suppressed before the first `Import-Module` so that "Preparing modules for
 *   first use." records are never written to stderr, which callers may treat as a command error.
 */
export interface PowerShellInvocationOptions {
  /** Modules (from `$PSHOME\Modules`) the command needs — see the module note above. */
  readonly modules: ReadonlyArray<string>
  /** Adds `-WindowStyle Hidden` so the console host window of `powershell.exe` is not shown. */
  readonly hideWindow?: boolean
}

/**
 * Absolute path of Windows PowerShell 5.1, which ships with every supported Windows version. Resolved from
 * `SystemRoot` rather than looked up on `PATH` so a writable `PATH` entry can never shadow it (the same location the
 * NSIS installer scripts use: `$SYSDIR\WindowsPowerShell\v1.0\powershell.exe`).
 */
export function getWindowsPowerShellPath(): string {
  return path.win32.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
}

/** The full script that is encoded: hardening prelude (see above) followed by `command`. */
export function buildPowerShellScript(command: string, modules: ReadonlyArray<string>): string {
  const imports = modules.map(it => `Import-Module "$PSHOME\\Modules\\${it}"; `).join("")
  return `$ProgressPreference = 'SilentlyContinue'; ${imports}$env:PSModulePath = ""; $OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; ${command}`
}

/** `powershell.exe` arguments running `command` with the hardening prelude via `-EncodedCommand`. */
export function buildPowerShellArgs(command: string, options: PowerShellInvocationOptions): Array<string> {
  const encodedCommand = Buffer.from(buildPowerShellScript(command, options.modules), "utf16le").toString("base64")
  const args = ["-NoProfile", "-NonInteractive", "-InputFormat", "None"]
  if (options.hideWindow) {
    args.push("-WindowStyle", "Hidden")
  }
  args.push("-EncodedCommand", encodedCommand)
  return args
}

/** Decodes the `-EncodedCommand` payload of args built by {@link buildPowerShellArgs} (test/diagnostics helper). */
export function decodePowerShellEncodedCommand(args: ReadonlyArray<string>): string | null {
  const index = args.indexOf("-EncodedCommand")
  return index === -1 || index + 1 >= args.length ? null : Buffer.from(args[index + 1], "base64").toString("utf16le")
}

/**
 * Copy of `env` without `PSModulePath`. Windows environment variable names are case-insensitive, but plain JS object
 * keys are not — spreading `process.env` produces a plain object — so every casing of the key is removed, not just
 * the canonical one.
 */
export function stripPsModulePath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { ...env }
  for (const key of Object.keys(result)) {
    if (key.toLowerCase() === "psmodulepath") {
      delete result[key]
    }
  }
  return result
}

/**
 * Escapes `value` for use inside a PowerShell single-quoted string literal. Single quotes are doubled
 * (`'don''t'` → don't). PowerShell also treats the Unicode single-quote variants U+2018–U+201B (‘ ’ ‚ ‛) as string
 * delimiters, so they must be doubled as well or a path like `C:\Users\D’Andre` would terminate the string early
 * ("The string is missing the terminator"). Other PS metacharacters (`$`, backtick, `\`) are literal inside
 * single-quoted strings.
 */
export function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/['\u2018\u2019\u201A\u201B]/g, "$&$&")
}
