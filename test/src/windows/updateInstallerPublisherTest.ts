import {
  AuthenticodeSignatureStatus,
  AuthenticodeSignerInfo,
  readAuthenticodeSignerWithPowerShell,
  readEmbeddedAuthenticodeSigner,
} from "app-builder-lib/src/codeSign/win/authenticodeSignature"
import { verifyUpdateInstallerPublisher } from "app-builder-lib/src/codeSign/win/verifyUpdatePublisher"
import type { SigningResult } from "app-builder-lib/src/codeSign/signResult"
import { InvalidConfigurationError, log } from "builder-util"
import { outputFile } from "fs-extra"
import { execFileSync } from "child_process"
import { readFile, writeFile } from "fs/promises"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterAll, vi } from "vitest"
import { cleanupWindowsSignedFixture, createSignedExecutable, getWindowsSignedFixture } from "../helpers/windowsSignedFixture"

// Build-time check that the installer electron-updater verifies at update time is signed by a certificate matching
// the publisherName written into app-update.yml.

const SUBJECT = "CN=Acme Corp, O=Acme Corporation, L=San Francisco, S=California, C=US"
const INSTALLER = path.join("dist", "Acme Setup 1.0.0.exe")

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Generates a code signing certificate issued by a throwaway CA with OpenSSL and returns a DER PKCS#7 SignedData
 * signed with it (the CA certificate embedded too), like the signature in an Authenticode certificate table.
 */
async function createPkcs7(tmpDir: TmpDir, subject: string, { embedSigner = true } = {}): Promise<Buffer> {
  const dir = await tmpDir.createTempDir({ prefix: "pkcs7" })
  const file = (name: string) => path.join(dir, name)
  const openssl = (...args: Array<string>) => execFileSync("openssl", args, { stdio: "pipe" })
  openssl(
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "2",
    "-keyout",
    file("ca.key"),
    "-out",
    file("ca.crt"),
    "-subj",
    "/C=US/O=Test CA/CN=Test Code Signing CA"
  )
  openssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", file("leaf.key"), "-out", file("leaf.csr"), "-subj", subject)
  await writeFile(file("leaf.ext"), "extendedKeyUsage=codeSigning\nbasicConstraints=CA:false\n")
  openssl(
    "x509",
    "-req",
    "-in",
    file("leaf.csr"),
    "-CA",
    file("ca.crt"),
    "-CAkey",
    file("ca.key"),
    "-set_serial",
    "2",
    "-days",
    "2",
    "-sha256",
    "-extfile",
    file("leaf.ext"),
    "-out",
    file("leaf.crt")
  )
  await writeFile(file("content.bin"), "authenticode indirect data stand-in")
  const signArgs = ["cms", "-sign", "-binary", "-nodetach", "-outform", "DER", "-md", "sha256", "-in", file("content.bin"), "-signer", file("leaf.crt"), "-inkey", file("leaf.key")]
  signArgs.push(...(embedSigner ? ["-certfile", file("ca.crt")] : ["-nocerts"]))
  openssl(...signArgs, "-out", file("signature.p7"))
  return readFile(file("signature.p7"))
}

/** A minimal PE32+ image with an optional certificate table (one WIN_CERTIFICATE entry) appended. */
function createPe(signature: Buffer | null, certificateType = 0x0002): Buffer {
  const peOffset = 0x40
  const optionalHeaderSize = 240
  const headers = Buffer.alloc(peOffset + 24 + optionalHeaderSize)
  headers.write("MZ", 0, "latin1")
  headers.writeUInt32LE(peOffset, 0x3c)
  headers.write("PE\0\0", peOffset, "latin1")
  headers.writeUInt16LE(0x8664, peOffset + 4)
  headers.writeUInt16LE(optionalHeaderSize, peOffset + 20)
  const optionalHeader = peOffset + 24
  headers.writeUInt16LE(0x20b, optionalHeader)
  headers.writeUInt32LE(16, optionalHeader + 108)
  const body = Buffer.alloc(512, 0x90)
  if (signature == null) {
    return Buffer.concat([headers, body])
  }
  const entryLength = 8 + signature.length
  const entry = Buffer.alloc(entryLength + ((8 - (entryLength % 8)) % 8))
  entry.writeUInt32LE(entryLength, 0)
  entry.writeUInt16LE(0x0200, 4)
  entry.writeUInt16LE(certificateType, 6)
  signature.copy(entry, 8)
  const securityDirectory = optionalHeader + 112 + 4 * 8
  headers.writeUInt32LE(headers.length + body.length, securityDirectory)
  headers.writeUInt32LE(entry.length, securityDirectory + 4)
  return Buffer.concat([headers, body, entry])
}

interface StubPackager {
  readonly isForceCodeSigningVerification: boolean
  getResourcesDir(appOutDir: string): string
}

function stubPackager(isForceCodeSigningVerification = true): StubPackager {
  return { isForceCodeSigningVerification, getResourcesDir: appOutDir => path.join(appOutDir, "resources") }
}

/** Creates a packed app dir whose app-update.yml carries `publisherName` (omitted when undefined). */
async function createAppOutDir(tmpDir: TmpDir, publisherName?: string | Array<string>): Promise<string> {
  const appOutDir = await tmpDir.getTempDir({ prefix: "win-unpacked" })
  const lines = ["provider: generic", "url: https://example.com/updates", "updaterCacheDirName: acme-updater"]
  if (publisherName != null) {
    lines.push("publisherName:", ...(Array.isArray(publisherName) ? publisherName : [publisherName]).map(it => `  - ${JSON.stringify(it)}`))
  }
  await outputFile(path.join(appOutDir, "resources", "app-update.yml"), lines.join("\n") + "\n")
  return appOutDir
}

function signedBy(subject: string, status: number | null = null) {
  return vi.fn(async (_file: string): Promise<AuthenticodeSignerInfo> => ({ type: "signed", subject, status }))
}

async function verify(
  appOutDirs: Array<string>,
  readSigner: (file: string) => Promise<AuthenticodeSignerInfo>,
  { signResult = "signed", packager = stubPackager(), failOnUnreadableSignature }: { signResult?: SigningResult; packager?: StubPackager; failOnUnreadableSignature?: boolean } = {}
) {
  return verifyUpdateInstallerPublisher(packager, INSTALLER, signResult, appOutDirs, { readSigner, failOnUnreadableSignature })
}

// ─── verifyUpdateInstallerPublisher (signature reader stubbed) ───────────────

describe("verifyUpdateInstallerPublisher", () => {
  test("fails when the signer subject does not match publisherName, naming the file, the names and the subject", async ({ expect, tmpDir }) => {
    const appOutDir = await createAppOutDir(tmpDir, ["CN=Other Corp, O=Other Corporation", "Old Corp"])
    const error = await verify([appOutDir], signedBy(SUBJECT)).then(
      () => null,
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    const message = (error as Error).message
    expect(message).toContain("Acme Setup 1.0.0.exe")
    expect(message).toContain("Configured publisherName: CN=Other Corp, O=Other Corporation | Old Corp")
    expect(message).toContain(`Signer certificate subject: ${SUBJECT}`)
    expect(message).toContain("win.sign.publisherName")
    expect(message).toContain("win.verifyUpdateCodeSignature: false")
  })

  test("passes when publisherName matches the full DN", async ({ expect, tmpDir }) => {
    const readSigner = signedBy(SUBJECT)
    await expect(verify([await createAppOutDir(tmpDir, [SUBJECT])], readSigner)).resolves.toBeUndefined()
    expect(readSigner).toHaveBeenCalledWith(INSTALLER)
  })

  test("passes with a CN-only publisherName and warns, as electron-updater does", async ({ expect, tmpDir }) => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      await expect(verify([await createAppOutDir(tmpDir, "Acme Corp")], signedBy(SUBJECT))).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ subject: SUBJECT }),
        "Signature validated using only CN Acme Corp. Please add your full Distinguished Name (DN) to publisherNames configuration"
      )
    } finally {
      warn.mockRestore()
    }
  })

  test("a DN with an OpenSSL-style ST key fails: Windows reports the state as S", async ({ expect, tmpDir }) => {
    await expect(verify([await createAppOutDir(tmpDir, "CN=Acme Corp, ST=California")], signedBy(SUBJECT))).rejects.toThrow(InvalidConfigurationError)
  })

  test("checks a file signed by a custom win.sign.sign hook", async ({ expect, tmpDir }) => {
    const appOutDir = await createAppOutDir(tmpDir, "CN=Other Corp")
    await expect(verify([appOutDir], signedBy(SUBJECT), { signResult: "signed:custom" })).rejects.toThrow(InvalidConfigurationError)
    await expect(verify([await createAppOutDir(tmpDir, SUBJECT)], signedBy(SUBJECT), { signResult: "signed:custom" })).resolves.toBeUndefined()
  })

  test.for<SigningResult>(["skipped:no-certificate", "skipped:filtered", "skipped:disabled", "skipped:unsupported"])(
    "does not check a file that was not signed (%s)",
    async (signResult, { expect, tmpDir }) => {
      const readSigner = signedBy(SUBJECT)
      await expect(verify([await createAppOutDir(tmpDir, "CN=Other Corp")], readSigner, { signResult })).resolves.toBeUndefined()
      expect(readSigner).not.toHaveBeenCalled()
    }
  )

  test("verifyUpdateCodeSignature: false skips the check", async ({ expect, tmpDir }) => {
    const readSigner = signedBy(SUBJECT)
    await expect(verify([await createAppOutDir(tmpDir, "CN=Other Corp")], readSigner, { packager: stubPackager(false) })).resolves.toBeUndefined()
    expect(readSigner).not.toHaveBeenCalled()
  })

  test("skips when no app-update.yml is packed or it has no publisherName (electron-updater does not verify then)", async ({ expect, tmpDir }) => {
    const readSigner = signedBy(SUBJECT)
    await expect(verify([await tmpDir.getTempDir({ prefix: "no-updater-config" })], readSigner)).resolves.toBeUndefined()
    await expect(verify([await createAppOutDir(tmpDir)], readSigner)).resolves.toBeUndefined()
    expect(readSigner).not.toHaveBeenCalled()
  })

  test("checks the publisherName of every arch's app-update.yml", async ({ expect, tmpDir }) => {
    const matching = await createAppOutDir(tmpDir, SUBJECT)
    const mismatching = await createAppOutDir(tmpDir, "CN=Other Corp")
    await expect(verify([matching, mismatching], signedBy(SUBJECT))).rejects.toThrow(/Configured publisherName: CN=Other Corp\n/)
  })

  test("fails when signing reported success but the file carries no signature", async ({ expect, tmpDir }) => {
    const readSigner = vi.fn(async (): Promise<AuthenticodeSignerInfo> => ({ type: "unsigned", reason: "empty PE certificate table" }))
    await expect(verify([await createAppOutDir(tmpDir, SUBJECT)], readSigner)).rejects.toThrow(/carries no Authenticode signature \(empty PE certificate table\)/)
  })

  test("an unreadable signature fails when the reader is authoritative (Windows), and only warns otherwise", async ({ expect, tmpDir }) => {
    const appOutDir = await createAppOutDir(tmpDir, SUBJECT)
    const readSigner = vi.fn(async (): Promise<AuthenticodeSignerInfo> => ({ type: "unreadable", reason: "boom" }))
    await expect(verify([appOutDir], readSigner, { failOnUnreadableSignature: true })).rejects.toThrow(/Cannot read the Authenticode signature .*: boom/)

    const warn = vi.spyOn(log, "warn").mockImplementation(() => log)
    try {
      await expect(verify([appOutDir], readSigner, { failOnUnreadableSignature: false })).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ reason: "boom" }), expect.any(String))
    } finally {
      warn.mockRestore()
    }
  })

  test("fails on a signature Windows reports as HashMismatch", async ({ expect, tmpDir }) => {
    await expect(verify([await createAppOutDir(tmpDir, SUBJECT)], signedBy(SUBJECT, AuthenticodeSignatureStatus.HashMismatch))).rejects.toThrow(/modified after signing/)
  })

  test("accepts a signature the build host does not trust (NotTrusted), when the publisher matches", async ({ expect, tmpDir }) => {
    const appOutDir = await createAppOutDir(tmpDir, SUBJECT)
    await expect(verify([appOutDir], signedBy(SUBJECT, AuthenticodeSignatureStatus.NotTrusted))).resolves.toBeUndefined()
    await expect(verify([appOutDir], signedBy("CN=Somebody Else", AuthenticodeSignatureStatus.NotTrusted))).rejects.toThrow(/does not match the publisherName/)
  })
})

// ─── Reading the embedded signature (any host) ───────────────────────────────

describe("readEmbeddedAuthenticodeSigner", () => {
  async function signedPe(tmpDir: TmpDir, subject: string): Promise<string> {
    const file = path.join(await tmpDir.createTempDir({ prefix: "pe" }), "signed.exe")
    await writeFile(file, createPe(await createPkcs7(tmpDir, subject)))
    return file
  }

  test("returns the signer certificate subject in the Windows format: reversed order, S for the state", async ({ expect, tmpDir }) => {
    // the CA certificate is embedded too, so the signer must be found by issuer and serial number
    const file = await signedPe(tmpDir, "/C=US/ST=California/L=San Francisco/O=Acme Corporation/CN=Acme Corp")
    await expect(readEmbeddedAuthenticodeSigner(file)).resolves.toEqual({ type: "signed", subject: SUBJECT, status: null })
  })

  test("quotes values with special characters, doubling embedded quotes", async ({ expect, tmpDir }) => {
    const file = await signedPe(tmpDir, '/C=US/O=Acme\\, Inc./OU=say "hi"/CN=A\\+B')
    await expect(readEmbeddedAuthenticodeSigner(file)).resolves.toMatchObject({ subject: 'CN="A+B", OU="say ""hi""", O="Acme, Inc.", C=US' })
  })

  test("writes e-mail as E and unknown attributes as OID.<oid>, like EV certificate subjects", async ({ expect, tmpDir }) => {
    const file = await signedPe(tmpDir, "/businessCategory=Private Organization/serialNumber=12345/CN=Acme Corp/emailAddress=dev@example.com")
    await expect(readEmbeddedAuthenticodeSigner(file)).resolves.toMatchObject({
      subject: "E=dev@example.com, CN=Acme Corp, SERIALNUMBER=12345, OID.2.5.4.15=Private Organization",
    })
  })

  test("reports a PE without a certificate table as unsigned", async ({ expect, tmpDir }) => {
    const file = path.join(await tmpDir.createTempDir({ prefix: "pe" }), "unsigned.exe")
    await writeFile(file, createPe(null))
    await expect(readEmbeddedAuthenticodeSigner(file)).resolves.toMatchObject({ type: "unsigned" })
  })

  test("reports a non-PE file, a foreign certificate type, a corrupt signature and a missing signer certificate as unreadable", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir({ prefix: "pe" })
    const notPe = path.join(dir, "not-pe.exe")
    await writeFile(notPe, "not a PE file at all, just some text that is long enough for a DOS header read")
    await expect(readEmbeddedAuthenticodeSigner(notPe)).resolves.toMatchObject({ type: "unreadable", reason: expect.stringContaining("MZ") })

    const x509Entry = path.join(dir, "x509.exe")
    await writeFile(x509Entry, createPe(await createPkcs7(tmpDir, "/CN=Acme Corp"), 0x0001))
    await expect(readEmbeddedAuthenticodeSigner(x509Entry)).resolves.toMatchObject({ type: "unreadable", reason: expect.stringContaining("WIN_CERTIFICATE type") })

    const corrupt = path.join(dir, "corrupt.exe")
    await writeFile(corrupt, createPe(Buffer.from("definitely not DER")))
    await expect(readEmbeddedAuthenticodeSigner(corrupt)).resolves.toMatchObject({ type: "unreadable" })

    const noSignerCertificate = path.join(dir, "no-signer-certificate.exe")
    await writeFile(noSignerCertificate, createPe(await createPkcs7(tmpDir, "/CN=Acme Corp", { embedSigner: false })))
    await expect(readEmbeddedAuthenticodeSigner(noSignerCertificate)).resolves.toMatchObject({ type: "unreadable", reason: expect.stringContaining("not embedded") })
  })
})

// ─── Windows e2e: real Authenticode signature, real PowerShell ──────────────

describe.ifWindows("update installer publisher check (e2e, real signature)", () => {
  afterAll(() => cleanupWindowsSignedFixture())

  test("both readers report the subject Get-AuthenticodeSignature reports", { timeout: 120_000 }, async context => {
    const fixture = await getWindowsSignedFixture()
    if (fixture == null) {
      context.skip()
      return
    }
    const exe = await createSignedExecutable(fixture, await context.tmpDir.createTempDir({ prefix: "signed" }))
    const viaPowerShell = await readAuthenticodeSignerWithPowerShell(exe)
    context.expect(viaPowerShell).toMatchObject({ type: "signed", subject: fixture.subject })
    // the pure-JS reader used on Linux/macOS must produce the exact format electron-updater sees on Windows
    context.expect(await readEmbeddedAuthenticodeSigner(exe)).toEqual({ type: "signed", subject: fixture.subject, status: null })
  })

  test("a matching publisherName passes and a wrong one fails", { timeout: 120_000 }, async context => {
    const fixture = await getWindowsSignedFixture()
    if (fixture == null) {
      context.skip()
      return
    }
    const exe = await createSignedExecutable(fixture, await context.tmpDir.createTempDir({ prefix: "signed" }))
    const check = async (publisherName: string) => verifyUpdateInstallerPublisher(stubPackager(), exe, "signed:custom", [await createAppOutDir(context.tmpDir, publisherName)])
    await context.expect(check(fixture.subject)).resolves.toBeUndefined()
    await context.expect(check("CN=Somebody Else, O=Elsewhere")).rejects.toThrow(InvalidConfigurationError)
  })

  test("an unsigned file is reported as unsigned by PowerShell", { timeout: 60_000 }, async ({ expect, tmpDir }) => {
    const file = path.join(await tmpDir.createTempDir({ prefix: "pe" }), "unsigned.exe")
    await writeFile(file, createPe(null))
    await expect(readAuthenticodeSignerWithPowerShell(file)).resolves.toMatchObject({ type: "unsigned" })
  })
})
