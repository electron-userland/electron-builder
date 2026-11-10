import { ExecFileOptions } from "child_process"
import * as path from "path"
import { deepAssign } from "./objects.js"
import { parseDn } from "./rfc2253Parser.js"

// Windows Authenticode signature helpers shared by electron-updater (verifying a downloaded update at runtime) and
// electron-builder (checking the signed installer at build time), so the two apply the same publisher name rules.

// The in-box Windows PowerShell 5.1, by absolute path: a bare "powershell.exe" is searched for in the current directory before
// PATH (libuv's search_path), so a powershell.exe planted next to a document the app was opened with could report any file as
// validly signed. A 32-bit process is redirected to the 32-bit Windows PowerShell in SysWOW64, as it is for the bare name.
/**
 * The in-box Windows PowerShell 5.1 of this machine by absolute path: `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`.
 * For code that runs on the end user's machine (electron-updater); electron-builder takes PowerShell from `toolsets.executables`.
 */
export function windowsPowerShellPath(): string {
  // process.env is case-insensitive on Windows
  const systemRoot = process.env.SystemRoot || process.env.windir
  // a relative or drive-relative value ("\Windows") would be resolved against the current directory or drive again
  if (systemRoot == null || !/^[a-zA-Z]:[\\/]/.test(systemRoot)) {
    throw new Error(`cannot locate Windows PowerShell: SystemRoot is ${systemRoot == null ? "not set" : `not an absolute path (${systemRoot})`}`)
  }
  return path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
}

/**
 * execFile arguments that run `command` in Windows PowerShell: the absolute path of `powershell.exe`, its arguments and its options.
 * The path is `powershell` when it is given (electron-builder passes the one of `toolsets.executables`), else {@link windowsPowerShellPath},
 * which is only computed then.
 */
export function preparePowerShellExec(command: string, timeout?: number, extraEnv: Record<string, string> = {}, powershell?: string) {
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
  // deepAssign, not Object.assign: an own `__proto__` key (e.g. from JSON.parse) would otherwise replace env's prototype
  deepAssign(env, extraEnv)
  const options: ExecFileOptions = {
    shell: false,
    timeout,
    env,
    // Electron already starts console programs without a console window; this does the same under plain Node (the build-time
    // check), where powershell.exe would otherwise share the terminal's console
    windowsHide: true,
  }
  return [powershell ?? windowsPowerShellPath(), args, options] as const
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

/**
 * execFile arguments that print the `Get-AuthenticodeSignature` result of `file` as JSON (see {@link parseAuthenticodeSignatureOutput}),
 * run by `powershell` when it is given, else by {@link windowsPowerShellPath} (see {@link preparePowerShellExec}).
 */
export function prepareAuthenticodeSignatureExec(file: string, timeout: number, powershell?: string) {
  return preparePowerShellExec(AUTHENTICODE_SIGNATURE_COMMAND, timeout, { [AUTHENTICODE_FILE_ENV]: file }, powershell)
}

/**
 * Whether a configured publisher name is a Distinguished Name (DN), e.g. `CN=My Company, O=My Company, C=US`: one or
 * more `attribute=value` pairs, each with a non-empty attribute name and value. Only such a name can match a signer in
 * {@link matchPublisherName} (since electron-updater 7 / electron-builder v27): a bare name (`My Company`) never does.
 * Never throws: a value that is not a string (e.g. read from a hand-edited `app-update.yml`) is not valid.
 */
export function isValidPublisherNameDn(name: unknown): boolean {
  if (typeof name !== "string") {
    return false
  }
  const dn = parseDn(name)
  if (dn.size === 0) {
    return false
  }
  for (const [key, value] of dn) {
    if (key.length === 0 || value.length === 0) {
      return false
    }
  }
  return true
}

/** The part of the parsed `Get-AuthenticodeSignature` output (see {@link parseAuthenticodeSignatureOutput}) that {@link matchPublisherName} reads. */
export interface AuthenticodeSignerCertificateData {
  readonly SignerCertificate?: { readonly Subject?: unknown } | null
}

/**
 * Returns true if any entry in publisherNames matches the subject of the signing certificate (in the format Windows
 * reports it, `X509Certificate2.Subject`): an entry matches when it is a valid publisher name DN
 * ({@link isValidPublisherNameDn}) and every attribute it specifies equals the subject's value for the same key
 * (attribute order and subject attributes the entry does not specify are ignored). Any other entry never matches.
 *
 * Throws a `TypeError` when the signature carries no signer certificate subject.
 */
export function matchPublisherName(data: AuthenticodeSignerCertificateData, publisherNames: ReadonlyArray<string>): boolean {
  const subjectText = data.SignerCertificate?.Subject
  if (typeof subjectText !== "string") {
    throw new TypeError("the Authenticode signature has no signer certificate subject")
  }
  const subject = parseDn(subjectText)
  return publisherNames.some(name => {
    if (!isValidPublisherNameDn(name)) {
      return false
    }
    for (const [key, value] of parseDn(name)) {
      if (subject.get(key) !== value) {
        return false
      }
    }
    return true
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
