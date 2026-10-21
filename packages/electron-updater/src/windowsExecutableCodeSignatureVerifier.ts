import { escapePowerShellSingleQuotes, matchPublisherName, parseAuthenticodeSignatureOutput, preparePowerShellExec } from "builder-util-runtime"
import { execFile, execFileSync } from "child_process"
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
    if (matchPublisherName(data, publisherNames, logger)) {
      return { response: "success" }
    }
  }
  const result = `publisherNames: ${publisherNames.join(" | ")}, raw info: ` + JSON.stringify(data, (name, value) => (name === "RawData" ? undefined : value), 2)
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
