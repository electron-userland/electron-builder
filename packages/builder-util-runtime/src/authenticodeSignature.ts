import { execFile, ExecFileOptions } from "child_process"
import { matchPublisherName, PublisherNameMatch } from "./publisherName.js"

// Windows Authenticode signature reading and publisher verification, shared by electron-updater (verifying a
// downloaded update at runtime) and electron-builder (checking the signed installer at build time), so both read
// the signature with the same PowerShell invocation and judge it with the same rules.

/**
 * Values of `System.Management.Automation.SignatureStatus`. `ConvertTo-Json` serializes the enum as its numeric
 * value, which is the representation {@link AuthenticodeSignature.status} carries.
 */
export const AuthenticodeSignatureStatus = {
  Valid: 0,
  UnknownError: 1,
  NotSigned: 2,
  HashMismatch: 3,
  NotTrusted: 4,
  NotSupportedFileFormat: 5,
  Incompatible: 6,
} as const

/** Returns the `SignatureStatus` name of a numeric status (e.g. `HashMismatch` for 3), or the number itself when unknown. */
export function authenticodeSignatureStatusName(status: number | null): string {
  if (status == null) {
    return "unknown"
  }
  for (const [name, value] of Object.entries(AuthenticodeSignatureStatus)) {
    if (value === status) {
      return name
    }
  }
  return String(status)
}

/**
 * Doubles ASCII and Unicode single quotes for a PowerShell single-quoted string.
 *
 * Single quotes in the path are doubled for PS single-quoted strings ('don''t' → don't).
 * PowerShell also treats the Unicode single-quote variants U+2018–U+201B (‘ ’ ‚ ‛) as
 * string delimiters, so they must be doubled as well or a path like C:\Users\D’Andre
 * would terminate the string early ("The string is missing the terminator").
 * Other PS metacharacters ($, `, \) are literal inside single-quoted strings.
 */
export function escapePowerShellSingleQuotes(value: string): string {
  return value.replace(/['\u2018\u2019\u201A\u201B]/g, "$&$&")
}

/**
 * Returns the `execFile` arguments that run a PowerShell command with the Security module imported from the trusted
 * PowerShell installation and UTF-8 output.
 */
export function preparePowerShellExec(command: string, timeout?: number): readonly [string, Array<string>, ExecFileOptions] {
  // $PSHOME is a PS automatic variable pointing to the trusted PS installation directory.
  // Using the full path for Import-Module avoids relying on PSModulePath for module discovery,
  // which prevents a shadowing attack via user-writable PSModulePath entries.
  // $env:PSModulePath is also cleared inside the script as belt-and-suspenders.
  // https://github.com/electron-userland/electron-builder/issues/2421
  // https://github.com/electron-userland/electron-builder/issues/2535
  // https://github.com/electron-userland/electron-builder/issues/7127
  //
  // PSModulePath is stripped from the inherited env on the Node side so it is never
  // present when PowerShell starts. Windows environment variable names are case-insensitive,
  // but plain JS object keys are not — spreading process.env produces a plain object — so
  // every casing of the key must be removed, not just the canonical one.
  //
  // UTF-8 output encoding is configured inside PowerShell itself rather than via `chcp 65001`
  // (which required cmd.exe as the host). Both $OutputEncoding and [Console]::OutputEncoding
  // must be set so that ConvertTo-Json emits UTF-8 when stdout is captured by Node.
  // https://github.com/electron-userland/electron-builder/issues/8162
  // Suppress progress-stream output (CLIXML) before the first Import-Module so that
  // "Preparing modules for first use." records are never written to stderr, which would
  // otherwise be misidentified as a command error by callers that treat stderr as a failure.
  const script = `$ProgressPreference = 'SilentlyContinue'; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Security"; $env:PSModulePath = ""; $OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; ${command}`
  const encodedCommand = Buffer.from(script, "utf16le").toString("base64")
  const args = ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-EncodedCommand", encodedCommand]
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "psmodulepath") {
      delete env[key]
    }
  }
  const options: ExecFileOptions = {
    shell: false,
    timeout,
    env,
  }
  return ["powershell.exe", args, options] as const
}

/** The PowerShell command that prints the Authenticode signature of `file` as compressed JSON. */
export function getAuthenticodeSignatureCommand(file: string): string {
  return `Get-AuthenticodeSignature -LiteralPath '${escapePowerShellSingleQuotes(file)}' | ConvertTo-Json -Compress`
}

/** The parsed output of `Get-AuthenticodeSignature | ConvertTo-Json`. */
export interface AuthenticodeSignature {
  /** The numeric `SignatureStatus` (see {@link AuthenticodeSignatureStatus}), or null when absent or not a number. */
  readonly status: number | null
  /** The `Path` PowerShell reports for the file it inspected, or null when absent or not a string. */
  readonly path: string | null
  /** The subject of the signer certificate (`X509Certificate2.Subject`), or null when there is no signer certificate. */
  readonly signerSubject: string | null
  /** The whole parsed output, without the fields that only add noise to diagnostics (certificate handles, extensions…). */
  readonly raw: unknown
}

function getProperty(value: unknown, name: string): unknown {
  return value != null && typeof value === "object" && name in value ? Reflect.get(value, name) : undefined
}

/**
 * Parses the JSON printed by {@link getAuthenticodeSignatureCommand}.
 * @throws when the output is not JSON or is `null`
 */
export function parseAuthenticodeSignatureOutput(stdout: string): AuthenticodeSignature {
  const data: unknown = JSON.parse(stdout)
  if (data === null) {
    throw new TypeError("Get-AuthenticodeSignature output is null")
  }
  if (typeof data === "object") {
    Reflect.deleteProperty(data, "PrivateKey")
    Reflect.deleteProperty(data, "IsOSBinary")
    Reflect.deleteProperty(data, "SignatureType")
  }
  const signerCertificate = getProperty(data, "SignerCertificate")
  if (signerCertificate != null && typeof signerCertificate === "object") {
    Reflect.deleteProperty(signerCertificate, "Archived")
    Reflect.deleteProperty(signerCertificate, "Extensions")
    Reflect.deleteProperty(signerCertificate, "Handle")
    Reflect.deleteProperty(signerCertificate, "HasPrivateKey")
    // duplicates data.SignerCertificate (contains RawData)
    Reflect.deleteProperty(signerCertificate, "SubjectName")
  }
  const status = getProperty(data, "Status")
  const path = getProperty(data, "Path")
  const subject = getProperty(signerCertificate, "Subject")
  return {
    status: typeof status === "number" ? status : null,
    path: typeof path === "string" ? path : null,
    signerSubject: typeof subject === "string" ? subject : null,
    raw: data,
  }
}

/**
 * The outcome of {@link readAuthenticodeSignature}. `stdout` and `stderr` are always included, so a caller can apply
 * its own policy (electron-updater treats any stderr output as a failure).
 */
export type AuthenticodeSignatureReadResult =
  | { readonly type: "ok"; readonly signature: AuthenticodeSignature; readonly stdout: string; readonly stderr: string }
  /** PowerShell could not be run, timed out or exited with an error. */
  | { readonly type: "execFailed"; readonly error: Error; readonly stdout: string; readonly stderr: string }
  /** PowerShell ran, but its output is not a signature. */
  | { readonly type: "unparsable"; readonly error: Error; readonly stdout: string; readonly stderr: string }

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Reads the Authenticode signature of `file` with `Get-AuthenticodeSignature` (Windows only). Never rejects for a
 * failure of PowerShell itself — it is reported in the result.
 */
export function readAuthenticodeSignature(file: string, timeout: number): Promise<AuthenticodeSignatureReadResult> {
  return new Promise<AuthenticodeSignatureReadResult>(resolve => {
    execFile(...preparePowerShellExec(getAuthenticodeSignatureCommand(file), timeout), (error, stdoutValue, stderrValue) => {
      const stdout = stdoutValue == null ? "" : String(stdoutValue)
      const stderr = stderrValue == null ? "" : String(stderrValue)
      if (error != null) {
        resolve({ type: "execFailed", error, stdout, stderr })
        return
      }
      let signature: AuthenticodeSignature
      try {
        signature = parseAuthenticodeSignatureOutput(stdout)
      } catch (e: unknown) {
        resolve({ type: "unparsable", error: toError(e), stdout, stderr })
        return
      }
      resolve({ type: "ok", signature, stdout, stderr })
    })
  })
}

/**
 * The verdict of {@link verifyAuthenticodePublisher}:
 * - `match` — the status is accepted and the signer matches a configured publisher name (`match` says which and how;
 *   callers should warn on a `cn` match)
 * - `invalidStatus` — the signature status is not accepted
 * - `notSigned` — there is no signer certificate
 * - `publisherMismatch` — the signer matches none of the configured publisher names
 */
export type AuthenticodePublisherVerification =
  | { readonly type: "match"; readonly subject: string; readonly match: PublisherNameMatch }
  | { readonly type: "invalidStatus"; readonly status: number | null }
  | { readonly type: "notSigned" }
  | { readonly type: "publisherMismatch"; readonly subject: string }

export interface AuthenticodePublisherVerificationOptions {
  /**
   * Whether a signature status is acceptable. Defaults to `Valid` only, as electron-updater requires. A build host
   * may not trust the signing chain the users' machines trust, so a build-time check can accept more.
   */
  readonly isAcceptedStatus?: (status: number | null) => boolean
}

/**
 * Checks that an Authenticode signature has an accepted status and is made by a certificate matching one of the
 * configured publisher names (with {@link matchPublisherName}).
 */
export function verifyAuthenticodePublisher(
  signature: Pick<AuthenticodeSignature, "status" | "signerSubject">,
  publisherNames: ReadonlyArray<string>,
  options: AuthenticodePublisherVerificationOptions = {}
): AuthenticodePublisherVerification {
  const isAcceptedStatus = options.isAcceptedStatus ?? ((status: number | null) => status === AuthenticodeSignatureStatus.Valid)
  if (!isAcceptedStatus(signature.status)) {
    return { type: "invalidStatus", status: signature.status }
  }
  const subject = signature.signerSubject
  if (subject == null) {
    return { type: "notSigned" }
  }
  const match = matchPublisherName(publisherNames, subject)
  return match == null ? { type: "publisherMismatch", subject } : { type: "match", subject, match }
}
