import * as os from "os"
import * as path from "path"
import { mkdtemp } from "fs/promises"
import { afterAll, beforeAll, describe, it, expect } from "vitest"
import * as forge from "node-forge"
import { writeFile, remove } from "fs-extra"
import { readCertInfo, _testingOnly } from "app-builder-lib/src/codeSign/certInfo"

const { pkcs12PbeDeriveKey, pkcs12PasswordToUtf16, MAX_PKCS12_PBE_ITERATIONS } = _testingOnly
import { executeAppBuilder } from "builder-util"
import { WIN_CSC_LINK } from "./helpers/codeSignData"

// ─── PFX generation helper (cross-platform, no openssl required) ─────────────

interface SubjectAttr {
  name?: string
  shortName?: string
  value: string
}

/**
 * Generates a self-signed PKCS#12 (PFX) buffer using node-forge.
 * Uses RSA-1024 for speed in tests (not for security).
 */
function generatePfx(subject: SubjectAttr[], password: string, includeCodeSigningEku = true): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = "01"
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  cert.setSubject(subject as forge.pki.CertificateField[])
  cert.setIssuer(subject as forge.pki.CertificateField[])
  const extensions: object[] = [
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true },
  ]
  if (includeCodeSigningEku) {
    extensions.push({ name: "extKeyUsage", codeSigning: true })
  }
  cert.setExtensions(extensions)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, password)
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary")
}

// ─── Test fixture paths ───────────────────────────────────────────────────────

let tmpDir: string
let FULL_SUBJECT_PFX: string
let CN_ONLY_PFX: string
let NO_EKU_PFX: string
let WIN_CSC_PFX: string
let PARITY_PFX: string
let OU_PFX: string
let SPECIAL_PFX: string
let MULTI_CERT_PFX: string
let TRUNCATED_PFX: string

/**
 * Generates a PFX containing two certificates for the same key pair:
 *  1. A CA cert (basicConstraints CA:true, NO codeSigning EKU)
 *  2. A signing cert (CA:false, WITH codeSigning EKU)
 *
 * Both certs share the same key to avoid generating two key pairs.
 * The CA cert is placed FIRST in the cert-bag list to verify that
 * readCertInfo correctly skips non-signing certs.
 */
function generateMultiCertPfx(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(1024)

  const caSubject: forge.pki.CertificateField[] = [{ name: "commonName", value: "Test CA" }]
  const caCert = forge.pki.createCertificate()
  caCert.publicKey = keys.publicKey
  caCert.serialNumber = "10"
  caCert.validity.notBefore = new Date()
  caCert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  caCert.setSubject(caSubject)
  caCert.setIssuer(caSubject)
  caCert.setExtensions([{ name: "basicConstraints", cA: true }])
  caCert.sign(keys.privateKey, forge.md.sha256.create())

  const signingSubject: forge.pki.CertificateField[] = [{ name: "commonName", value: "Multi-Cert Signer" }]
  const signingCert = forge.pki.createCertificate()
  signingCert.publicKey = keys.publicKey
  signingCert.serialNumber = "11"
  signingCert.validity.notBefore = new Date()
  signingCert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  signingCert.setSubject(signingSubject)
  signingCert.setIssuer(caSubject)
  signingCert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "extKeyUsage", codeSigning: true },
  ])
  signingCert.sign(keys.privateKey, forge.md.sha256.create())

  // CA cert listed first → readCertInfo must skip it and select the signing cert
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [caCert, signingCert], password)
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary")
}

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "certinfo-test-"))
  FULL_SUBJECT_PFX = path.join(tmpDir, "full.pfx")
  CN_ONLY_PFX = path.join(tmpDir, "cn.pfx")
  NO_EKU_PFX = path.join(tmpDir, "noeku.pfx")
  WIN_CSC_PFX = path.join(tmpDir, "wincsc.pfx")
  PARITY_PFX = path.join(tmpDir, "parity.pfx")
  OU_PFX = path.join(tmpDir, "ou.pfx")
  SPECIAL_PFX = path.join(tmpDir, "special.pfx")
  MULTI_CERT_PFX = path.join(tmpDir, "multicert.pfx")
  TRUNCATED_PFX = path.join(tmpDir, "truncated.pfx")

  await Promise.all([
    writeFile(
      FULL_SUBJECT_PFX,
      generatePfx(
        [
          { name: "commonName", value: "Test Publisher" },
          { name: "organizationName", value: "Test Org" },
          { shortName: "L", value: "San Francisco" },
          { shortName: "ST", value: "California" },
          { shortName: "C", value: "US" },
        ],
        "testpassword"
      )
    ),
    writeFile(CN_ONLY_PFX, generatePfx([{ name: "commonName", value: "My Company Inc." }], "pw")),
    writeFile(NO_EKU_PFX, generatePfx([{ name: "commonName", value: "No EKU Cert" }], "pw", false)),
    writeFile(WIN_CSC_PFX, Buffer.from(WIN_CSC_LINK.replace("data:application/x-pkcs12;base64,", ""), "base64")),
    writeFile(
      PARITY_PFX,
      generatePfx(
        [
          { name: "commonName", value: "Parity Test Publisher" },
          { name: "organizationName", value: "Parity Org" },
          { shortName: "C", value: "DE" },
        ],
        "paritypassword"
      )
    ),
    writeFile(
      OU_PFX,
      generatePfx(
        [
          { name: "commonName", value: "Test Publisher" },
          { name: "organizationName", value: "Test Org" },
          { shortName: "OU", value: "Engineering" },
          { shortName: "C", value: "US" },
        ],
        "pw"
      )
    ),
    writeFile(
      SPECIAL_PFX,
      generatePfx(
        [
          // comma and plus are valid PrintableString chars but require DN quoting (RFC 4514 / BloodyMsString)
          { name: "commonName", value: "Publisher, Inc. + Partners" },
          { shortName: "C", value: "US" },
        ],
        "pw"
      )
    ),
    writeFile(MULTI_CERT_PFX, generateMultiCertPfx("multicertpw")),
    // Truncated PFX: first 50 bytes of WIN_CSC_LINK (incomplete ASN.1 structure)
    writeFile(TRUNCATED_PFX, Buffer.from(WIN_CSC_LINK.replace("data:application/x-pkcs12;base64,", ""), "base64").subarray(0, 50)),
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

  it("parity: special-character DN matches binary output exactly", async () => {
    const [binaryRaw, jsResult] = await Promise.all([executeAppBuilder(["certificate-info", "--input", SPECIAL_PFX, "--password", "pw"]), readCertInfo(SPECIAL_PFX, "pw")])
    const binaryResult: { commonName: string; bloodyMicrosoftSubjectDn: string } = JSON.parse(binaryRaw)
    expect(jsResult.commonName).toBe(binaryResult.commonName)
    expect(jsResult.bloodyMicrosoftSubjectDn).toBe(binaryResult.bloodyMicrosoftSubjectDn)
  })
})

// ─── Parity tests: JS implementation vs app-builder-bin binary ───────────────

describe("readCertInfo — parity with app-builder-bin", () => {
  it("produces identical output to the binary for the existing WIN_CSC_LINK certificate", async () => {
    const [binaryRaw, jsResult] = await Promise.all([executeAppBuilder(["certificate-info", "--input", WIN_CSC_PFX, "--password", ""]), readCertInfo(WIN_CSC_PFX, "")])

    const binaryResult: { commonName: string; bloodyMicrosoftSubjectDn: string } = JSON.parse(binaryRaw)
    expect(jsResult.commonName).toBe(binaryResult.commonName)
    expect(jsResult.bloodyMicrosoftSubjectDn).toBe(binaryResult.bloodyMicrosoftSubjectDn)
  })

  it("produces identical output to the binary for a forge-generated certificate with full subject DN", async () => {
    const [binaryRaw, jsResult] = await Promise.all([
      executeAppBuilder(["certificate-info", "--input", PARITY_PFX, "--password", "paritypassword"]),
      readCertInfo(PARITY_PFX, "paritypassword"),
    ])

    const binaryResult: { commonName: string; bloodyMicrosoftSubjectDn: string } = JSON.parse(binaryRaw)
    expect(jsResult.commonName).toBe(binaryResult.commonName)
    expect(jsResult.bloodyMicrosoftSubjectDn).toBe(binaryResult.bloodyMicrosoftSubjectDn)
  })

  it("binary returns {error} JSON for wrong password; JS throws equivalent message", async () => {
    const binaryRaw = await executeAppBuilder(["certificate-info", "--input", WIN_CSC_PFX, "--password", "wrongpassword"])
    const binaryResult: { error: string } = JSON.parse(binaryRaw)
    expect(binaryResult.error).toBe("password incorrect")

    await expect(readCertInfo(WIN_CSC_PFX, "wrongpassword")).rejects.toThrow(binaryResult.error)
  })

  it("binary exits non-zero for a cert without code-signing EKU; JS throws with the same key phrase", async () => {
    // The binary writes the error to stderr and exits non-zero — executeAppBuilder rejects with a
    // generic process-failure error, so we can only verify it rejects (not inspect the message).
    await expect(executeAppBuilder(["certificate-info", "--input", NO_EKU_PFX, "--password", "pw"])).rejects.toThrow()

    // The JS side surfaces the exact phrase in its thrown error.
    await expect(readCertInfo(NO_EKU_PFX, "pw")).rejects.toThrow(/ExtKeyUsageCodeSigning/)
  })

  it("binary returns {error} JSON for a missing file (exit 0); JS throws ENOENT", async () => {
    // The binary writes {"error": "<os error>"} to stdout and exits 0 for file-not-found.
    // JS readFile() throws ENOENT instead — a known divergence in error-signalling style.
    const missingPath = "/nonexistent/certinfo-parity-missing.pfx"
    const binaryRaw = await executeAppBuilder(["certificate-info", "--input", missingPath, "--password", "pw"])
    const binaryResult: { error: string } = JSON.parse(binaryRaw)
    expect(binaryResult.error).toMatch(/no such file|not found|cannot find the path/i)

    await expect(readCertInfo(missingPath, "pw")).rejects.toThrow(/ENOENT|no such file/i)
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
