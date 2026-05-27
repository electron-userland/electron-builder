import { createDecipheriv, createHash } from "crypto"
import * as asn1js from "asn1js"
import * as pkijs from "pkijs"
import { Crypto as PeculiarCrypto } from "@peculiar/webcrypto"
import { readFile } from "fs-extra"
import { log } from "builder-util"

// OID for codeSigning extended key usage
const CODE_SIGNING_OID = "1.3.6.1.5.5.7.3.3"

// OID for the PKCS#12 certificate bag type
const CERT_BAG_OID = "1.2.840.113549.1.12.10.1.3"

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

// Set up the pkijs WebCrypto engine once. @peculiar/webcrypto supports legacy cipher suites
// (RC2, 3DES) used by real-world CA-issued PFX files, unlike native Node.js WebCrypto.
const peculiarCrypto = new PeculiarCrypto()
pkijs.setEngine("peculiar", new pkijs.CryptoEngine({ name: "peculiar", crypto: peculiarCrypto as any, subtle: peculiarCrypto.subtle }) as any)

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength)
  new Uint8Array(ab).set(buf)
  return ab
}

// ── PKCS#12 legacy PBE support (RFC 7292 Appendix B) ───────────────────────
//
// pkijs's CryptoEngine.decryptEncryptedContentInfo only handles PBES2
// (OID 1.2.840.113549.1.5.13). Many real-world PFX files use the older
// pkcs-12PbeIds ciphers (SHA1+3DES, SHA1+2DES). We implement these below
// using Node.js's built-in `crypto` module so no extra dependency is needed.

/** PKCS#12 legacy PBE OIDs (pkcs-12PbeIds) and their cipher parameters. */
const PKCS12_PBE_ALGOS: Record<string, { cipher: string; keyLen: number; ivLen: number }> = {
  "1.2.840.113549.1.12.1.3": { cipher: "des-ede3-cbc", keyLen: 24, ivLen: 8 }, // pbeWithSHAAnd3KeyTripleDESCBC
  "1.2.840.113549.1.12.1.4": { cipher: "des-ede-cbc", keyLen: 16, ivLen: 8 }, //  pbeWithSHAAnd2KeyTripleDESCBC
}

/**
 * Maximum PKCS#12 PBE iteration count accepted.
 *
 * A maliciously crafted PFX can set iterations to Number.MAX_SAFE_INTEGER,
 * causing the SHA-1 loop to run for an arbitrary amount of time (DoS).
 * Real-world PFX files use 1 000–50 000 iterations; this cap is generous
 * enough to accommodate even unusually high-security certs while blocking
 * obviously hostile inputs.
 */
const MAX_PKCS12_PBE_ITERATIONS = 300_000

/**
 * PKCS#12 key/IV derivation function from RFC 7292 Appendix B (SHA-1 variant).
 * id = 1 to derive a key, id = 2 to derive an IV.
 *
 * Throws if `iterations` is outside [1, MAX_PKCS12_PBE_ITERATIONS] to prevent
 * CPU exhaustion from a crafted PFX file.
 */
function pkcs12PbeDeriveKey(password: Buffer, salt: Buffer, iterations: number, id: number, length: number): Buffer {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PKCS12_PBE_ITERATIONS) {
    throw new Error(
      `PKCS#12 PBE iteration count ${iterations} is outside safe range [1, ${MAX_PKCS12_PBE_ITERATIONS}]; refusing to process — the file may be crafted to exhaust CPU`
    )
  }

  const u = 20 // SHA-1 output bytes
  const v = 64 // SHA-1 block bytes

  // Step 1: D = ID byte repeated v times
  const D = Buffer.alloc(v, id)

  // Step 2: S = salt bytes repeated to fill ceil(salt.length / v) * v bytes
  const sLen = salt.length > 0 ? Math.ceil(salt.length / v) * v : 0
  const S = Buffer.alloc(sLen)
  for (let i = 0; i < sLen; i++) {
    S[i] = salt[i % salt.length]
  }

  // Step 3: P = password bytes repeated to fill ceil(password.length / v) * v bytes
  const pLen = password.length > 0 ? Math.ceil(password.length / v) * v : 0
  const P = Buffer.alloc(pLen)
  for (let i = 0; i < pLen; i++) {
    P[i] = password[i % password.length]
  }

  // Step 4: I = S || P (mutable, updated in step 6C)
  const I = new Uint8Array(Buffer.concat([S, P]))

  const c = Math.ceil(length / u)
  const result = Buffer.alloc(c * u)

  for (let i = 0; i < c; i++) {
    // Step 6A: A_i = H^iterations(D || I)
    let Ai: Buffer = createHash("sha1").update(D).update(Buffer.from(I)).digest()
    for (let j = 1; j < iterations; j++) {
      Ai = createHash("sha1").update(Ai).digest()
    }
    Ai.copy(result, i * u)

    // Step 6B: B = A_i repeated to fill v bytes
    const B = new Uint8Array(v)
    for (let j = 0; j < v; j++) {
      B[j] = Ai[j % u]
    }

    // Step 6C: each v-byte block of I is incremented by (B + 1) mod 2^(v*8)
    const blockCount = Math.ceil(I.length / v)
    for (let j = 0; j < blockCount; j++) {
      let carry = 1
      for (let b = v - 1; b >= 0; b--) {
        const idx = j * v + b
        if (idx < I.length) {
          const sum = I[idx] + B[b] + carry
          I[idx] = sum & 0xff
          carry = sum >> 8
        }
      }
    }
  }

  return result.subarray(0, length)
}

/**
 * Encode a password as UTF-16 Big Endian with a null terminator, which is the
 * format required by PKCS#12 PBE key derivation (RFC 7292).
 * An empty string yields [0x00, 0x00] (just the null terminator).
 */
function pkcs12PasswordToUtf16(password: string): Buffer {
  const buf = Buffer.alloc((password.length + 1) * 2)
  for (let i = 0; i < password.length; i++) {
    const code = password.charCodeAt(i)
    buf[i * 2] = (code >> 8) & 0xff
    buf[i * 2 + 1] = code & 0xff
  }
  // Last two bytes are already 0x00 0x00 (null terminator) from Buffer.alloc.
  return buf
}

/**
 * Decrypt PKCS#12 legacy PBE encrypted content using Node.js crypto.
 *
 * @param algId   - OID from PKCS12_PBE_ALGOS
 * @param algParams - asn1js object for PKCS12PBEParams (SEQUENCE { OCTET STRING, INTEGER })
 * @param encContent - asn1js object for the encrypted content (Constructed or Primitive [0] IMPLICIT)
 * @param password - plain-text password string
 */
function decryptLegacyPkcs12Pbe(algId: string, algParams: any, encContent: any, password: string): Buffer {
  const algo = PKCS12_PBE_ALGOS[algId]

  // PKCS12PBEParams ::= SEQUENCE { salt OCTET STRING, iterations INTEGER }
  const salt = Buffer.from(algParams.valueBlock.value[0].valueBlock.valueHexView)
  const iterations = Number(algParams.valueBlock.value[1].valueBlock.valueDec)

  const pwdBytes = pkcs12PasswordToUtf16(password)
  const key = pkcs12PbeDeriveKey(pwdBytes, salt, iterations, 1, algo.keyLen)
  const iv = pkcs12PbeDeriveKey(pwdBytes, salt, iterations, 2, algo.ivLen)

  // Extract raw encrypted bytes from the [0] IMPLICIT OCTET STRING.
  // The encryptedContent field can be a Constructed (fragmented) or Primitive tag.
  let encBytes: Buffer
  if (encContent.idBlock?.isConstructed) {
    encBytes = Buffer.concat((encContent.valueBlock.value as any[]).map((p: any) => Buffer.from(p.valueBlock.valueHexView)))
  } else {
    encBytes = Buffer.from(encContent.valueBlock.valueHexView)
  }

  const decipher = createDecipheriv(algo.cipher, key, iv)
  return Buffer.concat([decipher.update(encBytes), decipher.final()])
}

/**
 * Reads certificate info from a PKCS#12 (.pfx) file using pkijs (unobfuscated TypeScript).
 * Mirrors the `certificate-info` subcommand of app-builder-bin.
 * https://github.com/develar/app-builder/blob/master/pkg/codesign/p12.go
 *
 * Returns { commonName, bloodyMicrosoftSubjectDn } on success.
 *
 * Known divergences from the Go binary:
 * - No OpenSSL fallback when the pure PKCS#12 decoder fails for a non-password reason.
 * - Unknown OIDs are rendered using the raw numeric OID as the type name (e.g. `2.5.4.100=value`); Go uses `OID=#hexbytes` when ASN.1 marshal succeeds.
 * - RDN ordering uses DER order; Go normalizes via pkix.Name.ToRDNSequence then reverses via
 *   BloodyMsString. These coincide for pkijs-generated certs (CN-first DER) but may
 *   differ for real CA-issued certs stored in traditional C-first DER order.
 */
export async function readCertInfo(file: string, password: string): Promise<{ commonName: string; bloodyMicrosoftSubjectDn: string }> {
  const pfxDer = await readFile(file)

  // asn1js requires a plain ArrayBuffer
  const pfxBuf = toArrayBuffer(pfxDer)
  let asn1: ReturnType<typeof asn1js.fromBER>
  try {
    asn1 = asn1js.fromBER(pfxBuf)
    if (asn1.offset === -1) {
      throw new Error("offset -1: invalid BER encoding")
    }
  } catch (err) {
    throw new Error(`PKCS#12 file "${file}" contains invalid ASN.1/DER data: ${err instanceof Error ? err.message : String(err)}`)
  }

  const pfx = new pkijs.PFX({ schema: asn1.result })
  const pwBuf = toArrayBuffer(Buffer.from(password, "utf-8"))

  // Step 1: Verify MAC (or signature) integrity and parse the AuthenticatedSafe container.
  // pkijs throws "Integrity for the PKCS#12 data is broken!" on wrong password.
  try {
    await pfx.parseInternalValues({ password: pwBuf, checkIntegrity: true })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    const lower = detail.toLowerCase()
    if (lower.includes("integrity") || lower.includes("mac") || lower.includes("password") || lower.includes("pkcs#12")) {
      throw new Error(`password incorrect for certificate file "${file}" — verify the password matches the PFX. pkijs detail: ${detail}`)
    }
    log.debug({ file, error: detail }, "pkijs failed to decode PKCS#12; no OpenSSL fallback available in Node.js")
    throw new Error(`Failed to decode PKCS#12 file "${file}" — the file may be corrupt, use an unsupported cipher, or require OpenSSL. pkijs detail: ${detail}`)
  }

  const authSafe = pfx.parsedValue?.authenticatedSafe
  if (authSafe == null) {
    throw new Error(`Failed to parse AuthenticatedSafe in PKCS#12 file "${file}"`)
  }

  // Step 2: Iterate over the authenticated-safe ContentInfos and extract all certificates.
  //
  // We do NOT call authSafe.parseInternalValues() because pkijs's CryptoEngine only handles
  // PBES2 (OID 1.2.840.113549.1.5.13) for EncryptedData. Real-world PFX files (including
  // CA-issued and electron-builder-generated certs) often use the older pkcs-12PbeIds ciphers
  // (e.g. pbeWithSHAAnd3KeyTripleDESCBC). We handle those with our own Node.js crypto path.
  const certs: pkijs.Certificate[] = []

  for (const ci of authSafe.safeContents) {
    let safeBER: ArrayBuffer

    if (ci.contentType === pkijs.id_ContentType_Data) {
      // Data: content is an OCTET STRING containing DER-encoded SafeContents.
      safeBER = (ci.content as asn1js.OctetString).getValue()
    } else if (ci.contentType === pkijs.id_ContentType_EncryptedData) {
      // EncryptedData: decrypt the SafeContents, routing by algorithm OID.
      const encData = new pkijs.EncryptedData({ schema: ci.content })
      const algId = encData.encryptedContentInfo.contentEncryptionAlgorithm.algorithmId

      if (Object.prototype.hasOwnProperty.call(PKCS12_PBE_ALGOS, algId)) {
        // Legacy PKCS#12 PBE (pbeWithSHAAnd*) — use our RFC 7292 implementation.
        const decrypted = decryptLegacyPkcs12Pbe(
          algId,
          encData.encryptedContentInfo.contentEncryptionAlgorithm.algorithmParams,
          encData.encryptedContentInfo.encryptedContent,
          password
        )
        safeBER = toArrayBuffer(decrypted)
      } else {
        // PBES2 or other modern OID — delegate to the pkijs engine.
        safeBER = await encData.decrypt({ password: pwBuf })
      }
    } else {
      // EnvelopedData or other types — skip (not needed for cert extraction).
      continue
    }

    // Parse SafeContents and collect X.509 certificates from cert bags.
    const sc = pkijs.SafeContents.fromBER(safeBER)
    for (const bag of sc.safeBags) {
      if (bag.bagId === CERT_BAG_OID) {
        const certBag = bag.bagValue as pkijs.CertBag
        if (certBag.parsedValue instanceof pkijs.Certificate) {
          certs.push(certBag.parsedValue)
        }
      }
    }
  }

  if (certs.length === 0) {
    throw new Error(`No certificates found in PKCS#12 file "${file}" — the file may be a key-only PFX or be empty`)
  }

  // Find the certificate with the codeSigning Extended Key Usage.
  // pkijs auto-parses known extensions via ExtensionValueFactory (registered at module init).
  const signingCert = certs.find(cert => {
    const ekuExt = cert.extensions?.find(e => e.extnID === pkijs.id_ExtKeyUsage)
    if (ekuExt == null) {
      return false
    }
    if (ekuExt.parsedValue instanceof pkijs.ExtKeyUsage) {
      return ekuExt.parsedValue.keyPurposes.includes(CODE_SIGNING_OID)
    }
    // Fallback: manually parse the extension OctetString value.
    try {
      const inner = asn1js.fromBER(ekuExt.extnValue.valueBlock.valueHexView)
      if (inner.offset === -1) {
        return false
      }
      const eku = new pkijs.ExtKeyUsage({ schema: inner.result })
      return eku.keyPurposes.includes(CODE_SIGNING_OID)
    } catch {
      return false
    }
  })

  if (signingCert == null) {
    throw new Error(
      `No certificate with ExtKeyUsageCodeSigning found in "${file}" — ${certs.length} certificate(s) present but none have the codeSigning extended key usage. ` +
        `Ensure the PFX contains a code-signing certificate, not just a CA or TLS certificate.`
    )
  }

  const cnAttr = signingCert.subject.typesAndValues.find(a => a.type === "2.5.4.3")
  const commonName = String(cnAttr?.value.valueBlock.value ?? "")

  // Format DN as "CN=X,O=X,..." matching Go's BloodyMsString output.
  // Uses ATTRIBUTE_TYPE_NAMES to mirror Go's attributeTypeNames map exactly, so STREET,
  // POSTALCODE, and SERIALNUMBER (present in EV code-signing certs) are handled correctly.
  // Unknown OIDs fall back to the bare OID string as the type name.
  const bloodyMicrosoftSubjectDn = signingCert.subject.typesAndValues
    .map(a => {
      const typeName = ATTRIBUTE_TYPE_NAMES[a.type] ?? a.type
      return `${typeName}=${escapeDnValue(String(a.value.valueBlock.value))}`
    })
    .join(",")

  return { commonName, bloodyMicrosoftSubjectDn }
}

/**
 * Internal functions exported exclusively for unit testing.
 * Not part of the public API — do not use outside of test files.
 */
export const _testingOnly = {
  pkcs12PbeDeriveKey,
  pkcs12PasswordToUtf16,
  MAX_PKCS12_PBE_ITERATIONS,
}
