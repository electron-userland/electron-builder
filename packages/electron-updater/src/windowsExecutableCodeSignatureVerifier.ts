import { parseDn } from "builder-util-runtime"
import { execFile, execFileSync, ExecFileOptions } from "child_process"
import * as os from "os"
import { Logger } from "./types.js"
import * as path from "path"

function preparePowerShellExec(command: string, timeout?: number) {
  // $PSHOME is a PS automatic variable pointing to the trusted PS installation directory.
  // Using the full path for Import-Module avoids relying on PSModulePath for module discovery,
  // which prevents a shadowing attack via user-writable PSModulePath entries.
  // $env:PSModulePath is also cleared inside the script as belt-and-suspenders.
  // https://github.com/electron-userland/electron-builder/issues/2421
  // https://github.com/electron-userland/electron-builder/issues/2535
  // https://github.com/electron-userland/electron-builder/issues/7127
  //
  // PSModulePath is stripped from the inherited env on the Node side so it is never
  // present when PowerShell starts.
  //
  // UTF-8 output encoding is configured inside PowerShell itself rather than via `chcp 65001`
  // (which required cmd.exe as the host). Both $OutputEncoding and [Console]::OutputEncoding
  // must be set so that ConvertTo-Json emits UTF-8 when stdout is captured by Node.
  // https://github.com/electron-userland/electron-builder/issues/8162
  // Suppress progress-stream output (CLIXML) before the first Import-Module so that
  // "Preparing modules for first use." records are never written to stderr, which would
  // otherwise be misidentified as a command error by the stderr check in verifySignature.
  const script = `$ProgressPreference = 'SilentlyContinue'; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Security"; $env:PSModulePath = ""; $OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; ${command}`
  const encodedCommand = Buffer.from(script, "utf16le").toString("base64")
  const args = ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-EncodedCommand", encodedCommand]
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.PSModulePath
  const options: ExecFileOptions = {
    shell: false,
    timeout,
    env,
  }
  return ["powershell.exe", args, options] as const
}

// Returns true if path verification passed or was skipped (missing data.Path).
// Returns false and calls reject() if a LiteralPath mismatch is detected.
function checkLiteralPath(data: any, unescapedTempUpdateFile: string, logger: Logger, reject: (reason: any) => void): boolean {
  try {
    const normalizedDataPath = path.normalize(data.Path)
    const normalizedTempUpdateFile = path.normalize(unescapedTempUpdateFile)
    logger.info(`LiteralPath: ${normalizedDataPath}. Update Path: ${normalizedTempUpdateFile}`)
    if (normalizedDataPath !== normalizedTempUpdateFile) {
      reject(new Error(`LiteralPath of ${normalizedDataPath} is different than ${normalizedTempUpdateFile}`))
      return false
    }
  } catch (error: any) {
    logger.warn(
      `Unable to verify LiteralPath of update asset due to missing data.Path. Skipping this step of validation. Message: ${error.message ?? error.stack}. ` +
        "This fail-open behavior is deprecated: electron-builder v28 will treat a missing/mismatched LiteralPath as a verification failure (fail-closed)."
    )
  }
  return true
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
// string on failure. When checkLiteralPath detects a mismatch it calls
// reject() directly and this function returns null.
function evaluateSignatureResult(stdout: string, publisherNames: string[], unescapedTempUpdateFile: string, logger: Logger, reject: (reason: any) => void): string | null {
  const data = parseOut(stdout)
  if (data.Status === 0) {
    if (!checkLiteralPath(data, unescapedTempUpdateFile, logger, reject)) {
      return null
    }
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
  // Single quotes in the path are doubled for PS single-quoted strings ('don''t' → don't).
  // Other PS metacharacters ($, `, \) are literal inside single-quoted strings.
  const tempUpdateFile = unescapedTempUpdateFile.replace(/'/g, "''")
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
        resolve(evaluateSignatureResult(stdout, publisherNames, unescapedTempUpdateFile, logger, reject))
      } catch (e: any) {
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
