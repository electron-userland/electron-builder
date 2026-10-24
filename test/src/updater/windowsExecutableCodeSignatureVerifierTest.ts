// vi.mock calls are hoisted to the top by vitest's transformer.
// They must appear before any imports that depend on them.
import { afterAll, afterEach, expect, vi, type TestContext } from "vitest"

vi.mock("child_process", async importOriginal => {
  const mod = await importOriginal<typeof import("child_process")>()
  return { ...mod, execFile: vi.fn(), execFileSync: vi.fn() }
})

import { execFile, execFileSync } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import type { TmpDir } from "temp-file"
import type { VerifyUpdateFileResult } from "electron-updater/src/index"
import type { Logger } from "electron-updater/src/types"
import { publisherNameDnNote, verifySignature } from "electron-updater/src/windowsExecutableCodeSignatureVerifier"
import { cleanupWindowsSignedFixture, createSignedExecutable, getWindowsSignedFixture } from "../helpers/windowsSignedFixture"

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SUBJECT = "CN=Test Publisher, O=Test Org, C=US"
const DN_DOCS = "https://www.electron.build/docs/migration/v27-breaking-changes#windows-publishername-must-be-a-distinguished-name"
const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"

// =============================================================================
// Logger stub
// =============================================================================

function createLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function expectVerificationSuccess(result: VerifyUpdateFileResult): void {
  expect(result).toEqual({ response: "success" })
}

function expectVerificationFailure(result: VerifyUpdateFileResult): string {
  expect(result.response).toBe("failure")
  if (result.response !== "failure") {
    // narrows the discriminated union so `message` is reachable below
    throw new Error("Expected signature verification to fail")
  }
  // a failure always carries a reason, otherwise the error surfaced to the app says nothing
  expect(result.message).not.toBe("")
  return result.message
}

// The Get-AuthenticodeSignature JSON embedded in a failure message ("raw info: {...}")
function rawInfoOf(message: string): any {
  return JSON.parse(message.substring(message.indexOf("raw info: ") + "raw info: ".length))
}

// =============================================================================
// PowerShell JSON fixture builder
//
// Mirrors the shape Get-AuthenticodeSignature | ConvertTo-Json -Compress produces.
// =============================================================================

interface SignatureJsonOpts {
  status?: number
  filePath?: string
  subject?: string
  omitPath?: boolean
  // System.Management.Automation.SignatureType: None 0, Authenticode 1, Catalog 2; null omits it
  signatureType?: number | null
  withStrippableFields?: boolean
}

function makeSignatureJson(opts: SignatureJsonOpts = {}): string {
  const { status = 0, filePath = "", subject = DEFAULT_SUBJECT, omitPath = false, signatureType = 1, withStrippableFields = false } = opts

  const cert: Record<string, unknown> = {
    Subject: subject,
    Issuer: subject,
    Thumbprint: "AABBCCDDEEFF00112233445566778899AABBCCDD",
    NotBefore: "/Date(1000000000000)/",
    NotAfter: "/Date(9999999999000)/",
  }

  if (withStrippableFields) {
    cert.Archived = false
    cert.Extensions = [{ critical: false }]
    cert.Handle = { value: 0 }
    cert.HasPrivateKey = false
    cert.SubjectName = { Name: subject }
  }

  const data: Record<string, unknown> = {
    SignerCertificate: cert,
    TimeStamperCertificate: null,
    Status: status,
    StatusMessage: status === 0 ? "Signature verified." : "The file is not digitally signed.",
  }

  if (!omitPath) {
    data.Path = filePath
  }

  if (signatureType != null) {
    data.SignatureType = signatureType
  }

  if (withStrippableFields) {
    data.PrivateKey = null
    data.IsOSBinary = false
  }

  return JSON.stringify(data)
}

// =============================================================================
// Unit tests (mocked child_process)
//
// Platform-agnostic: execFile and execFileSync are replaced with vi.fn() via
// vi.mock so no real PowerShell is ever spawned. SystemRoot (only set on
// Windows) is stubbed, so the absolute PowerShell path is the same on any host.
// =============================================================================

describe("publisherNameDnNote", () => {
  test("is null when every entry is a DN", () => {
    expect(publisherNameDnNote(["CN=Acme Corp, O=Acme Corp", "C=US, O=Old Org, CN=Old Corp", "CN=Acme Corp"])).toBeNull()
    expect(publisherNameDnNote([])).toBeNull()
  })

  test("names only the entries that can never match, what is required and the migration guide", () => {
    const note = publisherNameDnNote(["CN=Acme Corp, O=Acme Corp", "Acme Corp", "CN=Acme Corp", "CN="])
    expect(note).toBe(
      'electron-updater 7 (electron-builder v27) matches a publisherName only when it is in distinguished name (DN) format, e.g. "CN=My Company, O=My Company, C=US": ' +
        'publisherName "Acme Corp", "CN=" can never match the signer of an update. ' +
        `Build the app with electron-builder v27, which writes such a DN to app-update.yml, or set the publisherName of dev-app-update.yml (or the updateConfigPath file) to the certificate subject. ${DN_DOCS}`
    )
  })

  test("never throws, whatever a hand-edited app-update.yml or a JavaScript caller passes", () => {
    const throwingToString = {
      toString: () => {
        throw new Error("boom")
      },
    }
    expect(publisherNameDnNote([42, null, throwingToString, Symbol("s")])).toContain("publisherName (number), (object), (object), (symbol) can never match")
    expect(publisherNameDnNote("Acme Corp" as any)).toContain('publisherName "Acme Corp" can never match')
  })
})

describe("windowsExecutableCodeSignatureVerifier (unit)", () => {
  // Per-test setup, called from each test body with the test's own `tmpDir` context —
  // no describe-level state, so tests stay independent for parallel execution.
  //
  // The returned makeJson injects the per-test defaultFile so callers don't repeat it
  // everywhere; an explicit filePath in opts still wins (used by the path tests).
  async function setup(tmpDir: TmpDir) {
    vi.clearAllMocks()
    const defaultFile = path.join(await tmpDir.getTempDir(), "test-update-1.0.1.exe")
    const logger = createLogger()
    const makeJson = (opts: SignatureJsonOpts = {}) => makeSignatureJson({ filePath: defaultFile, ...opts })
    return { defaultFile, logger, makeJson }
  }

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  // -- helpers that drive the execFile mock -----------------------------------

  function mockPsSuccess(stdout: string, stderr = ""): void {
    vi.mocked(execFile).mockImplementationOnce((_: any, __: any, ___: any, cb: any) => {
      cb(null, stdout, stderr)
      return {} as any
    })
  }

  function mockPsError(error: Error | null, stderr = ""): void {
    vi.mocked(execFile).mockImplementationOnce((_: any, __: any, ___: any, cb: any) => {
      cb(error, "", stderr)
      return {} as any
    })
  }

  function execError(message: string, properties: Record<string, unknown>): Error {
    return Object.assign(new Error(message), properties)
  }

  // ---------------------------------------------------------------------------
  describe("preparePowerShellExec params", () => {
    test("exe and decoded command match snapshot", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [exe, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const encodedIdx = args.indexOf("-EncodedCommand")
      const script = Buffer.from(args[encodedIdx + 1], "base64").toString("utf16le")
      const normalizedScript = script.replace(defaultFile, "<UPDATE_PATH>")
      expect([exe, [...args.slice(0, encodedIdx), normalizedScript]]).toMatchSnapshot()
    })

    test("shell is false — PowerShell is invoked directly", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, , opts] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[], any, any]
      expect(opts.shell).toBe(false)
    })

    test("PSModulePath is stripped from env even when present in process.env", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      const original = process.env.PSModulePath
      process.env.PSModulePath = "C:\\FakeUserModules"
      try {
        mockPsSuccess(makeJson())
        await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
        const [, , opts] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[], any, any]
        expect(opts.env.PSModulePath).toBeUndefined()
      } finally {
        if (original === undefined) {
          delete process.env.PSModulePath
        } else {
          process.env.PSModulePath = original
        }
      }
    })

    test("other process.env keys are inherited through env", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, , opts] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[], any, any]
      expect(opts.env.PATH).toBe(process.env.PATH)
    })

    test("timeout is 60 seconds", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, , opts] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[], any, any]
      expect(opts.timeout).toBe(60_000)
    })

    test("script ordering: ProgressPreference → Import-Module → PSModulePath clear → encoding → command", async ({ tmpDir }) => {
      // Security/reliability properties:
      // 1. $ProgressPreference = 'SilentlyContinue' must come first so that the Import-Module
      //    progress stream record ("Preparing modules for first use.") is never written to stderr.
      // 2. Import-Module must precede PSModulePath clear so PowerShell can still find the module.
      // 3. All encoding/path setup precedes the user command.
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const script = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      const progressIdx = script.indexOf("$ProgressPreference")
      const importIdx = script.indexOf("Import-Module")
      const clearIdx = script.indexOf(`$env:PSModulePath = ""`)
      const encIdx = script.indexOf("$OutputEncoding")
      const cmdIdx = script.indexOf("Get-AuthenticodeSignature")
      expect(progressIdx).toBe(0)
      expect(progressIdx).toBeLessThan(importIdx)
      expect(importIdx).toBeLessThan(clearIdx)
      expect(clearIdx).toBeLessThan(encIdx)
      expect(encIdx).toBeLessThan(cmdIdx)
    })

    test("encoded command uses UTF-16LE base64 — round-trip decodes correctly", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const encodedIdx = args.indexOf("-EncodedCommand")
      const b64 = args[encodedIdx + 1]
      // Valid base64 — no non-base64 characters
      expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/)
      // Decode back and verify it contains the expected segments
      const decoded = Buffer.from(b64, "base64").toString("utf16le")
      expect(decoded).toContain("Import-Module")
      expect(decoded).toContain("Get-AuthenticodeSignature")
      expect(decoded).toContain("ConvertTo-Json")
    })
  })

  // ---------------------------------------------------------------------------
  describe("publisher name matching", () => {
    test("full DN match returns null", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      const dn = "CN=Acme Corp, O=Acme Corp, L=Austin, S=TX, C=US"
      mockPsSuccess(makeJson({ subject: dn }))
      expectVerificationSuccess(await verifySignature([dn], defaultFile, logger))
    })

    test("a bare name equal to the subject CN fails, and the failure explains the v27 DN requirement", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ subject: "CN=Acme Corp, O=Acme Corp, C=US" }))
      const message = expectVerificationFailure(await verifySignature(["Acme Corp"], defaultFile, logger))
      expect(message).toContain('publisherName "Acme Corp" can never match')
      expect(message).toContain("electron-updater 7 (electron-builder v27)")
      expect(message).toContain('"CN=My Company, O=My Company, C=US"')
      expect(message.endsWith(DN_DOCS)).toBe(true)
    })

    test("a DN with the CN only matches by the CN, without a warning", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ subject: "CN=Acme Corp, O=Acme Corp, C=US" }))
      expectVerificationSuccess(await verifySignature(["CN=Acme Corp"], defaultFile, logger))
      expect(logger.warn).not.toHaveBeenCalled()
    })

    test("a failure with only DNs carries no DN requirement note", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ subject: "CN=Acme Corp, O=Acme Corp, C=US" }))
      const message = expectVerificationFailure(await verifySignature(["CN=Other Corp, O=Other Corp", "CN=Other Corp"], defaultFile, logger))
      expect(message).not.toContain(DN_DOCS)
    })

    test("a Valid signature without a signer certificate subject rejects, without a fail-open probe", async ({ tmpDir }) => {
      const { defaultFile, logger } = await setup(tmpDir)
      mockPsSuccess(JSON.stringify({ SignerCertificate: null, Status: 0, Path: defaultFile }))
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow(TypeError)
      expect(vi.mocked(execFileSync)).not.toHaveBeenCalled()
    })

    test("second publisher in list matches when first does not", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      const dn = "CN=Real Publisher, O=Real, C=DE"
      mockPsSuccess(makeJson({ subject: dn }))
      expectVerificationSuccess(await verifySignature(["Fake Corp", dn], defaultFile, logger))
    })

    test("partial DN (publisherName has fewer keys than cert subject) matches on provided keys only", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ subject: "CN=Acme, O=Acme Corp, L=Denver, C=US" }))
      // Only CN and O in the publisherName spec — L and C are extra in the cert but not required
      expectVerificationSuccess(await verifySignature(["CN=Acme, O=Acme Corp"], defaultFile, logger))
    })

    test("no matching publisher returns non-null error string listing all provided names", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ subject: "CN=Real, O=Real, C=US" }))
      const result = expectVerificationFailure(await verifySignature(["Wrong1", "CN=Wrong2, O=Wrong2, C=US"], defaultFile, logger))
      expect(result).toContain("Wrong1")
      expect(result).toContain("CN=Wrong2")
      // Wrong1 is no DN: only it is named in the v27 note
      expect(result).toContain('publisherName "Wrong1" can never match')
    })

    test("empty publisherNames array always returns non-null error string", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson())
      expectVerificationFailure(await verifySignature([], defaultFile, logger))
    })

    test.for([
      [1, "UnknownError"],
      [2, "NotSigned"],
      [3, "HashMismatch"],
      [4, "NotTrusted"],
      [5, "NotSupportedFileFormat"],
      [6, "Incompatible"],
    ] as const)("status %i (%s) returns a failure regardless of publisher", async ([status], { tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ status }))
      expectVerificationFailure(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger))
    })

    test("DN value comparison is case-sensitive", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      // lower-case "acme corp" in cert, upper-case in publisherName → no match
      mockPsSuccess(makeJson({ subject: "CN=acme corp, O=Acme, C=US" }))
      expectVerificationFailure(await verifySignature(["CN=Acme Corp, O=Acme, C=US"], defaultFile, logger))
    })

    test("extra keys in cert subject beyond what publisherName specifies do not prevent a match", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ subject: "CN=Test, O=Test Org, L=City, C=US" }))
      // Publisher spec only specifies CN and C — L and O in the cert are beyond the spec, ignored
      expectVerificationSuccess(await verifySignature(["CN=Test, C=US"], defaultFile, logger))
    })
  })

  // ---------------------------------------------------------------------------
  describe("signature type", () => {
    test("a Windows security catalog signature is rejected, even when its signer matches", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ signatureType: 2 }))
      const message = expectVerificationFailure(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger))
      expect(message).toContain("Windows security catalog")
    })

    test("an embedded Authenticode signature (1) verifies, as does a PowerShell that reports no SignatureType", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ signatureType: 1 }))
      expectVerificationSuccess(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger))
      // only the catalog-aware Get-AuthenticodeSignature reports it, and it checks embedded signatures only without
      mockPsSuccess(makeJson({ signatureType: null }))
      expectVerificationSuccess(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger))
    })
  })

  // ---------------------------------------------------------------------------
  describe("LiteralPath validation", () => {
    test("matching Path resolves to success", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ filePath: defaultFile }))
      expectVerificationSuccess(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger))
    })

    test("mismatched Path rejects", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ filePath: path.join(path.dirname(defaultFile), "attacker-controlled.exe") }))
      const rejection = await verifySignature([DEFAULT_SUBJECT], defaultFile, logger).catch((e: any) => e)
      expect(rejection.message).toMatch(/LiteralPath/)
      expect(rejection.code).toBe("ERR_UPDATER_SIGNATURE_UNVERIFIABLE")
      // not a PowerShell problem: no hint to replace the verifier
      expect(rejection.message).not.toContain("verifyUpdateFileAuthenticodeSignature")
    })

    test("the drive letter of the reported Path may differ in case: PowerShell rebuilds it from the drive root", async ({ tmpDir }) => {
      const { logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ filePath: "C:\\Users\\pat\\AppData\\Local\\app-updater\\pending\\update.exe" }))
      expectVerificationSuccess(await verifySignature([DEFAULT_SUBJECT], "c:\\Users\\pat\\AppData\\Local\\app-updater\\pending\\update.exe", logger))
    })

    test("absent Path rejects: the verified file cannot be told apart from another one (fail-closed)", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ omitPath: true }))
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow(/did not report the path of the verified file/)
    })
  })

  // ---------------------------------------------------------------------------
  describe("parseOut field stripping", () => {
    test("root-level PrivateKey and IsOSBinary, and SignerCertificate-level Archived, Extensions, Handle, HasPrivateKey, SubjectName do not prevent validation", async ({
      tmpDir,
    }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson({ withStrippableFields: true }))
      expectVerificationSuccess(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger))
    })

    test("null SignerCertificate does not crash (Status non-0 path)", async ({ tmpDir }) => {
      const { defaultFile, logger } = await setup(tmpDir)
      mockPsSuccess(JSON.stringify({ SignerCertificate: null, Status: 1, Path: defaultFile }))
      // Status 1 → not valid → no access to null cert → a failure (no crash)
      expectVerificationFailure(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger))
    })
  })

  // ---------------------------------------------------------------------------
  // An update is installed only when PowerShell positively verifies it: before v27, a failure on old Windows
  // or with a failing "ConvertTo-Json test" probe accepted the update unverified.
  describe("fail-closed error handling", () => {
    const CUSTOM_VERIFIER_HINT = /verifyUpdateFileAuthenticodeSignature/

    test("a PowerShell failure rejects, naming the exit code and stderr; no fallback probe runs", async ({ tmpDir }) => {
      const { defaultFile, logger } = await setup(tmpDir)
      const error = execError("Command failed: powershell.exe ...", { code: 1, killed: false, signal: null })
      mockPsError(error, "Get-AuthenticodeSignature : boom\r\n")
      const rejection = await verifySignature([DEFAULT_SUBJECT], defaultFile, logger).then(
        () => null,
        (e: Error) => e
      )
      expect(rejection?.message).toMatch(/^Cannot verify the Authenticode signature of the update, so it is not installed: /)
      expect(rejection?.message).toContain("Get-AuthenticodeSignature failed with exit code 1: Get-AuthenticodeSignature : boom")
      expect(rejection?.message).toMatch(CUSTOM_VERIFIER_HINT)
      // the original error is kept for diagnostics, and the code tells "cannot verify" apart from an invalid signature
      expect(rejection?.cause).toBe(error)
      expect((rejection as any)?.code).toBe("ERR_UPDATER_SIGNATURE_UNVERIFIABLE")
      expect(vi.mocked(execFileSync)).not.toHaveBeenCalled()
    })

    test("a timeout rejects", async ({ tmpDir }) => {
      const { defaultFile, logger } = await setup(tmpDir)
      mockPsError(execError("Command failed: powershell.exe ...", { code: null, killed: true, signal: "SIGTERM" }))
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow("Get-AuthenticodeSignature did not finish within 60s")
    })

    test("PowerShell that cannot be started rejects", async ({ tmpDir }) => {
      const { defaultFile, logger } = await setup(tmpDir)
      mockPsError(execError(`spawn ${POWERSHELL} ENOENT`, { code: "ENOENT" }))
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow(`cannot run PowerShell: spawn ${POWERSHELL} ENOENT`)
    })

    test("a spawn that throws synchronously (e.g. powershell.exe blocked by AppLocker) rejects", async ({ tmpDir }) => {
      const { defaultFile, logger } = await setup(tmpDir)
      vi.mocked(execFile).mockImplementationOnce(() => {
        throw execError("spawn UNKNOWN", { code: "UNKNOWN" })
      })
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow("cannot run PowerShell: spawn UNKNOWN")
    })

    test("output over the buffer limit rejects", async ({ tmpDir }) => {
      const { defaultFile, logger } = await setup(tmpDir)
      mockPsError(execError("stdout maxBuffer length exceeded", { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }))
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow("printed more output than a signature has")
    })

    test("anything on stderr rejects, even next to output that looks like a valid signature", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson(), "Access denied to certificate store")
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow("Get-AuthenticodeSignature wrote to stderr: Access denied to certificate store")
    })

    test("both error and stderr set: rejects exactly once, with the error", async ({ tmpDir }) => {
      const { defaultFile, logger } = await setup(tmpDir)
      mockPsError(execError("the original PS error", { code: 1 }), "some stderr text too")
      const rejected: Array<Error> = []
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger).catch((e: Error) => rejected.push(e))
      expect(rejected).toHaveLength(1)
      expect(rejected[0].message).toContain("exit code 1: some stderr text too")
    })

    test.for([
      ["malformed JSON", "this is { not valid json {{"],
      ["empty stdout", ""],
      ["null", "null"],
    ])("output that cannot be parsed rejects (%s)", async ([, stdout], { tmpDir }) => {
      const { defaultFile, logger } = await setup(tmpDir)
      mockPsSuccess(stdout)
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow("cannot parse the output of Get-AuthenticodeSignature")
    })
  })

  // ---------------------------------------------------------------------------
  describe("path injection prevention", () => {
    test("single quote in path is doubled in the PowerShell -LiteralPath argument", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      const pathWithQuote = path.join(path.dirname(defaultFile), "it's-an-update.exe")
      mockPsSuccess(makeJson({ filePath: pathWithQuote }))
      await verifySignature([DEFAULT_SUBJECT], pathWithQuote, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain("it''s-an-update.exe")
    })

    test("multiple single quotes in path are all escaped", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      const multiQuotePath = path.join(path.dirname(defaultFile), "it's-really-it's.exe")
      mockPsSuccess(makeJson({ filePath: multiQuotePath }))
      await verifySignature([DEFAULT_SUBJECT], multiQuotePath, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain("it''s-really-it''s.exe")
    })

    test("typographic apostrophe (U+2019) in path is doubled (PS treats smart quotes as string delimiters)", async ({ tmpDir }) => {
      // https://github.com/electron-userland/electron-builder/pull/9764#issuecomment-5435910678
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      const smartQuotePath = path.join(path.dirname(defaultFile), "D’Andre-update.exe")
      mockPsSuccess(makeJson({ filePath: smartQuotePath }))
      await verifySignature([DEFAULT_SUBJECT], smartQuotePath, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain("D’’Andre-update.exe")
    })

    test("all Unicode single-quote variants (U+2018-U+201B) are doubled", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      const trickyPath = path.join(path.dirname(defaultFile), "‘a’b‚c‛d.exe")
      mockPsSuccess(makeJson({ filePath: trickyPath }))
      await verifySignature([DEFAULT_SUBJECT], trickyPath, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain("‘‘a’’b‚‚c‛‛d.exe")
    })

    test("path without special characters is passed through unchanged inside single quotes", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain(`-LiteralPath '${defaultFile}'`)
    })

    test("-LiteralPath value is enclosed in single quotes", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toMatch(/-LiteralPath '.*'/)
    })

    test("dollar sign in path is passed verbatim (not interpolated — single-quoted PS string)", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      const dollarPath = path.join(path.dirname(defaultFile), "$important-update.exe")
      mockPsSuccess(makeJson({ filePath: dollarPath }))
      await verifySignature([DEFAULT_SUBJECT], dollarPath, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain("$important-update.exe")
    })

    test("backtick in path is passed verbatim (not treated as PS escape char — single-quoted PS string)", async ({ tmpDir }) => {
      const { defaultFile, logger, makeJson } = await setup(tmpDir)
      const backtickPath = path.join(path.dirname(defaultFile), "`update.exe")
      mockPsSuccess(makeJson({ filePath: backtickPath }))
      await verifySignature([DEFAULT_SUBJECT], backtickPath, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain("`update.exe")
    })
  })
})

// =============================================================================
// E2e tests — Windows only, real PowerShell
//
// These tests call verifySignature with the real child_process functions restored
// from vi.importActual. They validate the full spawn → UTF-8 decode → JSON parse →
// DN match chain, including the encoding and path-escaping fixes.
// =============================================================================

describe.ifWindows("windowsExecutableCodeSignatureVerifier (e2e, real PowerShell)", () => {
  // Per-test setup, called from each test body — restores the real child_process
  // implementations behind the vi.mock stubs and creates a fresh logger. No
  // describe-level state, so tests stay independent for parallel execution.
  // vi.importActual results are cached by the module registry, so calling it in
  // every test is cheap after the first call.
  async function setup() {
    vi.clearAllMocks()
    const realCp = await vi.importActual<typeof import("child_process")>("child_process")
    vi.mocked(execFile).mockImplementation(realCp.execFile)
    vi.mocked(execFileSync).mockImplementation(realCp.execFileSync)
    return { logger: createLogger() }
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  async function createUnsignedExe(tmpDir: TmpDir, name = "unsigned.exe"): Promise<string> {
    // createTempDir (not getTempDir) — getTempDir only reserves a path without creating the directory.
    const dir = await tmpDir.createTempDir()
    const p = path.join(dir, name)
    // Minimal fake MZ header — enough to produce a path, not enough to be a valid PE signature.
    await fs.writeFile(p, Buffer.from("MZ" + "0".repeat(60)))
    return p
  }

  async function unsignedFileIn(tmpDir: TmpDir, directoryName: string): Promise<string> {
    const dir = path.join(await tmpDir.getTempDir(), directoryName)
    await fs.mkdir(dir, { recursive: true })
    const p = path.join(dir, "update.exe")
    await fs.writeFile(p, Buffer.from("not a PE"))
    return p
  }

  // The verifier waits up to 60s for PowerShell: a test timeout above that reports a verifier error, not a vitest timeout.
  const UNSIGNED_TIMEOUT = 90_000

  test("unsigned file returns a failure", { timeout: UNSIGNED_TIMEOUT }, async ({ tmpDir }) => {
    const { logger } = await setup()
    const p = await createUnsignedExe(tmpDir)
    expectVerificationFailure(await verifySignature(["CN=Any Publisher"], p, logger))
  })

  // Each of these paths broke an earlier invocation (run through cmd.exe, or quoted into the command): the unsigned file must
  // verify as unsigned instead of crashing or rejecting.
  test.for([
    ["spaces", "path with spaces"],
    ["a single quote", "it's a test"],
    ["a typographic apostrophe (U+2019, a PowerShell quote character)", "D’Andre"],
    ["non-ASCII characters (issue #8162)", "üñícodé-path"],
    ["& (cmd.exe)", "AT&T Updates"],
    ["%VAR% (cmd.exe)", "%USERNAME% Updates"],
    ["$", "$Updates"],
    ["a backtick", "`Updates"],
  ])("unsigned file in a directory with %s returns a failure", { timeout: UNSIGNED_TIMEOUT }, async ([, directoryName], { tmpDir }) => {
    const { logger } = await setup()
    expectVerificationFailure(await verifySignature(["CN=Any Publisher"], await unsignedFileIn(tmpDir, directoryName), logger))
  })

  // -------------------------------------------------------------------------
  // Tests against a copy of a real system PE signed with an ephemeral
  // self-signed certificate installed into Cert:\LocalMachine\Root.
  //
  // Unlike the previously used notepad.exe, the certificate subject is fully
  // deterministic (CN=Electron Builder Verifier Test, O=EB Test Org, C=US), so
  // these tests exercise the DN matching semantics with known values, and they
  // produce REAL verification positives (Status 0/Valid) through the whole
  // PowerShell pipeline — spawn, escaping, UTF-8 decode, JSON parse, DN match.
  //
  // Fixture provisioning (cert generation + machine-global store install) is a
  // lazily initialized module-level idempotent promise in windowsSignedFixture.ts;
  // each test signs its own executable copy inside its own per-test tmpDir and
  // uses its own setup() logger — no describe-level mutable state is fed by hooks.
  // Every test skips dynamically when provisioning failed (e.g. not elevated).
  // -------------------------------------------------------------------------
  describe("really-signed executable (self-signed certificate in LocalMachine Root)", () => {
    afterAll(() => cleanupWindowsSignedFixture())

    async function signedExecutable(context: TestContext, directoryName?: string) {
      const fixture = await getWindowsSignedFixture()
      if (fixture == null) {
        context.skip()
        throw new Error("unreachable: context.skip() throws")
      }
      let dir = await context.tmpDir.createTempDir()
      if (directoryName != null) {
        dir = path.join(dir, directoryName)
        await fs.mkdir(dir, { recursive: true })
      }
      return { fixture, exe: await createSignedExecutable(fixture, dir) }
    }

    test("full DN publisher match (subject as reported by PowerShell) succeeds", { timeout: 120_000 }, async (context: TestContext) => {
      const { logger } = await setup()
      const { fixture, exe } = await signedExecutable(context)
      expectVerificationSuccess(await verifySignature([fixture.subject], exe, logger))
    })

    test("full DN match is RDN-order-insensitive (parseDn compares per key)", { timeout: 120_000 }, async (context: TestContext) => {
      const { logger } = await setup()
      const { fixture, exe } = await signedExecutable(context)
      // .NET may render the subject RDNs in a different order than requested from OpenSSL;
      // matching is per-key, so the canonical requested order must match either way.
      expectVerificationSuccess(await verifySignature([`CN=${fixture.commonName}, O=EB Test Org, C=US`], exe, logger))
    })

    test("a bare name does not match the really-signed executable, a CN-only DN does (electron-updater 7)", { timeout: 120_000 }, async (context: TestContext) => {
      const { logger } = await setup()
      const { fixture, exe } = await signedExecutable(context)
      const result = expectVerificationFailure(await verifySignature([fixture.commonName], exe, logger))
      expect(result).toContain("electron-updater 7 (electron-builder v27)")
      expect(result).toContain(DN_DOCS)
      expectVerificationSuccess(await verifySignature([`CN=${fixture.commonName}`], exe, logger))
    })

    test("partial DN (subset of the subject's keys) matches when all provided keys agree", { timeout: 120_000 }, async (context: TestContext) => {
      const { logger } = await setup()
      const { fixture, exe } = await signedExecutable(context)
      // C=US is present in the certificate subject but omitted here — extra subject keys
      // beyond the publisherName spec do not prevent a match.
      expectVerificationSuccess(await verifySignature([`CN=${fixture.commonName}, O=EB Test Org`], exe, logger))
    })

    test("wrong publisher returns a failure naming the mismatch", { timeout: 120_000 }, async (context: TestContext) => {
      const { logger } = await setup()
      const { exe } = await signedExecutable(context)
      const result = expectVerificationFailure(await verifySignature(["CN=Definitely Not The Publisher, O=Evil Org, C=US"], exe, logger))
      expect(result).toContain("Definitely Not The Publisher")
    })

    // The unsigned-file path tests above only prove "no crash"; these prove a genuine Valid + LiteralPath + DN-match positive.
    test.for([["a smart quote and spaces", "D’Andre’s signed updates"]])(
      "signed exe inside a directory with %s verifies",
      { timeout: 120_000 },
      async ([, directoryName], context: TestContext) => {
        const { logger } = await setup()
        const { fixture, exe } = await signedExecutable(context, directoryName)
        expectVerificationSuccess(await verifySignature([fixture.subject], exe, logger))
      }
    )

    test("symlink to a validly-signed exe never yields a publisher mismatch — LiteralPath guard or genuine pass", { timeout: 120_000 }, async (context: TestContext) => {
      const { logger } = await setup()
      const { fixture, exe } = await signedExecutable(context)
      const symlinkPath = path.join(path.dirname(exe), "symlink.exe")
      try {
        await fs.symlink(exe, symlinkPath)
      } catch {
        context.skip() // symlink creation can require extra privileges on Windows
        return
      }

      let result: VerifyUpdateFileResult
      try {
        result = await verifySignature([fixture.subject], symlinkPath, logger)
      } catch (error) {
        // PowerShell reported the resolved target path — the LiteralPath guard must be the rejection reason.
        expect(String(error)).toMatch(/LiteralPath/)
        return
      }
      // PowerShell echoed the symlink's own literal path: the guard sees a match and the signature
      // genuinely covers the bytes behind the link, so this is a pass, not a bypass. Anything else
      // (publisher mismatch, invalid status) would surface here as a failure.
      expectVerificationSuccess(result)
    })

    test("tampered signed exe (appended bytes) returns a failure", { timeout: 120_000 }, async (context: TestContext) => {
      const { logger } = await setup()
      const { fixture, exe } = await signedExecutable(context)
      // Sanity: the untouched copy verifies, so a failure below is caused by the tampering alone.
      expectVerificationSuccess(await verifySignature([fixture.subject], exe, createLogger()))
      await fs.appendFile(exe, Buffer.from("tampered"))
      // Appended bytes break the Authenticode hash → Status HashMismatch → a failure naming the mismatch.
      const result = expectVerificationFailure(await verifySignature([fixture.subject], exe, logger))
      // the reason carries the requested publisher and the raw Get-AuthenticodeSignature payload, so the app can log why
      expect(result).toContain(fixture.subject)
      expect(result).toContain("raw info:")
    })

    test("signed exe whose signature was stripped (certificate table entry zeroed) is NotSigned and rejected", { timeout: 120_000 }, async (context: TestContext) => {
      const { logger } = await setup()
      const { fixture, exe } = await signedExecutable(context)
      const bytes = await fs.readFile(exe)
      // IMAGE_DIRECTORY_ENTRY_SECURITY (index 4) of the optional header's data directories (PE32: offset 96, PE32+: 112)
      const optionalHeader = bytes.readUInt32LE(0x3c) + 24
      const certificateTableEntry = optionalHeader + (bytes.readUInt16LE(optionalHeader) === 0x20b ? 112 : 96) + 4 * 8
      bytes.fill(0, certificateTableEntry, certificateTableEntry + 8)
      await fs.writeFile(exe, bytes)
      const result = expectVerificationFailure(await verifySignature([fixture.subject], exe, logger))
      expect(rawInfoOf(result).Status).toBe(2)
    })
  })

  // An in-box Windows binary is signed through a Windows security catalog: a byte-identical copy of cmd.exe is reported with the
  // catalog signer and SignatureType Catalog, so it is rejected even for its own signer (it could never be our update installer).
  test("a catalog-signed Windows file is rejected even for the publisher Windows reports for it", { timeout: UNSIGNED_TIMEOUT }, async (context: TestContext) => {
    const { logger } = await setup()
    const copy = path.join(await context.tmpDir.createTempDir(), "cmd.exe")
    await fs.copyFile(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"), copy)
    const info = rawInfoOf(expectVerificationFailure(await verifySignature(["CN=Not Microsoft"], copy, logger)))
    if (info.Status !== 0 || info.SignatureType !== 2) {
      // this runner reports cmd.exe with its embedded signature
      context.skip()
      return
    }
    const message = expectVerificationFailure(await verifySignature([info.SignerCertificate.Subject], copy, logger))
    expect(message).toContain("Windows security catalog")
  })

  // -------------------------------------------------------------------------
  test("symlink to a different file: LiteralPath mismatch prevents a silent pass", { timeout: UNSIGNED_TIMEOUT }, async (context: TestContext) => {
    const { logger } = await setup()
    const realFile = await createUnsignedExe(context.tmpDir, "real.exe")
    const symlinkPath = path.join(path.dirname(realFile), "symlink.exe")
    try {
      await fs.symlink(realFile, symlinkPath)
    } catch {
      // Symlinks may require elevated privileges on Windows
      context.skip()
      return
    }

    // When PowerShell resolves the symlink, data.Path === realFile ≠ symlinkPath.
    // Either the promise rejects (LiteralPath mismatch) or returns a failure.
    let result: VerifyUpdateFileResult | null = null
    try {
      result = await verifySignature(["CN=Any Publisher"], symlinkPath, logger)
    } catch {
      return // Rejection is the expected security behavior — verification did NOT silently pass
    }
    expectVerificationFailure(result)
  })
})
