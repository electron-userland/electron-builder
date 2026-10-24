import { ExecFileOptions } from "child_process"
import * as path from "path"
import { parseDn } from "./rfc2253Parser.js"

// Windows Authenticode signature helpers shared by electron-updater (verifying a downloaded update at runtime) and
// electron-builder (checking the signed installer at build time).

// The in-box Windows PowerShell 5.1, by absolute path: a bare "powershell.exe" is searched for in the current directory before
// PATH (libuv's search_path), so a powershell.exe planted next to a document the app was opened with could report any file as
// validly signed. A 32-bit process is redirected to the 32-bit Windows PowerShell in SysWOW64, as it is for the bare name.
function windowsPowerShellPath(): string {
  // process.env is case-insensitive on Windows
  const systemRoot = process.env.SystemRoot || process.env.windir
  // a relative or drive-relative value ("\Windows") would be resolved against the current directory or drive again
  if (systemRoot == null || !/^[a-zA-Z]:[\\/]/.test(systemRoot)) {
    throw new Error(`cannot locate Windows PowerShell: SystemRoot is ${systemRoot == null ? "not set" : `not an absolute path (${systemRoot})`}`)
  }
  return path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
}

export function preparePowerShellExec(command: string, timeout?: number, extraEnv: Record<string, string> = {}) {
  // $PSHOME is a PS automatic variable pointing to the trusted PS installation directory.
  // Every module the commands use is imported by its full path (Security: Get-AuthenticodeSignature,
  // Utility: ConvertTo-Json), so no module is looked up in a user-writable PSModulePath entry — which
  // also spares the slow module auto-discovery of a cold start. PSModulePath is cleared as well, as
  // belt-and-suspenders (Windows PowerShell rebuilds it, so the full-path imports are what counts).
  // https://github.com/electron-userland/electron-builder/issues/2421
  // https://github.com/electron-userland/electron-builder/issues/2535
  // https://github.com/electron-userland/electron-builder/issues/7127
  //
  // PSModulePath is stripped from the inherited env on the Node side so it is never
  // present when PowerShell starts. Windows environment variable names are case-insensitive,
  // but plain JS object keys are not — spreading process.env produces a plain object — so
  // every casing of the key must be removed, not just the canonical one. The same goes for
  // the variables in extraEnv, so their value is the one PowerShell sees.
  //
  // The script sets no output encoding: [Console]::OutputEncoding cannot be assigned in
  // Constrained Language Mode (AppLocker / WDAC), where the error would reject every update.
  // A command that prints non-ASCII text has to escape it itself (see AUTHENTICODE_SIGNATURE_COMMAND).
  // https://github.com/electron-userland/electron-builder/issues/6917
  // Suppress progress-stream output (CLIXML) before the first Import-Module so that
  // "Preparing modules for first use." records are never written to stderr, which would
  // otherwise be misidentified as a command error by the stderr check in verifySignature.
  const script = `$ProgressPreference = 'SilentlyContinue'; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Security"; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Utility"; $env:PSModulePath = ""; ${command}`
  const encodedCommand = Buffer.from(script, "utf16le").toString("base64")
  const args = ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-EncodedCommand", encodedCommand]
  const replacedKeys = new Set(["psmodulepath", ...Object.keys(extraEnv).map(key => key.toLowerCase())])
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) {
    if (replacedKeys.has(key.toLowerCase())) {
      delete env[key]
    }
  }
  Object.assign(env, extraEnv)
  const options: ExecFileOptions = {
    shell: false,
    timeout,
    env,
    // Electron already starts console programs without a console window; this does the same under plain Node (the build-time
    // check), where powershell.exe would otherwise share the terminal's console
    windowsHide: true,
  }
  return [windowsPowerShellPath(), args, options] as const
}

// The file to verify is passed in an environment variable rather than in the script, so no character of its path can ever be
// parsed as PowerShell code (no quoting or escaping is involved).
const AUTHENTICODE_FILE_ENV = "ELECTRON_BUILDER_AUTHENTICODE_FILE"

// A PowerShell function that escapes every non-ASCII UTF-16 code unit of a text as \uXXXX: printed that way, a path or certificate
// subject with non-ASCII characters reads back losslessly whatever the console code page, without setting an output encoding
// (https://github.com/electron-userland/electron-builder/issues/8162). JSON.parse decodes the escapes. Only uses constructs allowed
// in Constrained Language Mode. -cmatch, not -match: matching case-insensitively folds "İ" (U+0130) and the Kelvin sign into ASCII.
export const POWERSHELL_ASCII_ESCAPE_FUNCTION =
  "function ConvertTo-AsciiEscaped([string]$text) { if ($text -cmatch '[^\\x00-\\x7F]') { -join $(foreach ($c in $text.ToCharArray()) { if ([int]$c -gt 127) { '\\u{0:x4}' -f [int]$c } else { $c } }) } else { $text } }"

// Prints the Get-AuthenticodeSignature result as escaped JSON. An error is written to stderr escaped the same way, with exit code 1.
const AUTHENTICODE_SIGNATURE_COMMAND =
  `${POWERSHELL_ASCII_ESCAPE_FUNCTION}; ` +
  `try { $json = Get-AuthenticodeSignature -LiteralPath $env:${AUTHENTICODE_FILE_ENV} -ErrorAction Stop | ConvertTo-Json -Compress } ` +
  `catch { Write-Error -Message (ConvertTo-AsciiEscaped ($_ | Out-String)); exit 1 }; ` +
  `ConvertTo-AsciiEscaped $json`

/** execFile arguments that print the `Get-AuthenticodeSignature` result of `file` as JSON (see {@link parseAuthenticodeSignatureOutput}). */
export function prepareAuthenticodeSignatureExec(file: string, timeout: number) {
  return preparePowerShellExec(AUTHENTICODE_SIGNATURE_COMMAND, timeout, { [AUTHENTICODE_FILE_ENV]: file })
}

// Whether a publisher name is a Distinguished Name (at least one `KEY=value` attribute, e.g. "CN=My Company, O=My Company, C=US")
// rather than a bare common name ("My Company").
export function isDistinguishedName(name: string): boolean {
  return parseDn(name).size > 0
}

// Returns true if any entry in publisherNames is a Distinguished Name whose every attribute matches the signing certificate
// subject. A bare common name never matches.
export function matchPublisherName(data: any, publisherNames: string[]): boolean {
  const subject = parseDn(data.SignerCertificate.Subject)
  return publisherNames.some(name => {
    const dn = parseDn(name)
    return dn.size > 0 && Array.from(dn.keys()).every(key => dn.get(key) === subject.get(key))
  })
}

// SignatureType is kept: electron-updater rejects a signature from a Windows security catalog (2) instead of one embedded in the file.
export function parseAuthenticodeSignatureOutput(out: string): any {
  const data = JSON.parse(out)
  delete data.PrivateKey
  delete data.IsOSBinary
  const signerCertificate = data.SignerCertificate
  if (signerCertificate != null) {
    delete signerCertificate.Archived
    delete signerCertificate.Extensions
    delete signerCertificate.Handle
    delete signerCertificate.HasPrivateKey
    // duplicates data.SignerCertificate (contains RawData)
    delete signerCertificate.SubjectName
  }
  return data
}
