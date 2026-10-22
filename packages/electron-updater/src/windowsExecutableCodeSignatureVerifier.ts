import { escapePowerShellSingleQuotes, isValidPublisherNameDn, matchPublisherName, parseAuthenticodeSignatureOutput, preparePowerShellExec } from "builder-util-runtime"
import { execFile, execFileSync } from "child_process"
import * as os from "os"
import type { VerifyUpdateFileResult } from "./types.js"
import { Logger } from "./types.js"
import * as path from "path"

const PUBLISHER_NAME_DN_DOCS = "https://www.electron.build/docs/migration/v27-breaking-changes#windows-publishername-must-be-a-distinguished-name"

/**
 * Explains why some publisherName entries can never match the signer of an update, or returns null when every entry is
 * in distinguished name (DN) format. Such entries come from an app-update.yml written by electron-builder before
 * v27 (which wrote the certificate's Common Name), a dev-app-update.yml or another updateConfigPath file, or a direct call
 * of verifyUpdateFileAuthenticodeSignature.
 * Never throws, whatever the entries are.
 * @internal
 */
export function publisherNameDnNote(publisherNames: ReadonlyArray<unknown>): string | null {
  // typed as an array, but a JavaScript caller of verifyUpdateFileAuthenticodeSignature may pass anything
  const entries: ReadonlyArray<unknown> = Array.isArray(publisherNames) ? publisherNames : [publisherNames]
  const invalid = entries.filter(it => !isValidPublisherNameDn(it))
  if (invalid.length === 0) {
    return null
  }
  const names = invalid.map(it => (typeof it === "string" ? `"${it}"` : `(${typeof it})`)).join(", ")
  return (
    `electron-updater 7 (electron-builder v27) matches a publisherName only when it is in distinguished name (DN) format, ` +
    `e.g. "CN=My Company, O=My Company, C=US": publisherName ${names} can never match the signer of an update. ` +
    `Build the app with electron-builder v27, which writes such a DN to app-update.yml, or set the publisherName of dev-app-update.yml (or the updateConfigPath file) to the certificate subject. ${PUBLISHER_NAME_DN_DOCS}`
  )
}

const MISSING_PUBLISHER_NAME_DOCS = "https://www.electron.build/docs/migration/v27-breaking-changes#missing-publishername-fails-update-verification"

/**
 * The publisher names of an update config (app-update.yml, dev-app-update.yml or the updateConfigPath file), or null when it has
 * none: no config, no `publisherName`, `publisherName: null`, or no string entry. A single string is one entry. Never throws.
 * @internal
 */
export function readConfiguredPublisherNames(config: unknown): Array<string> | null {
  if (config == null || typeof config !== "object" || !("publisherName" in config)) {
    return null
  }
  const value: unknown = config.publisherName
  const values: ReadonlyArray<unknown> = Array.isArray(value) ? value : [value]
  // an entry that is no string can never match a signer, so it is left out (with no string entry at all, there is no publisherName)
  const entries = values.filter((it): it is string => typeof it === "string")
  return entries.length === 0 ? null : entries
}

/**
 * Whether the update config opts out of the Authenticode verification of updates: `verifyUpdateCodeSignature: false`, which
 * electron-builder writes into app-update.yml for a build with `win.verifyUpdateCodeSignature: false`. Never throws.
 * @internal
 */
export function isUpdateCodeSignatureVerificationDisabled(config: unknown): boolean {
  return config != null && typeof config === "object" && "verifyUpdateCodeSignature" in config && config.verifyUpdateCodeSignature === false
}

/**
 * Why an update is rejected when the update config has no publisherName to verify its Authenticode signature against.
 * `hasConfig` is false for a packaged app without an app-update.yml (a feed set with setFeedURL only). Never throws.
 * @internal
 */
export function missingPublisherNameMessage(hasConfig: boolean): string {
  const what = hasConfig ? "app-update.yml has no publisherName" : "the app has no app-update.yml (an update feed set only with setFeedURL), so there is no publisherName"
  return (
    `electron-updater 7 (electron-builder v27) rejects the update: ${what} to verify its Authenticode signature against (verification used to be skipped). ` +
    "Build the app with electron-builder v27 and a publish configuration, so that app-update.yml carries the publisherName: sign the build so electron-builder writes it " +
    "(CN=<common name> of the certificate), set win.sign.publisherName to the subject of the certificate that signs your updates, " +
    "or set win.verifyUpdateCodeSignature: false at build time to opt out explicitly (in a dev-app-update.yml or updateConfigPath file: verifyUpdateCodeSignature: false). " +
    MISSING_PUBLISHER_NAME_DOCS
  )
}

// Thrown when the Path reported by Get-AuthenticodeSignature does not match the expected
// update file path. Signals verifySignature to reject directly, without running the
// ConvertTo-Json availability probe in handleError.
class LiteralPathMismatchError extends Error {}

// Throws LiteralPathMismatchError if a LiteralPath mismatch is detected.
// Returns normally if path verification passed or was skipped (missing data.Path).
function checkLiteralPath(data: any, unescapedTempUpdateFile: string, logger: Logger): void {
  let normalizedDataPath: string
  try {
    normalizedDataPath = path.normalize(data.Path)
  } catch (error: any) {
    logger.warn(
      `Unable to verify LiteralPath of update asset due to missing data.Path. Skipping this step of validation. Message: ${error.message ?? error.stack}. ` +
        "This fail-open behavior is deprecated: electron-builder v28 will treat a missing/mismatched LiteralPath as a verification failure (fail-closed)."
    )
    return
  }
  const normalizedTempUpdateFile = path.normalize(unescapedTempUpdateFile)
  logger.info(`LiteralPath: ${normalizedDataPath}. Update Path: ${normalizedTempUpdateFile}`)
  if (normalizedDataPath !== normalizedTempUpdateFile) {
    throw new LiteralPathMismatchError(`LiteralPath of ${normalizedDataPath} is different than ${normalizedTempUpdateFile}`)
  }
}

// Parses Get-AuthenticodeSignature JSON, checks the LiteralPath guard, and
// matches against publisherNames. Returns a success/failure result. Throws
// LiteralPathMismatchError when checkLiteralPath detects a mismatch.
function evaluateSignatureResult(stdout: string, publisherNames: string[], unescapedTempUpdateFile: string, logger: Logger): VerifyUpdateFileResult {
  const data = parseAuthenticodeSignatureOutput(stdout)
  if (data.Status === 0) {
    checkLiteralPath(data, unescapedTempUpdateFile, logger)
    if (matchPublisherName(data, publisherNames)) {
      return { response: "success" }
    }
  }
  const note = publisherNameDnNote(publisherNames)
  const result =
    `publisherNames: ${publisherNames.join(" | ")}, raw info: ` +
    JSON.stringify(data, (name, value) => (name === "RawData" ? undefined : value), 2) +
    (note == null ? "" : `\n${note}`)
  logger.warn(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
  return { response: "failure", message: result }
}

// $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
// | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
// | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
export function verifySignature(publisherNames: Array<string>, unescapedTempUpdateFile: string, logger: Logger): Promise<VerifyUpdateFileResult> {
  const tempUpdateFile = escapePowerShellSingleQuotes(unescapedTempUpdateFile)
  logger.info(`Verifying signature ${tempUpdateFile}`)
  return new Promise<VerifyUpdateFileResult>((resolve, reject) => {
    execFile(...preparePowerShellExec(`Get-AuthenticodeSignature -LiteralPath '${tempUpdateFile}' | ConvertTo-Json -Compress`, 20 * 1000), (error, stdout, stderr) => {
      if (error != null || stderr) {
        if (handleError(logger, error, stderr, reject)) {
          resolve({ response: "success" })
        }
        return
      }
      try {
        resolve(evaluateSignatureResult(stdout, publisherNames, unescapedTempUpdateFile, logger))
      } catch (e: any) {
        if (e instanceof LiteralPathMismatchError) {
          // Reject directly — the signature data was parsed successfully, so the
          // ConvertTo-Json availability probe in handleError is not applicable.
          reject(e)
          return
        }
        if (handleError(logger, e, null, reject)) {
          resolve({ response: "success" })
        }
      }
    })
  })
}

// Returns true when the error is ignored (caller should resolve { response: "success" }).
// Returns false when reject() was called (caller must not resolve).
function handleError(logger: Logger, error: Error | null, stderr: string | null, reject: (reason: any) => void): boolean {
  if (isOldWin6()) {
    logger.warn(
      `Cannot execute Get-AuthenticodeSignature: ${error || stderr}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher. ` +
        "This fail-open behavior is deprecated: electron-builder v28 will treat an unverifiable signature as a failure (fail-closed)."
    )
    return true
  }

  try {
    execFileSync(...preparePowerShellExec("ConvertTo-Json test", 10 * 1000))
  } catch (testError: any) {
    logger.warn(
      `Cannot execute ConvertTo-Json: ${testError.message}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher. ` +
        "This fail-open behavior is deprecated: electron-builder v28 will treat an unverifiable signature as a failure (fail-closed)."
    )
    return true
  }

  if (error != null) {
    reject(error)
  } else if (stderr) {
    reject(new Error(`Cannot execute Get-AuthenticodeSignature, stderr: ${stderr}. Failing signature validation due to unknown stderr.`))
  }
  return false
}

function isOldWin6(): boolean {
  const winVersion = os.release()
  return winVersion.startsWith("6.") && !winVersion.startsWith("6.3")
}
