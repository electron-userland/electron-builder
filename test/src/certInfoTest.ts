import * as os from "os"
import * as path from "path"
import { execSync } from "child_process"
import { writeFileSync } from "fs"
import { mkdtemp } from "fs/promises"
import { afterAll, beforeAll, describe, it, expect } from "vitest"
import { writeFile, remove } from "fs-extra"
import { readCertInfo, _testingOnly } from "app-builder-lib/src/codeSign/certInfo"

const { pkcs12PbeDeriveKey, pkcs12PasswordToUtf16, rc2CbcDecrypt, MAX_PKCS12_PBE_ITERATIONS } = _testingOnly
import { WIN_CSC_LINK } from "./helpers/codeSignData"

// ─── Test fixture paths ───────────────────────────────────────────────────────

let tmpDir: string
let FULL_SUBJECT_PFX: string
let CN_ONLY_PFX: string
let NO_EKU_PFX: string
let WIN_CSC_PFX: string
let OU_PFX: string
let SPECIAL_PFX: string
let MULTI_CERT_PFX: string
let TRUNCATED_PFX: string
let RC2_40_PFX: string

// Generates a self-signed cert + PFX with codeSigning EKU via openssl.
// Uses RSA-1024 for speed in tests (not for security).
function genSigningPfx(subj: string, password: string, name: string): string {
  const key = path.join(tmpDir, `${name}.key`)
  const crt = path.join(tmpDir, `${name}.crt`)
  const pfx = path.join(tmpDir, `${name}.pfx`)
  execSync(
    `openssl req -x509 -newkey rsa:1024 -keyout "${key}" -out "${crt}" -sha256 -days 7300 -nodes -subj "${subj}" -addext "extendedKeyUsage=codeSigning" -addext "basicConstraints=CA:false"`,
    { stdio: "pipe" }
  )
  execSync(`openssl pkcs12 -export -out "${pfx}" -inkey "${key}" -in "${crt}" -passout "pass:${password}"`, { stdio: "pipe" })
  return pfx
}

// Generates a PFX without a codeSigning EKU.
function genNoEkuPfx(subj: string, password: string, name: string): string {
  const key = path.join(tmpDir, `${name}.key`)
  const crt = path.join(tmpDir, `${name}.crt`)
  const pfx = path.join(tmpDir, `${name}.pfx`)
  execSync(`openssl req -x509 -newkey rsa:1024 -keyout "${key}" -out "${crt}" -sha256 -days 7300 -nodes -subj "${subj}"`, { stdio: "pipe" })
  execSync(`openssl pkcs12 -export -out "${pfx}" -inkey "${key}" -in "${crt}" -passout "pass:${password}"`, { stdio: "pipe" })
  return pfx
}

/**
 * Generates a PFX containing two certificates for the same key pair:
 *  1. A CA cert (basicConstraints CA:true, NO codeSigning EKU) — placed FIRST
 *  2. A signing cert (CA:false, WITH codeSigning EKU)
 *
 * Both certs share the same key. The CA cert is placed first via `-in ca.crt -certfile signing.crt`
 * so readCertInfo must iterate all cert bags and pick the one with codeSigning EKU.
 */
function genMultiCertPfx(password: string, name: string): string {
  const key = path.join(tmpDir, `${name}.key`)
  const caCrt = path.join(tmpDir, `${name}-ca.crt`)
  const signingCsr = path.join(tmpDir, `${name}-signing.csr`)
  const signingCrt = path.join(tmpDir, `${name}-signing.crt`)
  const extFile = path.join(tmpDir, `${name}-ext.cnf`)
  const pfx = path.join(tmpDir, `${name}.pfx`)

  execSync(`openssl genrsa -out "${key}" 1024`, { stdio: "pipe" })
  execSync(
    `openssl req -x509 -key "${key}" -out "${caCrt}" -sha256 -days 7300 -nodes -subj "/CN=Test CA" -addext "basicConstraints=CA:true" -addext "keyUsage=keyCertSign,cRLSign"`,
    { stdio: "pipe" }
  )
  execSync(`openssl req -new -key "${key}" -out "${signingCsr}" -subj "/CN=Multi-Cert Signer"`, { stdio: "pipe" })
  writeFileSync(extFile, "extendedKeyUsage=codeSigning\nbasicConstraints=CA:false\n")
  execSync(`openssl x509 -req -in "${signingCsr}" -CA "${caCrt}" -CAkey "${key}" -CAcreateserial -out "${signingCrt}" -days 7300 -extfile "${extFile}"`, { stdio: "pipe" })
  // CA cert first (-in caCrt), signing cert as additional (-certfile signingCrt)
  execSync(`openssl pkcs12 -export -out "${pfx}" -inkey "${key}" -in "${caCrt}" -certfile "${signingCrt}" -passout "pass:${password}"`, { stdio: "pipe" })
  return pfx
}

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "certinfo-test-"))

  FULL_SUBJECT_PFX = genSigningPfx("/CN=Test Publisher/O=Test Org/L=San Francisco/ST=California/C=US", "testpassword", "full")
  CN_ONLY_PFX = genSigningPfx("/CN=My Company Inc.", "pw", "cn")
  NO_EKU_PFX = genNoEkuPfx("/CN=No EKU Cert", "pw", "noeku")
  OU_PFX = genSigningPfx("/CN=Test Publisher/O=Test Org/OU=Engineering/C=US", "pw", "ou")
  SPECIAL_PFX = genSigningPfx("/CN=Publisher, Inc. \\+ Partners/C=US", "pw", "special")
  MULTI_CERT_PFX = genMultiCertPfx("multicertpw", "multicert")

  WIN_CSC_PFX = path.join(tmpDir, "wincsc.pfx")
  TRUNCATED_PFX = path.join(tmpDir, "truncated.pfx")
  RC2_40_PFX = path.join(tmpDir, "rc2-40.pfx")

  await Promise.all([
    writeFile(WIN_CSC_PFX, Buffer.from(WIN_CSC_LINK.replace("data:application/x-pkcs12;base64,", ""), "base64")),
    // Truncated PFX: first 50 bytes of WIN_CSC_LINK (incomplete ASN.1 structure)
    writeFile(TRUNCATED_PFX, Buffer.from(WIN_CSC_LINK.replace("data:application/x-pkcs12;base64,", ""), "base64").subarray(0, 50)),
    // RC2-40 PFX: generated with `openssl pkcs12 -certpbe PBE-SHA1-RC2-40 -keypbe PBE-SHA1-3DES -legacy`
    // Certificates are encrypted with pbeWithSHAAnd40BitRC2CBC (OID 1.2.840.113549.1.12.1.6),
    // which is the format used by Windows and OpenSSL ≤1.x for PKCS#12 cert bag encryption.
    // Node.js 22 / OpenSSL 3 moved RC2 to the legacy provider (not loaded by default), so our
    // pure-TypeScript RFC 2268 implementation is exercised here.
    writeFile(
      RC2_40_PFX,
      Buffer.from(
        "MIIGKQIBAzCCBecGCSqGSIb3DQEHAaCCBdgEggXUMIIF0DCCAs8GCSqGSIb3DQEHBqCCAsAwggK8AgEAMIICtQYJKoZIhvcNAQcBMBwGCiqGSIb3DQEMAQYwDgQIOeB4vRoAWBMCAggAgIICiDMOXW2j2Wzlx+1AZoB1l3rtU4GJ3WGaugrJT1rdG7irl7fmhk8baL9T0eeutp0Mzwfc7ttH7f87jz0X3YGh/BBNMwBLiIqmEPR8mcX0Kg9mD3I+qUFDj/bjVIrqYuH9vpOjYu0Mz/MkzvHrX/BQ2UuFBTRtglZ8PGypYQVQ61Z5YVe/CCzn99HjfGAH3Hx2FyMfTLKjUzpEIvwO6O5oyn2uEg6zy8dgifsLsJ5p+1kmE+bSyPCk/3bvUE9bJ1+8V5unvqC0gGX6Una9uY6nzbyPf0rZFtKguvG5+mC2GZv13pHjiUUzFaq68/++a98tyvoh/b6PFv3KGc3BZjlU3/YZ2Z5ym0Gu+aLM5M2Gog4rX8FZ0aeUe8S16OXoUhfIDGtSd4UB+ediAC2/h9vR0ia5cq/La3TSJSg/BYLfgNED1DNJ91K7gAVoaJwOs8sF24vCgTzZFnJkcHQ6FIlhGy4/bElKxHL20tlxo6CM/CpXJopwd9WdGfcEg5pXrO+UTN+EfnGXqB9XT4qr23uuoruN65YckJBth34dPWRAcN0f46mO6xRdRcIkr5bgj5tJDRDQoxdLpUHDUAQP5b7ZHIPX74AUVnMKQ8CtvSQe8UHloj2teK66HwFHhRaWN80E3/CR+Ktm+YoC28Boa+facv98+6z0meFWUcpow4jweqPpmE/ZJItxKVdVAy3qHw0X6KuxeQUeO0b0ziJgLwpeRYtrsDeYiaRi/iDzJTMz6m+fmd7QuqTiBWkuLMYPts9HKtgYaHT448YZ2zNJpXkTGld3GPRe6JBb4IIvot0u45KSFt/eORx6CCyj1nJQg3/JTD20kj4zV0vfzQB/I8QtC5Dq2njL4sTEZjCCAvkGCSqGSIb3DQEHAaCCAuoEggLmMIIC4jCCAt4GCyqGSIb3DQEMCgECoIICpjCCAqIwHAYKKoZIhvcNAQwBAzAOBAi+0YZ9gmYjSAICCAAEggKAGvk6GMxpBZiM71mDDKAJ0MLzJEB/nGykR5ChnY9PYH27IilLycinJ1HvOdbvA0oKtoj6LbmJKjs+vueXA/CwgI8j0JAcNKr1JSGAMJcYDN8fhQIHZTgyZYjIvisZTp+txf4pTB9MefiUVvGQvVYWHHfN1c9SkKxb5OvC3AhxgJMKs5+WCNvQKvcC/4E09ehpoANeGVCdqJIbb9WnYN1MZqBi1pc1WXh3NnfXAyATB5H4PWehXhX0Ab/jZIWmU0uPMuZGzW8psIcYoaYmYTAKd91nvCRqhl/GQL8mPtfrKjDlp3xY3SdiWzv/QHQXyaaRtws+H5myMUGiN5mQi3xSSudJP2CEpjmvEPUvYVe9gtXccCJeg6bJWafajay1QOquX15Iz1T/CbonZ0RnAmn7zUFR3gxB/C9bnqk5oGfrl8k54hCl/HWd8T0dH+l8KJ07FMhDp7yoJEWitxephtSp0gm9+XEa20mNWax72NRRQnagDMs5t5ANtOAnZLAA63lGqJSAcdXiy3PS+7/G8hqha+lNiINQbtW7SHuYD0ikwFw7hNVRh96PbzlpyHMLBz+vC6AIbwGmGj+lga7ZHtShQS10ZLSKoQD19IGAr+xQmsgN7GuCVoNlW8DIClzEOz3AA1+berfc7XxpbdkuPTTolzE9nGvBfjprVxTo28MSPFDFY5XLPtuNsMGTH9U2ZSc4d+bRDxZXtU2nbGjl7CfMBVwbDPR8amGgQ335fAXMViSldh8a8oRnJyjsMEWipNkZ3hfNjnPSYsGg0RZZ1bzO+ylZj4l59NNau0AzvzyExY8OoFHynC2RYqBdHgQ+H8wMuJ3a/5cbF8NLzwnnat1mTzElMCMGCSqGSIb3DQEJFTEWBBRfUyLtR/yuPPvG1dqc0P9z7vCE7zA5MCEwCQYFKw4DAhoFAAQUACVUP49baZbnuVNgWCvYpMgptZoEEP7NJK3KetVKvaxAaaOyzhcCAggA",
        "base64"
      )
    ),
  ])
})

afterAll(async () => {
  if (tmpDir) {
    await remove(tmpDir).catch(() => null)
  }
})

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("readCertInfo — happy path", () => {
  it("extracts commonName and full subject DN with all RDN components", async () => {
    const result = await readCertInfo(FULL_SUBJECT_PFX, "testpassword")

    expect(result.commonName).toBe("Test Publisher")
    // DN uses shortName=value pairs joined by commas, no spaces — must match binary format exactly
    expect(result.bloodyMicrosoftSubjectDn).toBe("CN=Test Publisher,O=Test Org,L=San Francisco,ST=California,C=US")
  })

  it("handles a certificate with CN only", async () => {
    const result = await readCertInfo(CN_ONLY_PFX, "pw")
    expect(result.commonName).toBe("My Company Inc.")
    expect(result.bloodyMicrosoftSubjectDn).toBe("CN=My Company Inc.")
  })

  it("handles the existing WIN_CSC_LINK test certificate (empty password)", async () => {
    const result = await readCertInfo(WIN_CSC_PFX, "")
    expect(result.commonName).toBe("test-ci-cert")
    expect(result.bloodyMicrosoftSubjectDn).toBe("CN=test-ci-cert")
  })
})

describe("readCertInfo — error handling", () => {
  it("throws with 'password incorrect' on wrong password", async () => {
    await expect(readCertInfo(FULL_SUBJECT_PFX, "wrongpassword")).rejects.toThrow("password incorrect")
  })

  it("throws when the certificate lacks the codeSigning extended key usage", async () => {
    await expect(readCertInfo(NO_EKU_PFX, "pw")).rejects.toThrow(/ExtKeyUsageCodeSigning/)
  })
})

// ─── Additional logic-path tests ─────────────────────────────────────────────

describe("readCertInfo — file not found", () => {
  it("throws when the input file does not exist", async () => {
    await expect(readCertInfo("/nonexistent/path/cert.pfx", "pw")).rejects.toThrow()
  })
})

describe("readCertInfo — OU attribute in subject DN", () => {
  it("includes OU in bloodyMicrosoftSubjectDn", async () => {
    const result = await readCertInfo(OU_PFX, "pw")
    expect(result.commonName).toBe("Test Publisher")
    expect(result.bloodyMicrosoftSubjectDn).toBe("CN=Test Publisher,O=Test Org,OU=Engineering,C=US")
  })
})

describe("readCertInfo — special characters in DN values", () => {
  it("wraps values containing special characters in quotes to match Go binary output", async () => {
    const jsResult = await readCertInfo(SPECIAL_PFX, "pw")
    expect(jsResult.commonName).toBe("Publisher, Inc. + Partners")
    // , and + in the CN value must cause the whole value to be wrapped in quotes
    expect(jsResult.bloodyMicrosoftSubjectDn).toBe(`CN="Publisher, Inc. + Partners",C=US`)
  })

})


// ─── Security: pkcs12PasswordToUtf16 encoding ────────────────────────────────

describe("pkcs12PasswordToUtf16 encoding", () => {
  it("encodes empty string as a single UTF-16BE null terminator (2 bytes)", () => {
    const result = pkcs12PasswordToUtf16("")
    expect(result).toEqual(Buffer.from([0x00, 0x00]))
  })

  it("encodes ASCII characters as UTF-16BE with null terminator", () => {
    // 'A' = U+0041, 'B' = U+0042
    const result = pkcs12PasswordToUtf16("AB")
    expect(result).toEqual(Buffer.from([0x00, 0x41, 0x00, 0x42, 0x00, 0x00]))
  })

  it("encodes non-ASCII BMP characters as UTF-16BE with null terminator", () => {
    // 'é' = U+00E9
    const result = pkcs12PasswordToUtf16("é")
    expect(result).toEqual(Buffer.from([0x00, 0xe9, 0x00, 0x00]))
  })

  it("produces buffers of length (password.length + 1) * 2", () => {
    expect(pkcs12PasswordToUtf16("").length).toBe(2)
    expect(pkcs12PasswordToUtf16("test").length).toBe(10) // 4 chars + null = 5 * 2
    expect(pkcs12PasswordToUtf16("abc").length).toBe(8) //  3 chars + null = 4 * 2
  })
})

// ─── Security: pkcs12PbeDeriveKey key derivation ─────────────────────────────

describe("pkcs12PbeDeriveKey key derivation", () => {
  // Reference vectors computed from the implementation and cross-checked by verifying
  // that WIN_CSC_LINK (encrypted with pbeWithSHAAnd3KeyTripleDESCBC) decrypts correctly.

  const SALT_A = Buffer.from([0x0a, 0x58, 0xcf, 0x64, 0x53, 0x0d, 0x82, 0x3f])
  const PWD_SMEG = pkcs12PasswordToUtf16("smeg")

  it("produces the expected key for known inputs (smeg/1000 iters/SHA-1/id=1/24-byte)", () => {
    const key = pkcs12PbeDeriveKey(PWD_SMEG, SALT_A, 1000, 1, 24)
    expect(key.toString("hex")).toBe("65a0185313e1be626a62223edc56a602e45d07570bd6c447")
  })

  it("produces the expected IV for known inputs (smeg/1000 iters/SHA-1/id=2/8-byte)", () => {
    const iv = pkcs12PbeDeriveKey(PWD_SMEG, SALT_A, 1000, 2, 8)
    expect(iv.toString("hex")).toBe("b39bf194ae8e43eb")
  })

  it("key derivation (id=1) and IV derivation (id=2) produce different bytes for identical inputs", () => {
    const salt = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
    const key = pkcs12PbeDeriveKey(pkcs12PasswordToUtf16("test"), salt, 100, 1, 24)
    const iv = pkcs12PbeDeriveKey(pkcs12PasswordToUtf16("test"), salt, 100, 2, 24)
    // Different id values must yield different derived material
    expect(key.toString("hex")).not.toBe(iv.toString("hex"))
  })

  it("is deterministic — identical inputs always produce identical output", () => {
    const salt = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd])
    const pwd = pkcs12PasswordToUtf16("determinism")
    const a = pkcs12PbeDeriveKey(pwd, salt, 50, 1, 24)
    const b = pkcs12PbeDeriveKey(pwd, salt, 50, 1, 24)
    expect(a.toString("hex")).toBe(b.toString("hex"))
  })

  it("handles empty password (null-terminator only) without error", () => {
    const salt = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
    const key = pkcs12PbeDeriveKey(pkcs12PasswordToUtf16(""), salt, 1, 1, 24)
    expect(key.toString("hex")).toBe("2bbd27af16eb22f296aaced12543545e08a50a3307d5cfb6")
  })

  it("output length matches requested length exactly", () => {
    const salt = Buffer.from([0x01, 0x02])
    const pwd = pkcs12PasswordToUtf16("len")
    expect(pkcs12PbeDeriveKey(pwd, salt, 1, 1, 24).length).toBe(24)
    expect(pkcs12PbeDeriveKey(pwd, salt, 1, 2, 8).length).toBe(8)
    expect(pkcs12PbeDeriveKey(pwd, salt, 1, 1, 16).length).toBe(16)
  })

  // ── DoS prevention: iteration count bounds ────────────────────────────────

  it("throws when iterations = 0 (DoS / degenerate input prevention)", () => {
    const salt = Buffer.from([0x01])
    expect(() => pkcs12PbeDeriveKey(Buffer.alloc(2), salt, 0, 1, 24)).toThrow(/outside safe range/)
  })

  it("throws when iterations is negative", () => {
    const salt = Buffer.from([0x01])
    expect(() => pkcs12PbeDeriveKey(Buffer.alloc(2), salt, -1, 1, 24)).toThrow(/outside safe range/)
  })

  it("throws when iterations exceeds MAX_PKCS12_PBE_ITERATIONS (DoS prevention)", () => {
    const salt = Buffer.from([0x01])
    expect(() => pkcs12PbeDeriveKey(Buffer.alloc(2), salt, MAX_PKCS12_PBE_ITERATIONS + 1, 1, 24)).toThrow(/outside safe range/)
  })

  it("throws when iterations is Number.MAX_SAFE_INTEGER (crafted-PFX DoS attack)", () => {
    const salt = Buffer.from([0x01])
    expect(() => pkcs12PbeDeriveKey(Buffer.alloc(2), salt, Number.MAX_SAFE_INTEGER, 1, 24)).toThrow(/outside safe range/)
  })

  it("throws when iterations is NaN (malformed ASN.1 integer)", () => {
    const salt = Buffer.from([0x01])
    expect(() => pkcs12PbeDeriveKey(Buffer.alloc(2), salt, NaN, 1, 24)).toThrow(/outside safe range/)
  })

  it("throws when iterations is Infinity", () => {
    const salt = Buffer.from([0x01])
    expect(() => pkcs12PbeDeriveKey(Buffer.alloc(2), salt, Infinity, 1, 24)).toThrow(/outside safe range/)
  })

  it("accepts iterations = 1 (minimum valid count)", () => {
    const salt = Buffer.from([0x01, 0x02])
    expect(() => pkcs12PbeDeriveKey(pkcs12PasswordToUtf16("x"), salt, 1, 1, 8)).not.toThrow()
  })

  it("accepts iterations = MAX_PKCS12_PBE_ITERATIONS (boundary — must not throw)", () => {
    const salt = Buffer.from([0x01, 0x02])
    // Only verify no throw — actually running 300k hash rounds would be slow, so use a tiny length
    // to ensure it doesn't regress from the boundary. In practice iteration counts are ≤50k.
    // Skip if this takes too long (vitest timeout is generous but we only need the boundary check).
    expect(() => pkcs12PbeDeriveKey(pkcs12PasswordToUtf16(""), salt, MAX_PKCS12_PBE_ITERATIONS, 1, 1)).not.toThrow()
  })
})

// ─── readCertInfo — multiple certificates in one PFX ─────────────────────────

describe("readCertInfo — multiple certificates in PFX", () => {
  it("selects the code-signing certificate when a CA cert is also present", async () => {
    // MULTI_CERT_PFX has a CA cert (no EKU) FIRST, then a signing cert (has EKU).
    // readCertInfo must iterate all cert bags and pick the one with codeSigning EKU.
    const result = await readCertInfo(MULTI_CERT_PFX, "multicertpw")
    expect(result.commonName).toBe("Multi-Cert Signer")
    expect(result.bloodyMicrosoftSubjectDn).toBe("CN=Multi-Cert Signer")
  })

  it("throws ExtKeyUsageCodeSigning when no cert in the PFX has the codeSigning EKU", async () => {
    // NO_EKU_PFX has exactly one cert and it has no EKU at all.
    await expect(readCertInfo(NO_EKU_PFX, "pw")).rejects.toThrow(/ExtKeyUsageCodeSigning/)
  })
})

// ─── readCertInfo — legacy PBE error path ────────────────────────────────────

describe("readCertInfo — legacy PBE wrong password", () => {
  it("throws 'password incorrect' for the legacy pbeWithSHAAnd3KeyTripleDESCBC encrypted WIN_CSC_LINK cert", async () => {
    // WIN_CSC_LINK uses pbeWithSHAAnd3KeyTripleDESCBC. Wrong password must be caught
    // by MAC verification before the decryption path is even reached.
    await expect(readCertInfo(WIN_CSC_PFX, "definitelyWrongPassword")).rejects.toThrow("password incorrect")
  })
})

// ─── readCertInfo — malformed / corrupted input ───────────────────────────────

describe("readCertInfo — malformed/corrupted input", () => {
  it("throws a descriptive error for a truncated PFX (incomplete ASN.1)", async () => {
    await expect(readCertInfo(TRUNCATED_PFX, "pw")).rejects.toThrow(/invalid ASN\.1|corrupt|PKCS#12/)
  })

  it("throws a descriptive error for arbitrary random bytes", async () => {
    const randomPath = path.join(tmpDir, "random.bin")
    await writeFile(randomPath, Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]))
    await expect(readCertInfo(randomPath, "pw")).rejects.toThrow()
  })

  it("throws a descriptive error for an empty file", async () => {
    const emptyPath = path.join(tmpDir, "empty.pfx")
    await writeFile(emptyPath, Buffer.alloc(0))
    await expect(readCertInfo(emptyPath, "pw")).rejects.toThrow()
  })
})

// ─── rc2CbcDecrypt — known-answer tests (RFC 2268) ───────────────────────────
//
// Test vectors produced by OpenSSL (legacy provider) and pinned here so any
// regression in rc2ExpandKey or the round logic is caught immediately.
// Generation commands:
//   echo -n "Hello World!!!!" | openssl enc -rc2-40-cbc -provider legacy -provider default \
//     -K ababababab -iv cdcdcdcdcdcdcdcd -nosalt | xxd -p

describe("rc2CbcDecrypt — known-answer tests", () => {
  it("RC2-40: decrypts a known ciphertext to the correct plaintext", () => {
    // key=ababababab (5 bytes = 40 bits), iv=cdcdcdcdcdcdcdcd (8 bytes)
    // plaintext (15 bytes, 1 byte PKCS#7 padding) = "Hello World!!!!"
    const key = Buffer.from("ababababab", "hex")
    const iv = Buffer.from("cdcdcdcdcdcdcdcd", "hex")
    const ct = Buffer.from("c0ad5ebd7b5fa58742a81045ab475ae2", "hex")
    const pt = rc2CbcDecrypt(key, iv, ct, 40)
    expect(pt.toString("hex")).toBe("48656c6c6f20576f726c6421212121")
    expect(pt.toString("ascii")).toBe("Hello World!!!!")
  })

  it("RC2-128: decrypts a known ciphertext to the correct plaintext", () => {
    // key=abababababababababababababababab (16 bytes = 128 bits), iv=cdcdcdcdcdcdcdcd
    // echo -n "Hello World!!!!" | openssl enc -rc2-cbc -provider legacy -provider default \
    //   -K abababababababababababababababab -iv cdcdcdcdcdcdcdcd -nosalt | xxd -p
    const key = Buffer.alloc(16, 0xab)
    const iv = Buffer.from("cdcdcdcdcdcdcdcd", "hex")
    const ct = Buffer.from("3f9f2c538a870cc78d4ffaa3642914e6", "hex")
    const pt = rc2CbcDecrypt(key, iv, ct, 128)
    expect(pt.toString("hex")).toBe("48656c6c6f20576f726c6421212121")
    expect(pt.toString("ascii")).toBe("Hello World!!!!")
  })

  it("RC2-40: decrypts each block independently (CBC state advances correctly)", () => {
    // Two-block round-trip: ciphertext for "ABCDEFGHIJKLMNOP" (16 bytes + 8 bytes PKCS#7 = 3 blocks)
    // echo -n "ABCDEFGHIJKLMNOP" | openssl enc -rc2-40-cbc -provider legacy -provider default \
    //   -K 0102030405 -iv a1b2c3d4e5f60708 -nosalt | xxd -p
    const key = Buffer.from("0102030405", "hex") // 5 bytes
    const iv = Buffer.from("a1b2c3d4e5f60708", "hex")
    const plaintext = "ABCDEFGHIJKLMNOP" // exactly 16 bytes = 2 blocks of 8
    const ct = Buffer.from("7707ed88fbe972c3dad7fb9415184368f16e131cb43061af", "hex")
    const pt = rc2CbcDecrypt(key, iv, ct, 40)
    expect(pt.toString("ascii")).toBe(plaintext)
  })

  it("RC2-40: output length equals plaintext length (padding stripped correctly)", () => {
    // 8 bytes plaintext → 16 bytes ciphertext (8-byte block requires 8 bytes PKCS#7 padding)
    // echo -n "12345678" | openssl enc -rc2-40-cbc -provider legacy -provider default \
    //   -K ababababab -iv 0000000000000000 -nosalt | xxd -p
    const key = Buffer.from("ababababab", "hex")
    const iv = Buffer.alloc(8, 0)
    const plaintext = "12345678" // 8 bytes → full block → 8 bytes of PKCS#7 padding added
    const ct = Buffer.from("7927aefbe24eb25496cda876799a6b3b", "hex")
    expect(ct.length).toBe(16) // 8 plaintext + 8 PKCS#7 padding
    const pt = rc2CbcDecrypt(key, iv, ct, 40)
    expect(pt.length).toBe(8)
    expect(pt.toString("ascii")).toBe(plaintext)
  })
})

// ─── readCertInfo — RC2-40 encrypted PFX ─────────────────────────────────────

describe("readCertInfo — pbeWithSHAAnd40BitRC2CBC (OID 1.2.840.113549.1.12.1.6)", () => {
  it("extracts certificate info from a PFX whose cert bags are encrypted with RC2-40", async () => {
    // This PFX was generated with:
    //   openssl pkcs12 -export -certpbe PBE-SHA1-RC2-40 -keypbe PBE-SHA1-3DES -legacy
    // It exercises the pure-TS RFC 2268 RC2-CBC path that was added because
    // Node.js 22 / OpenSSL 3 no longer support RC2 in the default crypto provider.
    const result = await readCertInfo(RC2_40_PFX, "testrc2")
    expect(result.commonName).toBe("RC2 Test Signer")
    expect(result.bloodyMicrosoftSubjectDn).toBe("CN=RC2 Test Signer")
  })

  it("throws 'password incorrect' for the RC2-40 PFX with a wrong password", async () => {
    await expect(readCertInfo(RC2_40_PFX, "wrongpassword")).rejects.toThrow("password incorrect")
  })
})

// ─── rc2CbcDecrypt — input validation / security guards ──────────────────────
//
// Ciphertext vectors for security-guard tests produced by encrypting a raw 8-byte block
// WITHOUT PKCS#7 padding (openssl -nopad flag) so that decryption yields a block with
// a specific invalid last byte:
//   printf '\xNN...' | openssl enc -rc2-40-cbc -provider legacy -provider default \
//     -K ababababab -iv cdcdcdcdcdcdcdcd -nosalt -nopad | xxd -p

describe("rc2CbcDecrypt — input validation / security guards", () => {
  const key5 = Buffer.from("ababababab", "hex") // 5 bytes (RC2-40)
  const iv8 = Buffer.from("cdcdcdcdcdcdcdcd", "hex") // 8 bytes

  it("throws when ciphertext length is not a multiple of 8 (block-alignment guard)", () => {
    expect(() => rc2CbcDecrypt(key5, iv8, Buffer.alloc(7), 40)).toThrow(/not a positive multiple/)
  })

  it("throws when ciphertext is empty (block-alignment guard)", () => {
    expect(() => rc2CbcDecrypt(key5, iv8, Buffer.alloc(0), 40)).toThrow(/not a positive multiple/)
  })

  it("throws when IV is not exactly 8 bytes", () => {
    expect(() => rc2CbcDecrypt(key5, Buffer.alloc(7), Buffer.alloc(8), 40)).toThrow(/IV must be exactly 8 bytes/)
  })

  it("throws when last decrypted byte is 0x00 (invalid PKCS#7 pad byte)", () => {
    // Encrypts [0x41..0x47, 0x00] without PKCS#7 padding; decrypts back to the same 8 raw bytes.
    const ct = Buffer.from("39b7121f4a3d9a30", "hex")
    expect(ct.length).toBe(8)
    expect(() => rc2CbcDecrypt(key5, iv8, ct, 40)).toThrow(/invalid PKCS#7 pad byte/)
  })

  it("throws when PKCS#7 pad byte exceeds block size (0x09 > 8)", () => {
    // Encrypts [0x41..0x47, 0x09] without PKCS#7 padding.
    const ct = Buffer.from("e032cf7e7effbe0b", "hex")
    expect(() => rc2CbcDecrypt(key5, iv8, ct, 40)).toThrow(/invalid PKCS#7 pad byte/)
  })

  it("throws when PKCS#7 padding bytes are inconsistent", () => {
    // Encrypts [0x41..0x45, 0x01, 0x01, 0x02] without PKCS#7 padding.
    // Last byte = 0x02 (declares pad length 2), but second-to-last = 0x01 not 0x02.
    const ct = Buffer.from("f90a40cc55a3a531", "hex")
    expect(() => rc2CbcDecrypt(key5, iv8, ct, 40)).toThrow(/invalid PKCS#7 padding/)
  })

  it("throws when effectiveBits = 0 (OOB access guard in rc2ExpandKey)", () => {
    // effectiveBits=0 → T8=ceil(0/8)=0 → L[128-0]=L[128] is out-of-bounds on a 128-element
    // Uint8Array. The guard in rc2ExpandKey must fire before any array access occurs.
    expect(() => rc2CbcDecrypt(key5, iv8, Buffer.alloc(8), 0)).toThrow(/effectiveBits/)
  })

  it("throws when effectiveBits is negative", () => {
    expect(() => rc2CbcDecrypt(key5, iv8, Buffer.alloc(8), -1)).toThrow(/effectiveBits/)
  })

  it("throws when effectiveBits exceeds 1024", () => {
    expect(() => rc2CbcDecrypt(key5, iv8, Buffer.alloc(8), 1025)).toThrow(/effectiveBits/)
  })
})

// ─── pkcs12PbeDeriveKey — salt size guard ────────────────────────────────────

describe("pkcs12PbeDeriveKey — salt size guard", () => {
  it("throws when salt exceeds 4096 bytes (memory exhaustion prevention)", () => {
    // Without the cap, ceil(saltLen / 64) * 64 bytes are allocated for S in the KDF.
    // A multi-megabyte salt in a crafted PFX would exhaust memory before any crypto runs.
    const hugeSalt = Buffer.alloc(4097, 0xaa)
    expect(() => pkcs12PbeDeriveKey(pkcs12PasswordToUtf16("test"), hugeSalt, 1, 1, 8)).toThrow(/exceeds the safe maximum/)
  })

  it("accepts salt at the 4096-byte boundary without throwing", () => {
    const maxSalt = Buffer.alloc(4096, 0xaa)
    expect(() => pkcs12PbeDeriveKey(pkcs12PasswordToUtf16("test"), maxSalt, 1, 1, 1)).not.toThrow()
  })
})
