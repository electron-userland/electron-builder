import { buildPowerShellArgs, escapePowerShellSingleQuoted, getWindowsPowerShellPath, stripPsModulePath } from "./windowsPowerShell.js"

/**
 * Exit code of the elevation trampoline when the user declined the UAC consent prompt. Mirrors Win32
 * `ERROR_CANCELLED` (1223), which is what `ShellExecuteEx` with the `runas` verb reports.
 */
export const UAC_CANCELLED_EXIT_CODE = 1223

/**
 * Quotes one argument the way Node's `child_process.spawn` (libuv `quote_cmd_arg`) does when it assembles a Win32
 * command line: arguments without whitespace or double quotes are passed as-is, everything else is wrapped in double
 * quotes with embedded quotes escaped as `\"` and backslashes preceding a quote (or the end) doubled, so that
 * `CommandLineToArgvW` in the installer yields the original token.
 *
 * NSIS documents `/D=<dir>` as the *unquoted* last argument; the updater has always passed it through quoted argv (see
 * https://nsis.sourceforge.io/Docs/Chapter3.html#installerusage) and that is preserved here rather than special-cased.
 */
export function quoteWin32CommandLineArg(arg: string): string {
  if (arg.length === 0) {
    return '""'
  }
  if (!/[ \t"]/.test(arg)) {
    return arg
  }
  let result = '"'
  let pendingBackslashes = 0
  for (const char of arg) {
    if (char === "\\") {
      pendingBackslashes++
      continue
    }
    if (char === '"') {
      result += "\\".repeat(pendingBackslashes * 2 + 1) + '"'
    } else {
      result += "\\".repeat(pendingBackslashes) + char
    }
    pendingBackslashes = 0
  }
  return result + "\\".repeat(pendingBackslashes * 2) + '"'
}

/**
 * Joins `args` into the exact Win32 command line (without the program) that Node's `child_process.spawn` would hand to
 * `CreateProcess`: every token quoted by {@link quoteWin32CommandLineArg}, separated by single spaces, no leading or
 * trailing space. An empty list yields an empty string.
 *
 * The result is passed verbatim as the `lpParameters` of `ShellExecuteEx` (`ProcessStartInfo.Arguments`), so the
 * installer sees the same argv it received when the updater spawned `elevate.exe <installer> <args>` directly. In
 * particular there is no trailing space: NSIS takes everything after `/D=` up to the end of the command line as the
 * install directory (`GetDParameter` in multiUser.nsh), so a padded command line would install into `C:\Apps\MyApp `.
 */
export function buildWin32CommandLine(args: ReadonlyArray<string>): string {
  return args.map(quoteWin32CommandLineArg).join(" ")
}

/**
 * PowerShell script that launches `installerPath` elevated through the shell `runas` verb (the same `ShellExecuteEx`
 * primitive `elevate.exe` uses) and reports the outcome through its exit code (see {@link buildElevationScript}):
 * - `0`   — the installer process was started (UAC consent given, or not needed);
 * - `1223` — the user declined the UAC prompt ({@link UAC_CANCELLED_EXIT_CODE});
 * - `1`   — anything else (the launch failed for another reason).
 *
 * The launch goes through `[System.Diagnostics.Process]::Start` with a `ProcessStartInfo` (`UseShellExecute`,
 * `Verb = 'runas'`) rather than `Start-Process -Verb RunAs`, for two reasons that both matter here:
 * - Windows PowerShell 5.1's `Start-Process` catches the `Win32Exception` of a declined prompt and rethrows a bare
 *   `InvalidOperationException(message)` *without* the inner exception, so the `ERROR_CANCELLED` code is lost and a
 *   declined prompt would be indistinguishable from any other failure (exit `1` → `elevate.exe` fallback → a second UAC
 *   prompt). A .NET method call that throws is surfaced by PowerShell as a `MethodInvocationException` whose
 *   `InnerException` is the original `Win32Exception`, which the catch block below finds.
 * - `Start-Process -ArgumentList` appends a space after *every* item, so the installer's command line would end in a
 *   space that NSIS keeps as part of the `/D=` install directory. `ProcessStartInfo.Arguments` is passed verbatim, so
 *   it receives the exact libuv-joined command line ({@link buildWin32CommandLine}).
 *
 * No cmdlet is used (the `ProcessStartInfo` is created with `::new()`), so the script needs no module import.
 * `ShellExecuteEx` blocks only until the consent dialog is answered and the process is created; it does not wait for
 * the installer to finish.
 */
export function buildElevatedInstallerScript(installerPath: string, args: ReadonlyArray<string>): string {
  const commandLine = buildWin32CommandLine(args)
  return buildElevationScript([
    "$psi = [System.Diagnostics.ProcessStartInfo]::new()",
    `$psi.FileName = '${escapePowerShellSingleQuoted(installerPath)}'`,
    // Arguments defaults to an empty string, which is what an empty argv must produce
    ...(commandLine.length === 0 ? [] : [`$psi.Arguments = '${escapePowerShellSingleQuoted(commandLine)}'`]),
    "$psi.UseShellExecute = $true",
    "$psi.Verb = 'runas'",
    "$null = [System.Diagnostics.Process]::Start($psi)",
  ])
}

/**
 * Wraps the PowerShell `launchCommand` (one or more statements that throw on failure) so that the script's exit code
 * reports the outcome: `0` when the command completed, {@link UAC_CANCELLED_EXIT_CODE} when it failed with a
 * `Win32Exception` whose `NativeErrorCode` is `ERROR_CANCELLED` anywhere in the exception chain, `1` for any other
 * failure. Separate from {@link buildElevatedInstallerScript} so the mapping can be exercised with synthetic commands
 * (no UAC prompt).
 */
export function buildElevationScript(launchCommand: string | ReadonlyArray<string>): string {
  const launchStatements = typeof launchCommand === "string" ? [launchCommand] : launchCommand
  return [
    "try {",
    ...launchStatements.map(it => `  ${it}`),
    "} catch {",
    // PowerShell reports a throwing .NET method call as a MethodInvocationException wrapping the Win32Exception
    // (NativeErrorCode 1223 = ERROR_CANCELLED), so walk the InnerException chain instead of relying on the exact nesting
    "  $e = $_.Exception",
    "  while ($null -ne $e) {",
    `    if (($e -is [System.ComponentModel.Win32Exception]) -and ($e.NativeErrorCode -eq ${UAC_CANCELLED_EXIT_CODE})) { exit ${UAC_CANCELLED_EXIT_CODE} }`,
    "    $e = $e.InnerException",
    "  }",
    "  exit 1",
    "}",
    "exit 0",
  ].join("\n")
}

export interface ElevatedInstallerInvocation {
  /** Absolute path of `powershell.exe` (see {@link getWindowsPowerShellPath}). */
  readonly file: string
  readonly args: Array<string>
  /** `process.env` without `PSModulePath`. */
  readonly env: NodeJS.ProcessEnv
}

/** Everything needed to spawn the elevation trampoline for `installerPath` with `args`. */
export function buildElevatedInstallerInvocation(installerPath: string, args: ReadonlyArray<string>): ElevatedInstallerInvocation {
  return {
    file: getWindowsPowerShellPath(),
    // the script calls .NET directly and uses no cmdlet, so no module has to be imported from $PSHOME
    args: buildPowerShellArgs(buildElevatedInstallerScript(installerPath, args), { modules: [], hideWindow: true }),
    env: stripPsModulePath(process.env),
  }
}
