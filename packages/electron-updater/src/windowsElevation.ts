import { buildPowerShellArgs, escapePowerShellSingleQuoted, getWindowsPowerShellPath, stripPsModulePath } from "./windowsPowerShell.js"

/**
 * Exit code of the elevation trampoline when the user declined the UAC consent prompt. Mirrors Win32
 * `ERROR_CANCELLED` (1223), which is what `ShellExecuteEx` — and therefore `Start-Process -Verb RunAs` — reports.
 */
export const UAC_CANCELLED_EXIT_CODE = 1223

/**
 * Quotes one argument the way Node's `child_process.spawn` (libuv `quote_cmd_arg`) does when it assembles a Win32
 * command line: arguments without whitespace or double quotes are passed as-is, everything else is wrapped in double
 * quotes with embedded quotes escaped as `\"` and backslashes preceding a quote (or the end) doubled, so that
 * `CommandLineToArgvW` in the installer yields the original token.
 *
 * `Start-Process -ArgumentList` joins its items with spaces without adding any quoting, so this keeps the argv the
 * installer sees identical to what it received when the updater spawned `elevate.exe <installer> <args>` directly.
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
 * PowerShell script that launches `installerPath` elevated through the shell `runas` verb (the same `ShellExecuteEx`
 * primitive `elevate.exe` uses) and reports the outcome through its exit code (see {@link buildElevationScript}):
 * - `0`   — the installer process was started (UAC consent given, or not needed);
 * - `1223` — the user declined the UAC prompt ({@link UAC_CANCELLED_EXIT_CODE});
 * - `1`   — anything else (`Start-Process` failed for another reason).
 *
 * `Start-Process -Verb RunAs` blocks only until the consent dialog is answered and the process is created; it does not
 * wait for the installer to finish.
 */
export function buildElevatedInstallerScript(installerPath: string, args: ReadonlyArray<string>): string {
  const argumentList = args.map(it => `'${escapePowerShellSingleQuoted(quoteWin32CommandLineArg(it))}'`).join(", ")
  // -ArgumentList rejects an empty array (ValidateNotNullOrEmpty), so it is only passed when there is something to pass
  const argumentListParameter = args.length === 0 ? "" : ` -ArgumentList @(${argumentList})`
  return buildElevationScript(`Start-Process -FilePath '${escapePowerShellSingleQuoted(installerPath)}'${argumentListParameter} -Verb RunAs -ErrorAction Stop`)
}

/**
 * Wraps a single PowerShell `launchCommand` (one statement that throws on failure) so that the script's exit code
 * reports the outcome: `0` when the command completed, {@link UAC_CANCELLED_EXIT_CODE} when it failed with a
 * `Win32Exception` whose `NativeErrorCode` is `ERROR_CANCELLED` anywhere in the exception chain, `1` for any other
 * failure. Separate from {@link buildElevatedInstallerScript} so the mapping can be exercised with synthetic commands
 * (no UAC prompt).
 */
export function buildElevationScript(launchCommand: string): string {
  return [
    "try {",
    `  ${launchCommand}`,
    "} catch {",
    // the ErrorRecord wraps the Win32Exception (NativeErrorCode 1223 = ERROR_CANCELLED) in an InvalidOperationException,
    // so walk the InnerException chain instead of relying on the exact nesting of the PowerShell version at hand
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
    // Start-Process lives in Microsoft.PowerShell.Management; PSModulePath is cleared so it has to be imported explicitly
    args: buildPowerShellArgs(buildElevatedInstallerScript(installerPath, args), { modules: ["Microsoft.PowerShell.Management"], hideWindow: true }),
    env: stripPsModulePath(process.env),
  }
}
