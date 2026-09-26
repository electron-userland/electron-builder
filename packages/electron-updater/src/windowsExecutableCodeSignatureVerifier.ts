import { parseDn } from "builder-util-runtime"
import { execFile, execFileSync, ExecFileOptions } from "child_process"
import * as os from "os"
import { Logger } from "./types.js"
import * as path from "path"
import { buildPowerShellArgs, escapePowerShellSingleQuoted, stripPsModulePath } from "./windowsPowerShell.js"

function preparePowerShellExec(command: string, timeout?: number) {
  // hardened invocation (explicit $PSHOME module import, PSModulePath cleared and stripped from the env,
  // UTF-8 output, progress stream suppressed, -EncodedCommand): see windowsPowerShell.ts
  const args = buildPowerShellArgs(command, { modules: ["Microsoft.PowerShell.Security"] })
  const options: ExecFileOptions = {
    shell: false,
    timeout,
    env: stripPsModulePath(process.env),
  }
  return ["powershell.exe", args, options] as const
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

// Returns true if any entry in publisherNames matches the signing certificate subject.
function matchPublisher(data: any, publisherNames: string[], logger: Logger): boolean {
  const subject = parseDn(data.SignerCertificate.Subject)
  for (const name of publisherNames) {
    const dn = parseDn(name)
    if (dn.size) {
      // if we have a full DN, compare all values
      const allKeys = Array.from(dn.keys())
      if (allKeys.every(key => dn.get(key) === subject.get(key))) {
        return true
      }
    } else if (name === subject.get("CN")!) {
      logger.warn(`Signature validated using only CN ${name}. Please add your full Distinguished Name (DN) to publisherNames configuration`)
      return true
    }
  }
  return false
}

// Parses Get-AuthenticodeSignature JSON, checks the LiteralPath guard, and
// matches against publisherNames. Returns null on success or a diagnostic
// string on failure. Throws LiteralPathMismatchError when checkLiteralPath
// detects a mismatch.
function evaluateSignatureResult(stdout: string, publisherNames: string[], unescapedTempUpdateFile: string, logger: Logger): string | null {
  const data = parseOut(stdout)
  if (data.Status === 0) {
    checkLiteralPath(data, unescapedTempUpdateFile, logger)
    if (matchPublisher(data, publisherNames, logger)) {
      return null
    }
  }
  const result = `publisherNames: ${publisherNames.join(" | ")}, raw info: ` + JSON.stringify(data, (name, value) => (name === "RawData" ? undefined : value), 2)
  logger.warn(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
  return result
}

// $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
// | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
// | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
export function verifySignature(publisherNames: Array<string>, unescapedTempUpdateFile: string, logger: Logger): Promise<string | null> {
  // escaped for the PS single-quoted string literal (plain and Unicode single quotes doubled)
  const tempUpdateFile = escapePowerShellSingleQuoted(unescapedTempUpdateFile)
  logger.info(`Verifying signature ${tempUpdateFile}`)
  return new Promise<string | null>((resolve, reject) => {
    execFile(...preparePowerShellExec(`Get-AuthenticodeSignature -LiteralPath '${tempUpdateFile}' | ConvertTo-Json -Compress`, 20 * 1000), (error, stdout, stderr) => {
      if (error != null || stderr) {
        if (handleError(logger, error, stderr, reject)) {
          resolve(null)
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
          resolve(null)
        }
      }
    })
  })
}

function parseOut(out: string): any {
  const data = JSON.parse(out)
  delete data.PrivateKey
  delete data.IsOSBinary
  delete data.SignatureType
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

// Returns true when the error is ignored (caller should resolve null).
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
