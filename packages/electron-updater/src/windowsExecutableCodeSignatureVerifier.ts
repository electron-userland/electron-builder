import { matchPublisherName, newError, parseAuthenticodeSignatureOutput, prepareAuthenticodeSignatureExec } from "builder-util-runtime"
import { execFile, ExecFileException } from "child_process"
import type { VerifyUpdateFileResult } from "./types.js"
import { Logger } from "./types.js"
import * as path from "path"

// An update is installed only when Get-AuthenticodeSignature positively verifies it. Everything else rejects it (fail-closed):
// PowerShell cannot be started, times out, fails or writes to stderr, or its output cannot be parsed or names another file.

const VERIFY_TIMEOUT_MS = 60 * 1000

const CUSTOM_VERIFIER_HINT =
  "If PowerShell cannot run on your users' machines, verify updates natively by assigning autoUpdater.verifyUpdateFileAuthenticodeSignature: " +
  "https://www.electron.build/docs/win#how-do-you-use-a-custom-verify-function-to-enable-nsis-signature-verification-alternatives-instead-of-powershell"

// System.Management.Automation.SignatureType.Catalog (None 0, Authenticode 1, Catalog 2). Get-AuthenticodeSignature reports the
// signer of a Windows security catalog that lists the file's hash in preference to the signature embedded in the file. A uniquely
// built update installer is in no catalog, so a catalog signature means the file is another (catalogued, e.g. in-box Windows)
// file. A missing SignatureType comes from a PowerShell that only checks embedded signatures.
const CATALOG_SIGNATURE_TYPE = 2

// The verification could not be done, as opposed to a signature that does not verify (a failure result, ERR_UPDATER_INVALID_SIGNATURE).
function cannotVerify(reason: string, options: { cause?: unknown; isPowerShellProblem?: boolean } = {}): Error {
  const hint = options.isPowerShellProblem === false ? "" : ` ${CUSTOM_VERIFIER_HINT}`
  const error = newError(`Cannot verify the Authenticode signature of the update, so it is not installed: ${reason}.${hint}`, "ERR_UPDATER_SIGNATURE_UNVERIFIABLE")
  if (options.cause !== undefined) {
    error.cause = options.cause
  }
  return error
}

function describeExecError(error: ExecFileException, stderr: string): string {
  if (error.killed) {
    return `Get-AuthenticodeSignature did not finish within ${VERIFY_TIMEOUT_MS / 1000}s`
  }
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return "Get-AuthenticodeSignature printed more output than a signature has"
  }
  if (typeof error.code === "number") {
    const details = stderr.trim()
    return `Get-AuthenticodeSignature failed with exit code ${error.code}${details.length > 0 ? `: ${details}` : ""}`
  }
  return `cannot run PowerShell: ${error.message}`
}

// PowerShell rebuilds a drive-qualified path from the drive's root (C:\), so the case of the drive letter may differ
function normalizeForComparison(file: string): string {
  return path.normalize(file).replace(/^[a-z]:/, drive => drive.toUpperCase())
}

// Get-AuthenticodeSignature reports the path of the file it verified: it must be the update file (it is not resolved through links).
function checkLiteralPath(data: any, updateFile: string, logger: Logger): void {
  if (typeof data.Path !== "string") {
    throw cannotVerify("Get-AuthenticodeSignature did not report the path of the verified file", { isPowerShellProblem: false })
  }
  const normalizedDataPath = normalizeForComparison(data.Path)
  const normalizedUpdateFile = normalizeForComparison(updateFile)
  logger.info(`LiteralPath: ${normalizedDataPath}. Update Path: ${normalizedUpdateFile}`)
  if (normalizedDataPath !== normalizedUpdateFile) {
    throw cannotVerify(`LiteralPath of ${normalizedDataPath} is different than ${normalizedUpdateFile}`, { isPowerShellProblem: false })
  }
}

// Parses Get-AuthenticodeSignature JSON, checks the LiteralPath guard, and matches against publisherNames. Returns a
// success/failure result; throws when the output cannot be parsed or names another file.
function evaluateSignatureResult(stdout: string, publisherNames: string[], updateFile: string, logger: Logger): VerifyUpdateFileResult {
  let data: any
  try {
    data = parseAuthenticodeSignatureOutput(stdout)
  } catch (e: any) {
    throw cannotVerify(`cannot parse the output of Get-AuthenticodeSignature (${e.message})`, { cause: e })
  }
  let reason = ""
  if (data.Status === 0) {
    checkLiteralPath(data, updateFile, logger)
    if (data.SignatureType === CATALOG_SIGNATURE_TYPE) {
      reason = "Windows reports the signer of a Windows security catalog for the update file instead of a signature embedded in it. "
    } else if (matchPublisherName(data, publisherNames, logger)) {
      return { response: "success" }
    }
  }
  const result = `${reason}publisherNames: ${publisherNames.join(" | ")}, raw info: ` + JSON.stringify(data, (name, value) => (name === "RawData" ? undefined : value), 2)
  logger.warn(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
  return { response: "failure", message: result }
}

// $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
// | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
// | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
export function verifySignature(publisherNames: Array<string>, updateFile: string, logger: Logger): Promise<VerifyUpdateFileResult> {
  logger.info(`Verifying signature ${updateFile}`)
  return new Promise<VerifyUpdateFileResult>((resolve, reject) => {
    try {
      execFile(...prepareAuthenticodeSignatureExec(updateFile, VERIFY_TIMEOUT_MS), (error, stdout, stderr) => {
        if (error != null) {
          reject(cannotVerify(describeExecError(error, String(stderr ?? "")), { cause: error }))
          return
        }
        if (stderr) {
          reject(cannotVerify(`Get-AuthenticodeSignature wrote to stderr: ${String(stderr).trim()}`))
          return
        }
        try {
          resolve(evaluateSignatureResult(stdout, publisherNames, updateFile, logger))
        } catch (e: any) {
          reject(e)
        }
      })
    } catch (e: any) {
      // PowerShell cannot be located (no SystemRoot) or started at all, e.g. blocked by AppLocker / WDAC
      reject(cannotVerify(`cannot run PowerShell: ${e.message}`, { cause: e }))
    }
  })
}
