import BluebirdPromise from "bluebird-lst"
import { parseDn } from "builder-util-runtime"
import { execFile, execFileSync } from "child_process"
import * as os from "os"
import { Logger } from "./main"

// $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
// | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
// | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
export function verifySignature(publisherNames: Array<string>, tempUpdateFile: string, logger: Logger): Promise<string | null> {
  return new BluebirdPromise<string | null>((resolve, reject) => {
    // https://github.com/electron-userland/electron-builder/issues/2421
    // https://github.com/electron-userland/electron-builder/issues/2535
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-Command", `Get-AuthenticodeSignature '${tempUpdateFile}' | ConvertTo-Json -Compress`], {
      timeout: 30 * 1000
    }, (error, stdout, stderr) => {
      if (error != null || stderr) {
        if (isOldWin6()) {
          logger.warn(`Cannot execute Get-AuthenticodeSignature: ${error || stderr}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`)
          resolve(null)
          return
        }

        try {
          execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "ConvertTo-Json test"], {timeout: 10 * 1000})
        }
        catch (testError) {
          logger.warn(`Cannot execute ConvertTo-Json: ${testError.message}. Ignoring signature validation due to unsupported powershell version. Please upgrade to powershell 3 or higher.`)
          resolve(null)
          return
        }

        if (error != null) {
          reject(error)
          return
        }

        if (stderr) {
          reject(new Error(`Cannot execute Get-AuthenticodeSignature: ${stderr}`))
          return
        }
      }

      const data = JSON.parse(stdout)
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

      if (data.Status === 0) {
        const name = parseDn(data.SignerCertificate.Subject).get("CN")!
        if (publisherNames.includes(name)) {
          resolve(null)
          return
        }
      }

      const result = `publisherNames: ${publisherNames.join(" | ")}, raw info: ` + JSON.stringify(data, (name, value) => name === "RawData" ? undefined : value, 2)
      logger.info(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
      resolve(result)
    })
  })
}

function isOldWin6() {
  const winVersion = os.release()
  return winVersion.startsWith("6.") && !winVersion.startsWith("6.3")
}
