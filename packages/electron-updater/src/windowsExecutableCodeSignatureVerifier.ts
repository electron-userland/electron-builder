import BluebirdPromise from "bluebird-lst"
import { parseDn } from "builder-util-runtime"
import { execFile, execFileSync } from "child_process"
import { Logger } from "./main"

// $certificateInfo = (Get-AuthenticodeSignature 'xxx\yyy.exe'
// | where {$_.Status.Equals([System.Management.Automation.SignatureStatus]::Valid) -and $_.SignerCertificate.Subject.Contains("CN=siemens.com")})
// | Out-String ; if ($certificateInfo) { exit 0 } else { exit 1 }
export function verifySignature(publisherNames: Array<string>, tempUpdateFile: string, logger: Logger): Promise<string | null> {
  return new BluebirdPromise<string | null>((resolve, reject) => {
    execFile("powershell.exe", [`Get-AuthenticodeSignature '${tempUpdateFile}' | ConvertTo-Json -Compress`], {
      maxBuffer: 4 * 1024000,
      timeout: 60 * 1000
    }, (error, stdout, stderr) => {
      if (error != null || stderr) {
        try {
          execFileSync("powershell.exe", ["ConvertTo-Json test"], {timeout: 10 * 1000})
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

      const result = JSON.stringify(data, (name, value) => name === "RawData" ? undefined : value, 2)
      logger.info(`Sign verification failed, installer signed with incorrect certificate: ${result}`)
      resolve(result)
    })
  })
}
