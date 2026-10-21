import * as asn1js from "asn1js"
import { escapePowerShellSingleQuotes, parseAuthenticodeSignatureOutput, preparePowerShellExec } from "builder-util-runtime"
import { execFile } from "child_process"
import { open } from "fs/promises"
import * as pkijs from "pkijs"

/**
 * Values of `System.Management.Automation.SignatureStatus`. `ConvertTo-Json` serializes the enum as its numeric
 * value, which is the representation {@link AuthenticodeSignerInfo} carries.
 */
export const AuthenticodeSignatureStatus = {
  Valid: 0,
  UnknownError: 1,
  NotSigned: 2,
  HashMismatch: 3,
  NotTrusted: 4,
  NotSupportedFileFormat: 5,
  Incompatible: 6,
} as const

/** Returns the `SignatureStatus` name of a numeric status (e.g. `HashMismatch` for 3), or the number itself when unknown. */
export function authenticodeSignatureStatusName(status: number | null): string {
  if (status == null) {
    return "unknown"
  }
  for (const [name, value] of Object.entries(AuthenticodeSignatureStatus)) {
    if (value === status) {
      return name
    }
  }
  return String(status)
}

/**
 * The embedded Authenticode signature of a Windows executable, as far as the update signature check needs it:
 * - `signed` — the subject of the certificate that made the (primary) signature, in the format Windows reports it
 *   (`X509Certificate2.Subject`), plus the numeric `SignatureStatus` (see {@link AuthenticodeSignatureStatus}) when
 *   the host can verify it (Windows only)
 * - `unsigned` — the file has no embedded signature
 * - `unreadable` — the signature could not be read (`reason` says why)
 */
export type AuthenticodeSignerInfo =
  | { readonly type: "signed"; readonly subject: string; readonly status: number | null }
  | { readonly type: "unsigned"; readonly reason: string }
  | { readonly type: "unreadable"; readonly reason: string }

export type AuthenticodeSignerReader = (file: string) => Promise<AuthenticodeSignerInfo>

/**
 * Reads the signer of a Windows executable's embedded Authenticode signature: on Windows with
 * `Get-AuthenticodeSignature`, the very API electron-updater verifies downloaded updates with; elsewhere by parsing
 * the PE certificate table and its PKCS#7 signature directly (no external tool needed).
 */
export function readAuthenticodeSigner(file: string): Promise<AuthenticodeSignerInfo> {
  return process.platform === "win32" ? readAuthenticodeSignerWithPowerShell(file) : readEmbeddedAuthenticodeSigner(file)
}

// ─── Windows: Get-AuthenticodeSignature ──────────────────────────────────────

/**
 * Reads the signer with `Get-AuthenticodeSignature`, with the helpers electron-updater verifies downloaded updates
 * with (builder-util-runtime: the same PowerShell invocation, path escaping and JSON parsing), so the build sees
 * exactly what the updater will see.
 */
export function readAuthenticodeSignerWithPowerShell(file: string): Promise<AuthenticodeSignerInfo> {
  const escapedFile = escapePowerShellSingleQuotes(file)
  return new Promise<AuthenticodeSignerInfo>(resolve => {
    // longer than the updater's 20s: a busy build machine may still be preparing the PowerShell modules on first use,
    // and a timeout here fails the build
    execFile(...preparePowerShellExec(`Get-AuthenticodeSignature -LiteralPath '${escapedFile}' | ConvertTo-Json -Compress`, 60 * 1000), (error, stdout, stderr) => {
      if (error != null) {
        const stderrText = String(stderr ?? "").trim()
        resolve({ type: "unreadable", reason: `Get-AuthenticodeSignature failed: ${error.message}${stderrText.length > 0 ? `\n${stderrText}` : ""}` })
        return
      }
      let data: unknown
      try {
        data = parseAuthenticodeSignatureOutput(stdout)
      } catch (e: any) {
        resolve({ type: "unreadable", reason: `cannot parse Get-AuthenticodeSignature output (${e.message}): ${stdout}` })
        return
      }
      const status = getProperty(data, "Status")
      const numericStatus = typeof status === "number" ? status : null
      const subject = getProperty(getProperty(data, "SignerCertificate"), "Subject")
      if (typeof subject !== "string") {
        resolve({ type: "unsigned", reason: `Get-AuthenticodeSignature reports no signer certificate (status: ${authenticodeSignatureStatusName(numericStatus)})` })
        return
      }
      resolve({ type: "signed", subject, status: numericStatus })
    })
  })
}

function getProperty(value: unknown, name: string): unknown {
  return value != null && typeof value === "object" && name in value ? Reflect.get(value, name) : undefined
}

// ─── Windows subject format ─────────────────────────────────────────────────

// Maps certificate attribute OIDs to the X.500 names Windows uses when it formats a certificate subject
// (CertNameToStr with CERT_X500_NAME_STR, i.e. `X509Certificate2.Subject` as Get-AuthenticodeSignature reports it).
// Other OIDs are written as `OID.<dotted oid>`, as Windows does (e.g. `OID.2.5.4.15` in EV certificates).
const WINDOWS_ATTRIBUTE_TYPE_NAMES: Record<string, string> = {
  "2.5.4.3": "CN",
  "2.5.4.4": "SN",
  "2.5.4.5": "SERIALNUMBER",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "S",
  "2.5.4.9": "STREET",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "2.5.4.12": "T",
  "2.5.4.13": "Description",
  "2.5.4.17": "PostalCode",
  "2.5.4.18": "POBox",
  "2.5.4.20": "Phone",
  "2.5.4.24": "X21Address",
  "2.5.4.42": "G",
  "2.5.4.43": "I",
  "2.5.4.46": "dnQualifier",
  "1.2.840.113549.1.9.1": "E",
  "0.9.2342.19200300.100.1.25": "DC",
}

// Windows quotes an RDN value that has leading/trailing white space or contains one of these characters,
// doubling embedded quotes.
const NEEDS_WINDOWS_DN_QUOTING = /[,+="\n<>#;]/

function quoteWindowsDnValue(value: string): string {
  if (value.length === 0 || value !== value.trim() || NEEDS_WINDOWS_DN_QUOTING.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Formats a certificate name the way Windows reports a certificate subject (`X509Certificate2.Subject`, which
 * electron-updater compares the configured publisher names against): RDNs in reverse encoding order separated by
 * `, `, with the Windows X.500 attribute names (e.g. `S` for the state, not `ST`).
 */
export function formatWindowsSubjectDn(name: pkijs.RelativeDistinguishedNames): string {
  return name.typesAndValues
    .map(attribute => {
      const typeName = WINDOWS_ATTRIBUTE_TYPE_NAMES[attribute.type] ?? `OID.${attribute.type}`
      return `${typeName}=${quoteWindowsDnValue(String(attribute.value.valueBlock.value))}`
    })
    .reverse()
    .join(", ")
}

// ─── Any host: PE certificate table + PKCS#7 ────────────────────────────────

const WIN_CERT_TYPE_PKCS_SIGNED_DATA = 0x0002
// The certificate table of a signed installer is a few KB; anything this large is not a real signature.
const MAX_CERTIFICATE_TABLE_SIZE = 16 * 1024 * 1024

async function readExactly(handle: Awaited<ReturnType<typeof open>>, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  if (bytesRead !== length) {
    throw new Error(`unexpected end of file reading ${length} bytes at offset ${position}`)
  }
  return buffer
}

/**
 * Returns the first `WIN_CERTIFICATE` entry of a PE file's certificate table (the primary Authenticode signature,
 * which is the one Windows reports), or null when the file has no certificate table. Only the headers and the table
 * itself are read, never the whole (possibly huge) installer.
 */
export async function readPeSignatureBlob(file: string): Promise<{ certificateType: number; data: Buffer } | null> {
  const handle = await open(file, "r")
  try {
    const { size: fileSize } = await handle.stat()
    const dosHeader = await readExactly(handle, 0, 64)
    if (dosHeader.toString("latin1", 0, 2) !== "MZ") {
      throw new Error("not a PE file (no MZ header)")
    }
    const peHeaderOffset = dosHeader.readUInt32LE(0x3c)
    // PE signature (4) + COFF file header (20)
    const peHeader = await readExactly(handle, peHeaderOffset, 24)
    if (peHeader.toString("latin1", 0, 4) !== "PE\0\0") {
      throw new Error("not a PE file (no PE signature)")
    }
    const optionalHeaderSize = peHeader.readUInt16LE(20)
    const optionalHeader = await readExactly(handle, peHeaderOffset + 24, optionalHeaderSize)
    const magic = optionalHeader.readUInt16LE(0)
    // PE32 / PE32+: offset of NumberOfRvaAndSizes; the data directories follow it
    const rvaCountOffset = magic === 0x10b ? 92 : magic === 0x20b ? 108 : -1
    if (rvaCountOffset === -1) {
      throw new Error(`unknown optional header magic 0x${magic.toString(16)}`)
    }
    // the certificate table is data directory #4; each entry is VirtualAddress (u32) + Size (u32)
    const securityDirectoryOffset = rvaCountOffset + 4 + 4 * 8
    if (optionalHeader.length < securityDirectoryOffset + 8 || optionalHeader.readUInt32LE(rvaCountOffset) <= 4) {
      return null
    }
    // for the certificate table, VirtualAddress is a file offset
    const tableOffset = optionalHeader.readUInt32LE(securityDirectoryOffset)
    const tableSize = optionalHeader.readUInt32LE(securityDirectoryOffset + 4)
    if (tableOffset === 0 || tableSize === 0) {
      return null
    }
    if (tableSize < 8 || tableSize > MAX_CERTIFICATE_TABLE_SIZE || tableOffset + tableSize > fileSize) {
      throw new Error(`invalid certificate table (offset ${tableOffset}, size ${tableSize}, file size ${fileSize})`)
    }
    const table = await readExactly(handle, tableOffset, tableSize)
    // WIN_CERTIFICATE: dwLength (u32, includes this 8-byte header), wRevision (u16), wCertificateType (u16), bCertificate
    const entryLength = table.readUInt32LE(0)
    if (entryLength < 8 || entryLength > tableSize) {
      throw new Error(`invalid WIN_CERTIFICATE length ${entryLength}`)
    }
    return { certificateType: table.readUInt16LE(6), data: table.subarray(8, entryLength) }
  } finally {
    await handle.close()
  }
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const result = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(result).set(buffer)
  return result
}

/**
 * Returns the subject of the certificate that made the first signer's signature in a DER-encoded PKCS#7 SignedData
 * (`ContentInfo`), formatted the way Windows reports it.
 */
export function readPkcs7SignerSubject(der: Buffer): string {
  const asn1 = asn1js.fromBER(toArrayBuffer(der))
  if (asn1.offset === -1) {
    throw new Error("invalid PKCS#7 encoding")
  }
  const contentInfo = new pkijs.ContentInfo({ schema: asn1.result })
  if (contentInfo.contentType !== pkijs.id_ContentType_SignedData) {
    throw new Error(`unexpected PKCS#7 content type ${contentInfo.contentType}`)
  }
  const signedData = new pkijs.SignedData({ schema: contentInfo.content })
  const signerInfo = signedData.signerInfos[0]
  if (signerInfo == null) {
    throw new Error("PKCS#7 signature has no signer")
  }
  const sid: unknown = signerInfo.sid
  if (!(sid instanceof pkijs.IssuerAndSerialNumber)) {
    throw new Error("PKCS#7 signer is not identified by issuer and serial number")
  }
  const certificate = (signedData.certificates ?? []).find(
    (it): it is pkijs.Certificate => it instanceof pkijs.Certificate && it.issuer.isEqual(sid.issuer) && it.serialNumber.isEqual(sid.serialNumber)
  )
  if (certificate == null) {
    throw new Error("the signer certificate is not embedded in the PKCS#7 signature")
  }
  return formatWindowsSubjectDn(certificate.subject)
}

/** Reads the embedded Authenticode signer of a PE file without external tools (works on any host). */
export async function readEmbeddedAuthenticodeSigner(file: string): Promise<AuthenticodeSignerInfo> {
  try {
    const blob = await readPeSignatureBlob(file)
    if (blob == null) {
      return { type: "unsigned", reason: "the file has no embedded Authenticode signature (empty PE certificate table)" }
    }
    if (blob.certificateType !== WIN_CERT_TYPE_PKCS_SIGNED_DATA) {
      return { type: "unreadable", reason: `unsupported WIN_CERTIFICATE type 0x${blob.certificateType.toString(16)}` }
    }
    return { type: "signed", subject: readPkcs7SignerSubject(blob.data), status: null }
  } catch (e: any) {
    return { type: "unreadable", reason: e.message || String(e) }
  }
}
