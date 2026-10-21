import { AuthenticodeSignature, escapePowerShellSingleQuotes, preparePowerShellExec, readAuthenticodeSignature, verifyAuthenticodePublisher } from "builder-util-runtime"
import { execFileSync } from "child_process"
import * as os from "os"
import type { VerifyUpdateFileResult } from "./types.js"
import { Logger } from "./types.js"
import * as path from "path"

// Thrown when the Path reported by Get-AuthenticodeSignature does not match the expected
// update file path. Signals verifySignature to reject directly, without running the
// ConvertTo-Json availability probe in handleError.
class LiteralPathMismatchError extends Error {}

// Throws LiteralPathMismatchError if a LiteralPath mismatch is detected.
// Returns normally if path verification passed or was skipped (missing data.Path).
function checkLiteralPath(dataPath: string | null, unescapedTempUpdateFile: string, logger: Logger): void {
  if (dataPath == null) {
    logger.warn(
      "Unable to verify LiteralPath of update asset due to missing data.Path. Skipping this step of validation. Message: Get-AuthenticodeSignature reported no Path. " +
        "This fail-open behavior is deprecated: electron-builder v28 will treat a missing/mismatched LiteralPath as a verification failure (fail-closed)."
    )
    return
  }
  const normalizedDataPath = path.normalize(dataPath)
  const normalizedTempUpdateFile = path.normalize(unescapedTempUpdateFile)
  logger.info(`LiteralPath: ${normalizedDataPath}. Update Path: ${normalizedTempUpdateFile}`)
  if (normalizedDataPath !== normalizedTempUpdateFile) {
    throw new LiteralPathMismatchError(`LiteralPath of ${normalizedDataPath} is different than ${normalizedTempUpdateFile}`)
  }
}

// Checks that the signature is Valid, runs the LiteralPath guard, and matches the signer against publisherNames with
// the rules shared with electron-builder (verifyAuthenticodePublisher), which applies them to the signed installer at
// build time. Returns a success/failure result. Throws LiteralPathMismatchError when checkLiteralPath detects a mismatch.
function evaluateSignatureResult(signature: AuthenticodeSignature, publisherNames: string[], unescapedTempUpdateFile: string, logger: Logger): VerifyUpdateFileResult {
  const verification = verifyAuthenticodePublisher(signature, publisherNames)
  if (verification.type !== "invalidStatus") {
    checkLiteralPath(signature.path, unescapedTempUpdateFile, logger)
    if (verification.type === "match") {
      if (verification.match.kind === "cn") {
        logger.warn(`Signature validated using only CN ${verification.match.publisherName}. Please add your full Distinguished Name (DN) to publisherNames configuration`)
      }
      return { response: "success" }
    }
  }
  const result =
    `publisherNames: ${publisherNames.join(" | ")}, raw info: ` + JSON.stringify(signature.raw, (name: string, value: unknown) => (name === "RawData" ? undefined : value), 2)
  logger.warn(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
  return { response: "failure", message: result }
}

// $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
// | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
// | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
export function verifySignature(publisherNames: Array<string>, unescapedTempUpdateFile: string, logger: Logger): Promise<VerifyUpdateFileResult> {
  // The path is passed to -LiteralPath as a PowerShell single-quoted string (see escapePowerShellSingleQuotes).
  logger.info(`Verifying signature ${escapePowerShellSingleQuotes(unescapedTempUpdateFile)}`)
  return new Promise<VerifyUpdateFileResult>((resolve, reject) => {
    readAuthenticodeSignature(unescapedTempUpdateFile, 20 * 1000)
      .then(read => {
        if (read.type === "execFailed" || read.stderr) {
          if (handleError(logger, read.type === "execFailed" ? read.error : null, read.stderr, reject)) {
            resolve({ response: "success" })
          }
          return
        }
        if (read.type === "unparsable") {
          if (handleError(logger, read.error, null, reject)) {
            resolve({ response: "success" })
          }
          return
        }
        try {
          resolve(evaluateSignatureResult(read.signature, publisherNames, unescapedTempUpdateFile, logger))
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
      .catch(reject)
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
