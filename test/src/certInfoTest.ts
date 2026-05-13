import * as os from "os"
import * as path from "path"
import { afterAll, beforeAll, describe, it, expect } from "vitest"
import * as forge from "node-forge"
import { writeFile, remove } from "fs-extra"
import { readCertInfo } from "app-builder-lib/src/codeSign/certInfo"
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
  const extensions: object[] = [{ name: "basicConstraints", cA: false }, { name: "keyUsage", digitalSignature: true }]
  if (includeCodeSigningEku) {
    extensions.push({ name: "extKeyUsage", codeSigning: true })
  }
  cert.setExtensions(extensions)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, password)
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary")
}

// ─── Test fixture paths ───────────────────────────────────────────────────────

const tmp = os.tmpdir()
const FULL_SUBJECT_PFX = path.join(tmp, "certinfo-test-full.pfx")
const CN_ONLY_PFX = path.join(tmp, "certinfo-test-cn.pfx")
const NO_EKU_PFX = path.join(tmp, "certinfo-test-noeku.pfx")
const WIN_CSC_PFX = path.join(tmp, "certinfo-test-wincsc.pfx")
const PARITY_PFX = path.join(tmp, "certinfo-test-parity.pfx")

beforeAll(async () => {
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
  ])
})

afterAll(async () => {
  await Promise.all([FULL_SUBJECT_PFX, CN_ONLY_PFX, NO_EKU_PFX, WIN_CSC_PFX, PARITY_PFX].map(p => remove(p).catch(() => null)))
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

// ─── Parity tests: JS implementation vs app-builder-bin binary ───────────────

describe("readCertInfo — parity with app-builder-bin", () => {
  it("produces identical output to the binary for the existing WIN_CSC_LINK certificate", async () => {
    const [binaryRaw, jsResult] = await Promise.all([
      executeAppBuilder(["certificate-info", "--input", WIN_CSC_PFX, "--password", ""]),
      readCertInfo(WIN_CSC_PFX, ""),
    ])

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
})
