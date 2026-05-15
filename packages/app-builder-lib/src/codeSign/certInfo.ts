import * as forge from "node-forge"
import { readFile } from "fs-extra"
import { log } from "builder-util"

// OID for codeSigning extended key usage
const CODE_SIGNING_OID = "1.3.6.1.5.5.7.3.3"

// Maps certificate attribute OIDs to their short names.
// Matches the attributeTypeNames map in the Go reference implementation exactly:
// https://github.com/develar/app-builder/blob/master/pkg/codesign/p12.go
const ATTRIBUTE_TYPE_NAMES: Record<string, string> = {
  "2.5.4.6": "C",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "2.5.4.3": "CN",
  "2.5.4.5": "SERIALNUMBER",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.9": "STREET",
  "2.5.4.17": "POSTALCODE",
}

// Characters that must be quoted in a DN value to match Go binary BloodyMsString output
const NEEDS_DN_ESCAPING = /[,+"\\<>;]/

function escapeDnValue(value: string): string {
  if (NEEDS_DN_ESCAPING.test(value)) {
    // Escape embedded double-quotes by doubling them, then wrap entire value in quotes
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Reads certificate info from a PKCS#12 (.pfx) file using pure JS.
 * Mirrors the `certificate-info` subcommand of app-builder-bin.
 * https://github.com/develar/app-builder/blob/master/pkg/codesign/p12.go
 *
 * Returns { commonName, bloodyMicrosoftSubjectDn } on success.
 *
 * Known divergences from the Go binary:
 * - No OpenSSL fallback when the pure PKCS#12 decoder fails for a non-password reason.
 * - Unknown OIDs are rendered as `OID=value`; Go uses `OID=#hexbytes` when ASN.1 marshal succeeds.
 * - RDN ordering uses DER order; Go normalizes via pkix.Name.ToRDNSequence then reverses via
 *   BloodyMsString. These coincide for node-forge-generated certs (CN-first DER) but may
 *   differ for real CA-issued certs stored in traditional C-first DER order.
 */
export async function readCertInfo(file: string, password: string): Promise<{ commonName: string; bloodyMicrosoftSubjectDn: string }> {
  const pfxDer = await readFile(file)

  let p12Asn1: forge.asn1.Asn1
  try {
    p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxDer.toString("binary")))
  } catch (err) {
    throw new Error(`PKCS#12 file "${file}" contains invalid ASN.1/DER data: ${err instanceof Error ? err.message : String(err)}`)
  }

  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    const detailLower = detail.toLowerCase()
    if (detailLower.includes("mac") || detailLower.includes("password") || detailLower.includes("pkcs#12")) {
      throw new Error(`password incorrect for certificate file "${file}" — verify the password matches the PFX. node-forge detail: ${detail}`)
    }
    // For unexpected parse failures the Go binary would attempt an OpenSSL fallback, which is not available in Node.js. Log at debug so the raw cause is visible under --debug.
    log.debug({ file, error: detail }, "node-forge failed to decode PKCS#12; no OpenSSL fallback available in Node.js")
    throw new Error(`Failed to decode PKCS#12 file "${file}" — the file may be corrupt, use an unsupported cipher, or require OpenSSL. node-forge detail: ${detail}`)
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
  const bags = certBags[forge.pki.oids.certBag] ?? []

  if (bags.length === 0) {
    throw new Error(`No certificates found in PKCS#12 file "${file}" — the file may be a key-only PFX or be empty`)
  }

  const signingCert = bags.find(bag => {
    const cert = bag.cert
    if (cert == null) {
      return false
    }
    const ekuExt = cert.getExtension("extKeyUsage") as any
    return ekuExt != null && (ekuExt.codeSigning === true || ekuExt[CODE_SIGNING_OID] === true)
  })

  if (signingCert == null || signingCert.cert == null) {
    throw new Error(
      `No certificate with ExtKeyUsageCodeSigning found in "${file}" — ${bags.length} certificate(s) present but none have the codeSigning extended key usage. ` +
        `Ensure the PFX contains a code-signing certificate, not just a CA or TLS certificate.`
    )
  }

  const cert = signingCert.cert
  const commonName = ((cert.subject.getField("CN") as forge.pki.CertificateField | null)?.value as string) ?? ""

  // Format DN as "CN=X,O=X,..." matching Go's BloodyMsString output.
  // Uses ATTRIBUTE_TYPE_NAMES to mirror Go's attributeTypeNames map exactly, so STREET,
  // POSTALCODE, and SERIALNUMBER (present in EV code-signing certs) are handled correctly.
  // Unknown OIDs fall back to the bare OID string as the type name, matching Go's behaviour
  // when ASN.1 marshalling of the value fails.
  const bloodyMicrosoftSubjectDn = cert.subject.attributes
    .filter((a: forge.pki.CertificateField) => a.type != null)
    .map((a: forge.pki.CertificateField) => {
      const typeName = ATTRIBUTE_TYPE_NAMES[a.type!] ?? a.type!
      return `${typeName}=${escapeDnValue(String(a.value))}`
    })
    .join(",")

  return { commonName, bloodyMicrosoftSubjectDn }
}
