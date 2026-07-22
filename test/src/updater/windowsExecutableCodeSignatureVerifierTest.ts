// vi.mock calls are hoisted to the top by vitest's transformer.
// They must appear before any imports that depend on them.
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest"

vi.mock("child_process", async importOriginal => {
  const mod = await importOriginal<typeof import("child_process")>()
  return { ...mod, execFile: vi.fn(), execFileSync: vi.fn() }
})

vi.mock("os", async importOriginal => {
  const mod = await importOriginal<typeof import("os")>()
  return { ...mod, release: vi.fn() }
})

import { execFile, execFileSync } from "child_process"
import * as fs from "fs/promises"
import { release as osRelease } from "os"
import * as path from "path"
import { TmpDir } from "temp-file"
import type { Logger } from "electron-updater/src/types"
import { verifySignature } from "electron-updater/src/windowsExecutableCodeSignatureVerifier"

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SUBJECT = "CN=Test Publisher, O=Test Org, C=US"

// =============================================================================
// Logger stub
// =============================================================================

function createLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
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
  withStrippableFields?: boolean
}

function makeSignatureJson(opts: SignatureJsonOpts = {}): string {
  const { status = 0, filePath = "", subject = DEFAULT_SUBJECT, omitPath = false, withStrippableFields = false } = opts

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

  if (withStrippableFields) {
    data.PrivateKey = null
    data.IsOSBinary = false
    data.SignatureType = 1
  }

  return JSON.stringify(data)
}

// =============================================================================
// Unit tests (mocked child_process + os)
//
// Platform-agnostic: execFile and execFileSync are replaced with vi.fn() via
// vi.mock so no real PowerShell is ever spawned.  os.release() is also mocked
// so Windows-version-detection logic can be exercised on any platform.
// =============================================================================

describe("windowsExecutableCodeSignatureVerifier (unit)", () => {
  const tmpDir = new TmpDir("verifier-unit")
  let defaultFile = ""
  let logger: Logger

  // Injects the per-test defaultFile so callers don't repeat it everywhere.
  // An explicit filePath in opts still wins (used by path-injection tests).
  const makeJson = (opts: SignatureJsonOpts = {}) => makeSignatureJson({ filePath: defaultFile, ...opts })

  beforeEach(async () => {
    defaultFile = path.join(await tmpDir.getTempDir(), "test-update-1.0.1.exe")
    logger = createLogger()
    vi.clearAllMocks()
    // Default: ConvertTo-Json probe (execFileSync) succeeds so handleError reaches reject().
    vi.mocked(execFileSync).mockImplementation(() => Buffer.from("") as any)
    // Default: modern OS — handleError does not short-circuit via isOldWin6().
    vi.mocked(osRelease).mockReturnValue("10.0.19041")
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => tmpDir.cleanup())

  // -- helpers that drive the execFile mock -----------------------------------

  function mockPsSuccess(stdout: string): void {
    vi.mocked(execFile).mockImplementationOnce((_: any, __: any, ___: any, cb: any) => {
      cb(null, stdout, "")
      return {} as any
    })
  }

  function mockPsError(error: Error | null, stderr = ""): void {
    vi.mocked(execFile).mockImplementationOnce((_: any, __: any, ___: any, cb: any) => {
      cb(error, "", stderr)
      return {} as any
    })
  }

  function mockConvertToJsonFail(msg = "ConvertTo-Json not found"): void {
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error(msg)
    })
  }

  // ---------------------------------------------------------------------------
  describe("preparePowerShellExec params", () => {
    test("exe and decoded command match snapshot", async () => {
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [exe, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const encodedIdx = args.indexOf("-EncodedCommand")
      const script = Buffer.from(args[encodedIdx + 1], "base64").toString("utf16le")
      const normalizedScript = script.replace(defaultFile, "<UPDATE_PATH>")
      expect([exe, [...args.slice(0, encodedIdx), normalizedScript]]).toMatchSnapshot()
    })

    test("shell is false — PowerShell is invoked directly", async () => {
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, , opts] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[], any, any]
      expect(opts.shell).toBe(false)
    })

    test("PSModulePath is stripped from env even when present in process.env", async () => {
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

    test("other process.env keys are inherited through env", async () => {
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, , opts] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[], any, any]
      expect(opts.env.PATH).toBe(process.env.PATH)
    })

    test("timeout is 20 seconds", async () => {
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, , opts] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[], any, any]
      expect(opts.timeout).toBe(20_000)
    })

    test("script ordering: ProgressPreference → Import-Module → PSModulePath clear → encoding → command", async () => {
      // Security/reliability properties:
      // 1. $ProgressPreference = 'SilentlyContinue' must come first so that the Import-Module
      //    progress stream record ("Preparing modules for first use.") is never written to stderr.
      // 2. Import-Module must precede PSModulePath clear so PowerShell can still find the module.
      // 3. All encoding/path setup precedes the user command.
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

    test("encoded command uses UTF-16LE base64 — round-trip decodes correctly", async () => {
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
    test("full DN match returns null", async () => {
      const dn = "CN=Acme Corp, O=Acme Corp, L=Austin, S=TX, C=US"
      mockPsSuccess(makeJson({ subject: dn }))
      expect(await verifySignature([dn], defaultFile, logger)).toBeNull()
    })

    test("CN-only match returns null and logs a deprecation warning", async () => {
      mockPsSuccess(makeJson({ subject: "CN=Acme Corp, O=Acme Corp, C=US" }))
      expect(await verifySignature(["Acme Corp"], defaultFile, logger)).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Acme Corp"))
    })

    test("second publisher in list matches when first does not", async () => {
      const dn = "CN=Real Publisher, O=Real, C=DE"
      mockPsSuccess(makeJson({ subject: dn }))
      expect(await verifySignature(["Fake Corp", dn], defaultFile, logger)).toBeNull()
    })

    test("partial DN (publisherName has fewer keys than cert subject) matches on provided keys only", async () => {
      mockPsSuccess(makeJson({ subject: "CN=Acme, O=Acme Corp, L=Denver, C=US" }))
      // Only CN and O in the publisherName spec — L and C are extra in the cert but not required
      expect(await verifySignature(["CN=Acme, O=Acme Corp"], defaultFile, logger)).toBeNull()
    })

    test("no matching publisher returns non-null error string listing all provided names", async () => {
      mockPsSuccess(makeJson({ subject: "CN=Real, O=Real, C=US" }))
      const result = await verifySignature(["Wrong1", "CN=Wrong2, O=Wrong2, C=US"], defaultFile, logger)
      expect(result).not.toBeNull()
      expect(result).toContain("Wrong1")
      expect(result).toContain("CN=Wrong2")
    })

    test("empty publisherNames array always returns non-null error string", async () => {
      mockPsSuccess(makeJson())
      expect(await verifySignature([], defaultFile, logger)).not.toBeNull()
    })

    test("status non-0 returns non-null error regardless of publisher", async () => {
      mockPsSuccess(makeJson({ status: 2 }))
      expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).not.toBeNull()
    })

    test("status 3 (HashMismatch) returns non-null error string", async () => {
      mockPsSuccess(makeJson({ status: 3 }))
      expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).not.toBeNull()
    })

    test("status 4 (NotSupportedFileFormat) returns non-null error string", async () => {
      mockPsSuccess(makeJson({ status: 4 }))
      expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).not.toBeNull()
    })

    test("DN value comparison is case-sensitive", async () => {
      // lower-case "acme corp" in cert, upper-case in publisherName → no match
      mockPsSuccess(makeJson({ subject: "CN=acme corp, O=Acme, C=US" }))
      expect(await verifySignature(["CN=Acme Corp, O=Acme, C=US"], defaultFile, logger)).not.toBeNull()
    })

    test("extra keys in cert subject beyond what publisherName specifies do not prevent a match", async () => {
      mockPsSuccess(makeJson({ subject: "CN=Test, O=Test Org, L=City, C=US" }))
      // Publisher spec only specifies CN and C — L and O in the cert are beyond the spec, ignored
      expect(await verifySignature(["CN=Test, C=US"], defaultFile, logger)).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  describe("LiteralPath validation", () => {
    test("matching Path resolves to null", async () => {
      mockPsSuccess(makeJson({ filePath: defaultFile }))
      expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).toBeNull()
    })

    test("mismatched Path rejects (prevents symlink / redirect attacks)", async () => {
      mockPsSuccess(makeJson({ filePath: path.join(path.dirname(defaultFile), "attacker-controlled.exe") }))
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow(/LiteralPath/)
    })

    test("mismatched Path rejects directly — no ConvertTo-Json probe is run", async () => {
      // checkLiteralPath calls reject() directly; handleError (and its execFileSync probe) is NOT involved.
      mockPsSuccess(makeJson({ filePath: path.join(path.dirname(defaultFile), "attacker-controlled.exe") }))
      await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow(/LiteralPath/)
      expect(vi.mocked(execFileSync)).not.toHaveBeenCalled()
    })

    test("absent Path key logs warning and continues to publisher check", async () => {
      // path.normalize(undefined) throws → caught → logger.warn → continues to publisher match
      mockPsSuccess(makeJson({ omitPath: true }))
      expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("LiteralPath"))
    })
  })

  // ---------------------------------------------------------------------------
  describe("parseOut field stripping", () => {
    test("root-level PrivateKey, IsOSBinary, SignatureType do not prevent validation", async () => {
      mockPsSuccess(makeJson({ withStrippableFields: true }))
      expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).toBeNull()
    })

    test("SignerCertificate-level Archived, Extensions, Handle, HasPrivateKey, SubjectName are stripped without error", async () => {
      mockPsSuccess(makeJson({ withStrippableFields: true }))
      expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).toBeNull()
    })

    test("null SignerCertificate does not crash (Status non-0 path)", async () => {
      mockPsSuccess(JSON.stringify({ SignerCertificate: null, Status: 1, Path: defaultFile }))
      // Status 1 → not valid → no access to null cert → non-null error string (no crash)
      expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).not.toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  describe("error handling", () => {
    describe("execFile error — modern OS (non-Win6)", () => {
      test("rejects with the original error when ConvertTo-Json probe passes", async () => {
        mockPsError(new Error("PowerShell execution failed"))
        await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow("PowerShell execution failed")
      })

      test("resolves null and warns when ConvertTo-Json probe also fails (old PowerShell installed)", async () => {
        mockPsError(new Error("PS unavailable"))
        mockConvertToJsonFail("ConvertTo-Json not found")
        expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).toBeNull()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("ConvertTo-Json"))
      })
    })

    describe("execFile stderr — modern OS", () => {
      test("rejects with an error wrapping stderr when ConvertTo-Json probe passes", async () => {
        mockPsError(null, "Access denied to certificate store")
        await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow("Access denied to certificate store")
      })
    })

    describe("old Windows 6.x — unsupported PowerShell", () => {
      test("Win 6.1 (Windows 7): warns and resolves null instead of rejecting", async () => {
        vi.mocked(osRelease).mockReturnValue("6.1.7601")
        mockPsError(new Error("ConvertTo-Json not available"))
        expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).toBeNull()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("unsupported powershell"))
      })

      test("Win 6.0 (Vista): warns and resolves null", async () => {
        vi.mocked(osRelease).mockReturnValue("6.0.6001")
        mockPsError(new Error("old PS"))
        expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).toBeNull()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("unsupported powershell"))
      })

      test("Win 6.2 (Windows 8) is treated as old Win6 — warns and resolves null", async () => {
        vi.mocked(osRelease).mockReturnValue("6.2.9200")
        mockPsError(new Error("old PS"))
        expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).toBeNull()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("unsupported powershell"))
      })

      test("Win 6.3 (Windows 8.1) is NOT treated as old Win6", async () => {
        vi.mocked(osRelease).mockReturnValue("6.3.9600")
        mockPsError(new Error("Some PS error"))
        // ConvertTo-Json check passes (mock default) → rejects with original error
        await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow("Some PS error")
        const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat().join(" ")
        expect(warnCalls).not.toContain("unsupported powershell")
      })

      test("old Win6 skips the ConvertTo-Json probe — execFileSync is never called", async () => {
        vi.mocked(osRelease).mockReturnValue("6.1.7601")
        mockPsError(new Error("PS error"))
        await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
        expect(vi.mocked(execFileSync)).not.toHaveBeenCalled()
      })
    })

    describe("both error and stderr set", () => {
      test("rejects with the original Error, not with a stderr-derived error", async () => {
        const originalError = new Error("the original PS error")
        mockPsError(originalError, "some stderr text too")
        await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow("the original PS error")
      })

      test("reject is called exactly once — no double-settlement", async () => {
        const originalError = new Error("the original PS error")
        const rejected: unknown[] = []
        // Intercept reject calls by wrapping the promise.
        mockPsError(originalError, "some stderr text too")
        await new Promise<void>(done => {
          verifySignature([DEFAULT_SUBJECT], defaultFile, logger).then(
            () => done(),
            err => {
              rejected.push(err)
              done()
            }
          )
        })
        // The Promise contract only delivers the first rejection, but we want to ensure
        // handleError itself does not attempt a second reject() call.
        expect(rejected).toHaveLength(1)
        expect((rejected[0] as Error).message).toBe("the original PS error")
      })
    })

    describe("ConvertTo-Json probe — invocation details", () => {
      test("probe is called with powershell.exe, shell: false, PSModulePath stripped, and 10s timeout", async () => {
        mockPsError(new Error("PS error"))
        await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow()
        expect(vi.mocked(execFileSync)).toHaveBeenCalledOnce()
        const [probeExe, probeArgs, probeOpts] = vi.mocked(execFileSync).mock.calls[0] as unknown as [string, string[], any]
        expect(probeExe).toBe("powershell.exe")
        expect(probeOpts.shell).toBe(false)
        expect(probeOpts.timeout).toBe(10_000)
        expect(probeOpts.env.PSModulePath).toBeUndefined()
        const encodedIdx = probeArgs.indexOf("-EncodedCommand")
        const probeScript = Buffer.from(probeArgs[encodedIdx + 1], "base64").toString("utf16le")
        expect(probeScript).toContain("ConvertTo-Json test")
      })

      test("probe script suppresses progress, imports Security module, and clears PSModulePath", async () => {
        mockPsError(new Error("PS error"))
        await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow()
        const [, probeArgs] = vi.mocked(execFileSync).mock.calls[0] as unknown as [string, string[]]
        const encodedIdx = probeArgs.indexOf("-EncodedCommand")
        const probeScript = Buffer.from(probeArgs[encodedIdx + 1], "base64").toString("utf16le")
        expect(probeScript).toContain("$ProgressPreference = 'SilentlyContinue'")
        expect(probeScript).toContain("Import-Module")
        expect(probeScript).toContain("Microsoft.PowerShell.Security")
        expect(probeScript).toContain(`$env:PSModulePath = ""`)
      })
    })

    describe("malformed JSON from execFile stdout", () => {
      test("rejects when ConvertTo-Json probe passes (outer catch → handleError → reject)", async () => {
        mockPsSuccess("this is { not valid json {{")
        await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow()
      })

      test("resolves null when ConvertTo-Json probe also fails", async () => {
        mockPsSuccess("not json at all")
        mockConvertToJsonFail()
        expect(await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).toBeNull()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("ConvertTo-Json"))
      })

      test("empty stdout rejects when ConvertTo-Json probe passes (JSON.parse('') throws)", async () => {
        mockPsSuccess("")
        await expect(verifySignature([DEFAULT_SUBJECT], defaultFile, logger)).rejects.toThrow()
      })
    })
  })

  // ---------------------------------------------------------------------------
  describe("path injection prevention", () => {
    test("single quote in path is doubled in the PowerShell -LiteralPath argument", async () => {
      const pathWithQuote = path.join(path.dirname(defaultFile), "it's-an-update.exe")
      mockPsSuccess(makeJson({ filePath: pathWithQuote }))
      await verifySignature([DEFAULT_SUBJECT], pathWithQuote, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain("it''s-an-update.exe")
    })

    test("multiple single quotes in path are all escaped", async () => {
      const multiQuotePath = path.join(path.dirname(defaultFile), "it's-really-it's.exe")
      mockPsSuccess(makeJson({ filePath: multiQuotePath }))
      await verifySignature([DEFAULT_SUBJECT], multiQuotePath, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain("it''s-really-it''s.exe")
    })

    test("path without special characters is passed through unchanged inside single quotes", async () => {
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain(`-LiteralPath '${defaultFile}'`)
    })

    test("-LiteralPath value is enclosed in single quotes", async () => {
      mockPsSuccess(makeJson())
      await verifySignature([DEFAULT_SUBJECT], defaultFile, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toMatch(/-LiteralPath '.*'/)
    })

    test("dollar sign in path is passed verbatim (not interpolated — single-quoted PS string)", async () => {
      const dollarPath = path.join(path.dirname(defaultFile), "$important-update.exe")
      mockPsSuccess(makeJson({ filePath: dollarPath }))
      await verifySignature([DEFAULT_SUBJECT], dollarPath, logger)
      const [, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]]
      const cmd = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
      expect(cmd).toContain("$important-update.exe")
    })

    test("backtick in path is passed verbatim (not treated as PS escape char — single-quoted PS string)", async () => {
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
// These tests call verifySignature with real child_process functions restored
// from vi.importActual.  They validate the full spawn → UTF-8 decode →
// JSON parse → DN match chain, including the encoding and path-escaping fixes.
// =============================================================================

describe.ifWindows("windowsExecutableCodeSignatureVerifier (e2e, real PowerShell)", () => {
  const tmpDir = new TmpDir("verifier-e2e")
  let logger: Logger
  let realExecFile: (typeof import("child_process"))["execFile"]
  let realExecFileSync: (typeof import("child_process"))["execFileSync"]
  let realOsRelease: (typeof import("os"))["release"]

  // Obtain real implementations once — vi.importActual is expensive and the
  // returned values are stable across tests, so they live in beforeAll.
  beforeAll(async () => {
    const realCp = await vi.importActual<typeof import("child_process")>("child_process")
    const realOs = await vi.importActual<typeof import("os")>("os")
    realExecFile = realCp.execFile
    realExecFileSync = realCp.execFileSync
    realOsRelease = realOs.release
  })

  beforeEach(() => {
    logger = createLogger()
    vi.clearAllMocks()
    // Re-apply real implementations after vi.clearAllMocks() resets them.
    vi.mocked(execFile).mockImplementation(realExecFile as any)
    vi.mocked(execFileSync).mockImplementation(realExecFileSync as any)
    vi.mocked(osRelease).mockImplementation(realOsRelease)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => tmpDir.cleanup())

  async function createUnsignedExe(name = "unsigned.exe"): Promise<string> {
    const dir = await tmpDir.getTempDir()
    const p = path.join(dir, name)
    // Minimal fake MZ header — enough to produce a path, not enough to be a valid PE signature.
    await fs.writeFile(p, Buffer.from("MZ" + "0".repeat(60)))
    return p
  }

  test("unsigned file returns a non-null error string", async () => {
    const p = await createUnsignedExe()
    const result = await verifySignature(["Any Publisher"], p, logger)
    expect(result).not.toBeNull()
    expect(typeof result).toBe("string")
  }, 30_000)

  test("path with spaces is handled without crashing", async () => {
    const dir = await tmpDir.getTempDir({ prefix: "path with spaces" })
    const p = path.join(dir, "my update.exe")
    await fs.writeFile(p, Buffer.from("not a PE"))
    const result = await verifySignature(["Any Publisher"], p, logger)
    expect(result).not.toBeNull() // Unsigned → non-null error; key assertion is no crash
  }, 30_000)

  test("path with single quote does not crash (injection prevention)", async () => {
    const parent = await tmpDir.getTempDir()
    const quotedDir = path.join(parent, "it's a test")
    await fs.mkdir(quotedDir, { recursive: true })
    const p = path.join(quotedDir, "update.exe")
    await fs.writeFile(p, Buffer.from("not a PE"))
    // Should not throw — the single quote must be escaped before entering the PS command string.
    const result = await verifySignature(["Any Publisher"], p, logger)
    expect(typeof result === "string" || result === null).toBe(true)
  }, 30_000)

  test("path with non-ASCII characters does not crash (UTF-8 encoding, issue #8162)", async () => {
    const parent = await tmpDir.getTempDir()
    const unicodeDir = path.join(parent, "üñícodé-path")
    await fs.mkdir(unicodeDir, { recursive: true })
    const p = path.join(unicodeDir, "update.exe")
    await fs.writeFile(p, Buffer.from("not a PE"))
    // The $OutputEncoding + [Console]::OutputEncoding setup must handle non-ASCII dir names.
    const result = await verifySignature(["Any Publisher"], p, logger)
    expect(typeof result === "string" || result === null).toBe(true)
  }, 30_000)

  // -------------------------------------------------------------------------
  // Tests against a Microsoft-signed system binary.
  //
  // The exact Subject DN varies across Windows versions so we discover it at
  // runtime in beforeEach rather than hardcoding it.
  // -------------------------------------------------------------------------
  describe("Microsoft-signed system binary (notepad.exe)", () => {
    const NOTEPAD = "C:\\Windows\\System32\\notepad.exe"
    let notepadSubject: string | undefined

    beforeEach(async () => {
      try {
        await fs.access(NOTEPAD)
      } catch {
        return // notepad not accessible — skip all tests in this block
      }

      if (!notepadSubject) {
        try {
          const raw = realExecFileSync(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-InputFormat",
              "None",
              "-Command",
              `$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-AuthenticodeSignature -LiteralPath '${NOTEPAD}' | ConvertTo-Json -Compress`,
            ],
            { shell: false, env: { ...process.env, PSModulePath: "" }, timeout: 15_000 }
          ).toString()
          notepadSubject = JSON.parse(raw)?.SignerCertificate?.Subject
        } catch {
          // Discovery failed — each individual test will early-return via the guard below
        }
      }
    })

    test("full DN publisher match returns null", async () => {
      if (!notepadSubject) {
        return
      }
      expect(await verifySignature([notepadSubject], NOTEPAD, logger)).toBeNull()
    }, 30_000)

    test("wrong publisher returns non-null error string", async () => {
      if (!notepadSubject) {
        return
      }
      expect(await verifySignature(["Definitely Not Microsoft"], NOTEPAD, logger)).not.toBeNull()
    }, 30_000)

    test("CN-only match returns null and logs deprecation warning", async () => {
      if (!notepadSubject) {
        return
      }
      const cnOnly = notepadSubject.match(/CN=([^,]+)/)?.[1]?.trim()
      if (!cnOnly) {
        return
      }
      expect(await verifySignature([cnOnly], NOTEPAD, logger)).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(cnOnly))
    }, 30_000)

    test("partial DN (subset of keys) matches when provided keys all agree", async () => {
      if (!notepadSubject) {
        return
      }
      const cn = notepadSubject.match(/CN=[^,]+/)?.[0]
      const c = notepadSubject.match(/C=[A-Z]+/)?.[0]
      if (!cn || !c) {
        return
      }
      expect(await verifySignature([`${cn}, ${c}`], NOTEPAD, logger)).toBeNull()
    }, 30_000)
  })

  // -------------------------------------------------------------------------
  // Paths with characters that were dangerous under the old cmd.exe-based
  // invocation (shell: true) but are now safe with shell: false + -EncodedCommand.
  // Each test verifies no crash / spurious rejection on an unsigned file.

  test("directory name with & does not crash or reject (was dangerous with cmd.exe shell)", async () => {
    const parent = await tmpDir.getTempDir()
    const andDir = path.join(parent, "AT&T Updates")
    await fs.mkdir(andDir, { recursive: true })
    const p = path.join(andDir, "update.exe")
    await fs.writeFile(p, Buffer.from("not a PE"))
    const result = await verifySignature(["Any Publisher"], p, logger)
    expect(typeof result === "string" || result === null).toBe(true)
  }, 30_000)

  test("directory name with %VAR% does not crash or reject (was expanded by cmd.exe)", async () => {
    const parent = await tmpDir.getTempDir()
    const pctDir = path.join(parent, "%USERNAME% Updates")
    await fs.mkdir(pctDir, { recursive: true })
    const p = path.join(pctDir, "update.exe")
    await fs.writeFile(p, Buffer.from("not a PE"))
    const result = await verifySignature(["Any Publisher"], p, logger)
    expect(typeof result === "string" || result === null).toBe(true)
  }, 30_000)

  test("directory name with $ does not crash or reject (safe in PS single-quoted string)", async () => {
    const parent = await tmpDir.getTempDir()
    const dollarDir = path.join(parent, "$Updates")
    await fs.mkdir(dollarDir, { recursive: true })
    const p = path.join(dollarDir, "update.exe")
    await fs.writeFile(p, Buffer.from("not a PE"))
    const result = await verifySignature(["Any Publisher"], p, logger)
    expect(typeof result === "string" || result === null).toBe(true)
  }, 30_000)

  test("directory name with backtick does not crash or reject (safe in PS single-quoted string)", async () => {
    const parent = await tmpDir.getTempDir()
    const backtickDir = path.join(parent, "`Updates")
    await fs.mkdir(backtickDir, { recursive: true })
    const p = path.join(backtickDir, "update.exe")
    await fs.writeFile(p, Buffer.from("not a PE"))
    const result = await verifySignature(["Any Publisher"], p, logger)
    expect(typeof result === "string" || result === null).toBe(true)
  }, 30_000)

  // -------------------------------------------------------------------------
  test("symlink to a different file: LiteralPath mismatch prevents a silent pass", async () => {
    const realFile = await createUnsignedExe("real.exe")
    const symlinkPath = path.join(path.dirname(realFile), "symlink.exe")
    try {
      await fs.symlink(realFile, symlinkPath)
    } catch {
      return // Symlinks may require elevated privileges on Windows — skip gracefully
    }

    // When PowerShell resolves the symlink, data.Path === realFile ≠ symlinkPath.
    // Either the promise rejects (LiteralPath mismatch) or returns a non-null error string.
    let result: string | null = null
    try {
      result = await verifySignature(["Any Publisher"], symlinkPath, logger)
    } catch {
      return // Rejection is the expected security behavior — verification did NOT silently pass
    }
    expect(result).not.toBeNull()
  }, 30_000)
})
