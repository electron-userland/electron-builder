import * as forge from "node-forge"
import { readFile } from "fs-extra"
import { CertificateInfo } from "./windowsSignToolManager"

// OID for codeSigning extended key usage
const CODE_SIGNING_OID = "1.3.6.1.5.5.7.3.3"

/**
 * Reads certificate info from a PKCS#12 (.pfx) file using pure JS.
 * Mirrors the `certificate-info` subcommand of app-builder-bin.
 *
 * Returns { commonName, bloodyMicrosoftSubjectDn } on success.
 * Throws with message "password incorrect" on bad password.
 * Throws with message about missing codeSigning EKU when the cert lacks it.
 */
export async function readCertInfo(file: string, password: string): Promise<CertificateInfo> {
  const pfxDer = await readFile(file)
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxDer))

  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
  } catch {
    throw new Error("password incorrect")
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
  const bags = certBags[forge.pki.oids.certBag] ?? []

  const signingCert = bags.find(bag => {
    const cert = bag.cert
    if (cert == null) {
      return false
    }
    const ekuExt = cert.getExtension("extKeyUsage") as any
    return ekuExt != null && (ekuExt.codeSigning === true || ekuExt[CODE_SIGNING_OID] === true)
  })

  if (signingCert == null || signingCert.cert == null) {
    throw new Error("no certificates with ExtKeyUsageCodeSigning")
  }

  const cert = signingCert.cert
  const commonName = ((cert.subject.getField("CN") as forge.pki.CertificateField | null)?.value as string) ?? ""

  // Format DN as "CN=X,O=X,..." — comma-separated, no spaces, matching app-builder output
  const bloodyMicrosoftSubjectDn = cert.subject.attributes
    .filter((a: forge.pki.CertificateField) => a.shortName != null)
    .map((a: forge.pki.CertificateField) => `${a.shortName}=${a.value}`)
    .join(",")

  return { commonName, bloodyMicrosoftSubjectDn }
}
