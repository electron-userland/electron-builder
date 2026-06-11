import { createDecipheriv, createHash } from "crypto"
import * as asn1js from "asn1js"
import * as pkijs from "pkijs"
import { Crypto as PeculiarCrypto } from "@peculiar/webcrypto"

import { log } from "builder-util"
import _fsExtra from "fs-extra"
const { readFile } = _fsExtra

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
// pkcs-12PbeIds ciphers (SHA1+3DES, SHA1+2DES, SHA1+RC2-128, SHA1+RC2-40).
// We implement 3DES/2DES using Node.js's built-in `crypto` module and RC2
// with a pure-TypeScript RFC 2268 implementation — RC2 was moved to
// OpenSSL 3's legacy provider (not loaded by default) and is unavailable
// via `createDecipheriv` in Node.js 22+.

// ── RFC 2268 RC2-CBC implementation ─────────────────────────────────────────

/** Permutation table from RFC 2268. */
const RC2_PITABLE = Uint8Array.from([
  0xd9, 0x78, 0xf9, 0xc4, 0x19, 0xdd, 0xb5, 0xed, 0x28, 0xe9, 0xfd, 0x79, 0x4a, 0xa0, 0xd8, 0x9d, 0xc6, 0x7e, 0x37, 0x83, 0x2b, 0x76, 0x53, 0x8e, 0x62, 0x4c, 0x64, 0x88, 0x44,
  0x8b, 0xfb, 0xa2, 0x17, 0x9a, 0x59, 0xf5, 0x87, 0xb3, 0x4f, 0x13, 0x61, 0x45, 0x6d, 0x8d, 0x09, 0x81, 0x7d, 0x32, 0xbd, 0x8f, 0x40, 0xeb, 0x86, 0xb7, 0x7b, 0x0b, 0xf0, 0x95,
  0x21, 0x22, 0x5c, 0x6b, 0x4e, 0x82, 0x54, 0xd6, 0x65, 0x93, 0xce, 0x60, 0xb2, 0x1c, 0x73, 0x56, 0xc0, 0x14, 0xa7, 0x8c, 0xf1, 0xdc, 0x12, 0x75, 0xca, 0x1f, 0x3b, 0xbe, 0xe4,
  0xd1, 0x42, 0x3d, 0xd4, 0x30, 0xa3, 0x3c, 0xb6, 0x26, 0x6f, 0xbf, 0x0e, 0xda, 0x46, 0x69, 0x07, 0x57, 0x27, 0xf2, 0x1d, 0x9b, 0xbc, 0x94, 0x43, 0x03, 0xf8, 0x11, 0xc7, 0xf6,
  0x90, 0xef, 0x3e, 0xe7, 0x06, 0xc3, 0xd5, 0x2f, 0xc8, 0x66, 0x1e, 0xd7, 0x08, 0xe8, 0xea, 0xde, 0x80, 0x52, 0xee, 0xf7, 0x84, 0xaa, 0x72, 0xac, 0x35, 0x4d, 0x6a, 0x2a, 0x96,
  0x1a, 0xd2, 0x71, 0x5a, 0x15, 0x49, 0x74, 0x4b, 0x9f, 0xd0, 0x5e, 0x04, 0x18, 0xa4, 0xec, 0xc2, 0xe0, 0x41, 0x6e, 0x0f, 0x51, 0xcb, 0xcc, 0x24, 0x91, 0xaf, 0x50, 0xa1, 0xf4,
  0x70, 0x39, 0x99, 0x7c, 0x3a, 0x85, 0x23, 0xb8, 0xb4, 0x7a, 0xfc, 0x02, 0x36, 0x5b, 0x25, 0x55, 0x97, 0x31, 0x2d, 0x5d, 0xfa, 0x98, 0xe3, 0x8a, 0x92, 0xae, 0x05, 0xdf, 0x29,
  0x10, 0x67, 0x6c, 0xba, 0xc9, 0xd3, 0x00, 0xe6, 0xcf, 0xe1, 0x9e, 0xa8, 0x2c, 0x63, 0x16, 0x01, 0x3f, 0x58, 0xe2, 0x89, 0xa9, 0x0d, 0x38, 0x34, 0x1b, 0xab, 0x33, 0xff, 0xb0,
  0xbb, 0x48, 0x0c, 0x5f, 0xb9, 0xb1, 0xcd, 0x2e, 0xc5, 0xf3, 0xdb, 0x47, 0xe5, 0xa5, 0x9c, 0x77, 0x0a, 0xa6, 0x20, 0x68, 0xfe, 0x7f, 0xc1, 0xad,
])

/** Rotation amounts for R[0], R[1], R[2], R[3] in each mix round. */
const RC2_ROT = [1, 2, 3, 5] as const

/**
 * Expand a variable-length key to 64 sixteen-bit subkeys (RFC 2268 Section 2).
 * `effectiveBits` controls the effective key length for export-grade keys
 * (40 = RC2-40, 128 = RC2-128).
 */
function rc2ExpandKey(key: Buffer, effectiveBits: number): number[] {
  // Guard: effectiveBits = 0 causes T8 = 0, making L[128-0] = L[128] an OOB
  // access on a 128-element Uint8Array (silently returns undefined, producing
  // a wrong key schedule). Values > 1024 exceed the RFC 2268 key schedule table.
  if (!Number.isInteger(effectiveBits) || effectiveBits < 1 || effectiveBits > 1024) {
    throw new Error(`rc2ExpandKey: effectiveBits must be an integer in [1, 1024], got ${effectiveBits}`)
  }
  const T = key.length
  const T8 = Math.ceil(effectiveBits / 8)
  // 0xff >> (effectiveBits & 7) gives 0xff for multiples-of-8 effective lengths
  // (no masking), and a smaller mask for non-multiples.
  const TM = 0xff >> (effectiveBits & 7)
  const L = new Uint8Array(128)
  for (let i = 0; i < T; i++) {
    L[i] = key[i]
  }
  for (let i = T; i < 128; i++) {
    L[i] = RC2_PITABLE[(L[i - 1] + L[i - T]) & 0xff]
  }
  L[128 - T8] = RC2_PITABLE[L[128 - T8] & TM]
  for (let i = 127 - T8; i >= 0; i--) {
    L[i] = RC2_PITABLE[L[i + 1] ^ L[i + T8]]
  }
  const K: number[] = new Array(64)
  for (let i = 0; i < 64; i++) {
    K[i] = L[2 * i] | (L[2 * i + 1] << 8)
  }
  return K
}

/** Rotate a 16-bit word right by `bits` positions. */
function ror16(word: number, bits: number): number {
  return ((word & 0xffff) >> bits) | ((word << (16 - bits)) & 0xffff)
}

/**
 * Decrypt `data` using RC2-CBC with PKCS#7 padding removal (RFC 2268).
 *
 * Used for pbeWithSHAAnd40BitRC2CBC  (OID 1.2.840.113549.1.12.1.6) and
 *          pbeWithSHAAnd128BitRC2CBC (OID 1.2.840.113549.1.12.1.5).
 *
 * These OIDs are commonly used to encrypt certificate bags in PKCS#12
 * files produced by OpenSSL and Windows with default settings. Node.js 22+
 * (OpenSSL 3 default provider) does not support RC2 via `createDecipheriv`.
 */
function rc2CbcDecrypt(key: Buffer, iv: Buffer, data: Buffer, effectiveBits: number): Buffer {
  // Guard: a non-multiple-of-8 ciphertext causes the last partial block to be
  // processed with `undefined` bytes.  In JS, `undefined | (undefined << 8)`
  // produces NaN, and `NaN & 0xffff` produces 0 — so partial blocks silently
  // produce garbage output rather than throwing.
  if (data.length === 0 || data.length % 8 !== 0) {
    throw new Error(`rc2CbcDecrypt: ciphertext length ${data.length} is not a positive multiple of the 8-byte RC2 block size`)
  }
  if (iv.length !== 8) {
    throw new Error(`rc2CbcDecrypt: IV must be exactly 8 bytes, got ${iv.length}`)
  }
  const K = rc2ExpandKey(key, effectiveBits)
  const out = Buffer.alloc(data.length)
  const prev = Buffer.from(iv) // CBC running state; starts as the IV

  for (let offset = 0; offset < data.length; offset += 8) {
    const ct = data.subarray(offset, offset + 8)
    // Parse ciphertext block as four little-endian 16-bit words
    const R = [(ct[0] | (ct[1] << 8)) & 0xffff, (ct[2] | (ct[3] << 8)) & 0xffff, (ct[4] | (ct[5] << 8)) & 0xffff, (ct[6] | (ct[7] << 8)) & 0xffff]

    // Reverse the encryption round plan [5 mix, 1 mash, 6 mix, 1 mash, 5 mix].
    // For decryption j starts at 63 and decrements in each reverse-mix step.
    let j = 63

    const rMix = () => {
      for (let i = 3; i >= 0; i--) {
        R[i] = ror16(R[i], RC2_ROT[i])
        const r3 = R[(i + 3) % 4]
        R[i] = (R[i] - K[j] - (r3 & R[(i + 2) % 4]) - (~r3 & 0xffff & R[(i + 1) % 4])) & 0xffff
        j--
      }
    }

    const rMash = () => {
      for (let i = 3; i >= 0; i--) {
        R[i] = (R[i] - K[R[(i + 3) % 4] & 63]) & 0xffff
      }
    }

    for (let n = 0; n < 5; n++) {
      rMix()
    }
    rMash()
    for (let n = 0; n < 6; n++) {
      rMix()
    }
    rMash()
    for (let n = 0; n < 5; n++) {
      rMix()
    }

    // XOR decrypted words with previous ciphertext block (CBC mode)
    for (let i = 0; i < 4; i++) {
      out[offset + i * 2] = (R[i] & 0xff) ^ prev[i * 2]
      out[offset + i * 2 + 1] = (R[i] >> 8) ^ prev[i * 2 + 1]
    }
    // Advance CBC state to current ciphertext block
    ct.copy(prev)
  }

  // Validate and strip PKCS#7 padding.
  // Without this guard, padLen = 0 silently returns the full buffer (no stripping)
  // and padLen > 8 causes Buffer.subarray(0, negative) → empty buffer, both
  // silently.  A wrong key/IV produces decrypted bytes that fail this check.
  const padLen = out[out.length - 1]
  if (padLen < 1 || padLen > 8) {
    throw new Error(`rc2CbcDecrypt: invalid PKCS#7 pad byte 0x${padLen.toString(16).padStart(2, "0")} — the ciphertext is corrupt or the wrong key/IV was used`)
  }
  for (let i = out.length - padLen; i < out.length; i++) {
    if (out[i] !== padLen) {
      throw new Error(`rc2CbcDecrypt: invalid PKCS#7 padding — the ciphertext is corrupt or the wrong key/IV was used`)
    }
  }
  return out.subarray(0, out.length - padLen)
}

/** PKCS#12 legacy PBE OIDs (pkcs-12PbeIds) and their cipher parameters. */
const PKCS12_PBE_ALGOS: Record<string, { cipher: string; keyLen: number; ivLen: number; rc2Bits?: number }> = {
  "1.2.840.113549.1.12.1.3": { cipher: "des-ede3-cbc", keyLen: 24, ivLen: 8 }, // pbeWithSHAAnd3KeyTripleDESCBC
  "1.2.840.113549.1.12.1.4": { cipher: "des-ede-cbc", keyLen: 16, ivLen: 8 }, //  pbeWithSHAAnd2KeyTripleDESCBC
  "1.2.840.113549.1.12.1.5": { cipher: "rc2-cbc", keyLen: 16, ivLen: 8, rc2Bits: 128 }, // pbeWithSHAAnd128BitRC2CBC
  "1.2.840.113549.1.12.1.6": { cipher: "rc2-cbc", keyLen: 5, ivLen: 8, rc2Bits: 40 }, //  pbeWithSHAAnd40BitRC2CBC
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
  // A crafted PFX could supply a multi-megabyte salt, causing Buffer.alloc(sLen) inside
  // the KDF to allocate gigabytes (sLen = ceil(salt.length / 64) * 64).
  const MAX_SALT_BYTES = 4096
  if (salt.length > MAX_SALT_BYTES) {
    throw new Error(`PKCS#12 PBE salt length ${salt.length} exceeds the safe maximum of ${MAX_SALT_BYTES} bytes — the file may be crafted to exhaust memory`)
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

  if (algo.rc2Bits != null) {
    // RC2 is not available in Node.js 22+ via createDecipheriv (OpenSSL 3 moved
    // it to the legacy provider which is not loaded by default). Use our pure-TS
    // RFC 2268 implementation instead.
    return rc2CbcDecrypt(key, iv, encBytes, algo.rc2Bits)
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
  rc2CbcDecrypt,
  MAX_PKCS12_PBE_ITERATIONS,
}
