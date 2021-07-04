import { parseDn } from "builder-util-runtime"
import { execFile, execFileSync } from "child_process"
import * as os from "os"
import { Logger } from "./main"

// $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
// | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
// | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
export function verifySignature(publisherNames: Array<string>, unescapedTempUpdateFile: string, logger: Logger): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    // Escape quotes and backticks in filenames to prevent user from breaking the
    // arguments and perform a remote command injection.
    //
    // Consider example powershell command:
    // ```powershell
    // Get-AuthenticodeSignature 'C:\\path\\my-bad-';calc;'filename.exe'
    // ```
    // The above would work expected and find the file name, however, it will also execute `;calc;`
    // command and start the calculator app.
    //
    // From Powershell quoting rules:
    // https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules?view=powershell-7
    // * Double quotes `"` are treated literally within single-quoted strings;
    // * Single quotes can be escaped by doubling them: 'don''t' -> don't;
    // * Backticks can be escaped by doubling them: 'A backtick (``) character';
    //
    // Also note that at this point the file has already been written to the disk, thus we are
    // guaranteed that the path will not contain any illegal characters like <>:"/\|?*
    // https://docs.microsoft.com/en-us/windows/win32/fileio/naming-a-file
    const tempUpdateFile = unescapedTempUpdateFile.replace(/'/g, "''").replace(/`/g, "``")

    // https://github.com/electron-userland/electron-builder/issues/2421
    // https://github.com/electron-userland/electron-builder/issues/2535
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-InputFormat",
        "None",
        "-Command",
        `Get-AuthenticodeSignature '${tempUpdateFile}' | ConvertTo-Json -Compress | ForEach-Object { [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($_)) }`,
      ],
      {
        timeout: 20 * 1000,
      },
      (error, stdout, stderr) => {
        try {
          if (error != null || stderr) {
            handleError(logger, error, stderr)
            resolve(null)
            return
          }

          const data = parseOut(Buffer.from(stdout, "base64").toString("utf-8"))
          if (data.Status === 0) {
            const name = parseDn(data.SignerCertificate.Subject).get("CN")!
            if (publisherNames.includes(name)) {
              resolve(null)
              return
            }
          }

          const result = `publisherNames: ${publisherNames.join(" | ")}, raw info: ` + JSON.stringify(data, (name, value) => (name === "RawData" ? undefined : value), 2)
          logger.warn(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
          resolve(result)
        } catch (e) {
          logger.warn(`Cannot execute Get-AuthenticodeSignature: ${error}. Ignoring signature validation due to unknown error.`)
          resolve(null)
          return
        }
      }
    )
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
  delete data.Path
  return data
}

function handleError(logger: Logger, error: Error | null, stderr: string | null): void {
  if (isOldWin6()) {
    logger.warn(
      `Cannot execute Get-AuthenticodeSignature: ${error || stderr}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`
    )
    return
  }

  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "ConvertTo-Json test"], { timeout: 10 * 1000 } as any)
  } catch (testError) {
    logger.warn(
      `Cannot execute ConvertTo-Json: ${testError.message}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`
    )
    return
  }

  if (error != null) {
    throw error
  }

  if (stderr) {
    logger.warn(`Cannot execute Get-AuthenticodeSignature, stderr: ${stderr}. Ignoring signature validation due to unknown stderr.`)
    return
  }
}

function isOldWin6(): boolean {
  const winVersion = os.release()
  return winVersion.startsWith("6.") && !winVersion.startsWith("6.3")
}
