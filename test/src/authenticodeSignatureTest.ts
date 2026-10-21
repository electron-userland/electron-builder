// vi.mock calls are hoisted to the top by vitest's transformer.
import { afterEach, vi } from "vitest"

vi.mock("child_process", async importOriginal => {
  const mod = await importOriginal<typeof import("child_process")>()
  return { ...mod, execFile: vi.fn() }
})

import { readAuthenticodeSignerWithPowerShell } from "app-builder-lib/src/codeSign/win/authenticodeSignature"
import {
  AuthenticodeSignatureStatus,
  authenticodeSignatureStatusName,
  escapePowerShellSingleQuotes,
  getAuthenticodeSignatureCommand,
  parseAuthenticodeSignatureOutput,
  preparePowerShellExec,
  readAuthenticodeSignature,
  verifyAuthenticodePublisher,
} from "builder-util-runtime"
import { execFile } from "child_process"

// The Get-AuthenticodeSignature reader shared by electron-updater (runtime update verification) and electron-builder
// (build-time check of the signed installer). execFile is stubbed: no PowerShell is spawned, so this runs on any host.

const SUBJECT = "CN=Acme Corp, O=Acme Corporation, L=San Francisco, S=California, C=US"
const FILE = "C:\\Users\\D’Andre\\AppData\\Local\\acme-updater\\pending\\Acme Setup 1.0.1.exe"

function signatureJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    SignerCertificate: {
      Subject: SUBJECT,
      Issuer: SUBJECT,
      Thumbprint: "AABB",
      Archived: false,
      Extensions: [{}],
      Handle: {},
      HasPrivateKey: false,
      SubjectName: { Name: SUBJECT },
    },
    TimeStamperCertificate: null,
    Status: 0,
    StatusMessage: "Signature verified.",
    Path: FILE,
    PrivateKey: null,
    IsOSBinary: false,
    SignatureType: 1,
    ...overrides,
  })
}

function mockExecFile(error: Error | null, stdout: string, stderr = ""): void {
  vi.mocked(execFile).mockImplementationOnce((_file: any, _args: any, _options: any, callback: any) => {
    callback(error, stdout, stderr)
    return {} as any
  })
}

function decodeScript(args: ReadonlyArray<string>): string {
  return Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le")
}

function lastExecFileCall(): { file: string; args: Array<string>; options: { shell?: unknown; timeout?: unknown; env?: NodeJS.ProcessEnv } } {
  const [file, args, options] = vi.mocked(execFile).mock.calls[0] as unknown as [string, Array<string>, { shell?: unknown; timeout?: unknown; env?: NodeJS.ProcessEnv }]
  return { file, args, options }
}

afterEach(() => {
  vi.mocked(execFile).mockReset()
  vi.unstubAllEnvs()
})

describe("PowerShell script construction", () => {
  test("ASCII and Unicode (U+2018–U+201B) single quotes are doubled, other metacharacters are left literal", ({ expect }) => {
    expect(escapePowerShellSingleQuotes("it's")).toBe("it''s")
    expect(escapePowerShellSingleQuotes("‘a’b‚c‛d")).toBe("‘‘a’’b‚‚c‛‛d")
    expect(escapePowerShellSingleQuotes('C:\\$env:TEMP\\`x`\\"y"')).toBe('C:\\$env:TEMP\\`x`\\"y"')
  })

  test("the command passes the escaped path to -LiteralPath and prints the whole signature as JSON", ({ expect }) => {
    expect(getAuthenticodeSignatureCommand("C:\\it's\\D’Andre.exe")).toBe("Get-AuthenticodeSignature -LiteralPath 'C:\\it''s\\D’’Andre.exe' | ConvertTo-Json -Compress")
  })

  test("powershell.exe runs the command without a shell, after the module and encoding setup", ({ expect }) => {
    const [file, args, options] = preparePowerShellExec("Write-Output 1", 1234)
    expect(file).toBe("powershell.exe")
    expect(args.slice(0, -1)).toEqual(["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-EncodedCommand"])
    expect(args[args.length - 1]).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(decodeScript(args)).toBe(
      `$ProgressPreference = 'SilentlyContinue'; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Security"; $env:PSModulePath = ""; $OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output 1`
    )
    expect(options.shell).toBe(false)
    expect(options.timeout).toBe(1234)
  })

  // One casing per test: on Windows process.env is case-insensitive, so two casings stubbed together collapse into one variable.
  for (const key of ["PSModulePath", "PSMODULEPATH", "psmodulepath"]) {
    test(`PSModulePath is stripped from the inherited environment (${key})`, ({ expect }) => {
      vi.stubEnv(key, "C:\\FakeUserModules")
      vi.stubEnv("ACME_KEEP_ME", "kept")
      const [, , options] = preparePowerShellExec("Write-Output 1")
      const keys = Object.keys(options.env ?? {})
      expect(keys.filter(it => it.toLowerCase() === "psmodulepath")).toEqual([])
      expect(options.env?.ACME_KEEP_ME).toBe("kept")
      expect(process.env[key]).toBe("C:\\FakeUserModules")
    })
  }
})

describe("parseAuthenticodeSignatureOutput", () => {
  test("reads the numeric status, the path and the signer subject", ({ expect }) => {
    const signature = parseAuthenticodeSignatureOutput(signatureJson({ Status: AuthenticodeSignatureStatus.HashMismatch }))
    expect(signature).toMatchObject({ status: 3, path: FILE, signerSubject: SUBJECT })
  })

  test("removes the fields that only add noise from the raw output", ({ expect }) => {
    const { raw } = parseAuthenticodeSignatureOutput(signatureJson())
    expect(raw).toEqual({
      SignerCertificate: { Subject: SUBJECT, Issuer: SUBJECT, Thumbprint: "AABB" },
      TimeStamperCertificate: null,
      Status: 0,
      StatusMessage: "Signature verified.",
      Path: FILE,
    })
  })

  test("an unsigned file has no signer subject", ({ expect }) => {
    expect(parseAuthenticodeSignatureOutput(signatureJson({ SignerCertificate: null, Status: 2 }))).toMatchObject({ status: 2, signerSubject: null })
  })

  test("values of an unexpected type are reported as absent — a status serialized as a string is not Valid", ({ expect }) => {
    const signature = parseAuthenticodeSignatureOutput(signatureJson({ Status: "Valid", Path: 1, SignerCertificate: { Subject: 2 } }))
    expect(signature).toMatchObject({ status: null, path: null, signerSubject: null })
    expect(parseAuthenticodeSignatureOutput("5")).toEqual({ status: null, path: null, signerSubject: null, raw: 5 })
  })

  test("throws for output that is not JSON or is null", ({ expect }) => {
    expect(() => parseAuthenticodeSignatureOutput("")).toThrow(SyntaxError)
    expect(() => parseAuthenticodeSignatureOutput("not { json")).toThrow(SyntaxError)
    expect(() => parseAuthenticodeSignatureOutput("null")).toThrow(TypeError)
  })
})

describe("readAuthenticodeSignature", () => {
  test("runs Get-AuthenticodeSignature for the file with the given timeout and parses its output", async ({ expect }) => {
    mockExecFile(null, signatureJson())
    const result = await readAuthenticodeSignature(FILE, 20_000)
    expect(result).toMatchObject({ type: "ok", signature: { status: 0, path: FILE, signerSubject: SUBJECT }, stderr: "" })
    const { file, args, options } = lastExecFileCall()
    expect(file).toBe("powershell.exe")
    expect(decodeScript(args)).toContain(
      "Get-AuthenticodeSignature -LiteralPath 'C:\\Users\\D’’Andre\\AppData\\Local\\acme-updater\\pending\\Acme Setup 1.0.1.exe' | ConvertTo-Json -Compress"
    )
    expect(options).toMatchObject({ shell: false, timeout: 20_000 })
  })

  test("reports a PowerShell failure with its error and stderr", async ({ expect }) => {
    const error = new Error("Command failed")
    mockExecFile(error, "", "access denied")
    await expect(readAuthenticodeSignature(FILE, 1)).resolves.toEqual({ type: "execFailed", error, stdout: "", stderr: "access denied" })
  })

  test("keeps stderr next to a parsed signature, for the caller to judge", async ({ expect }) => {
    mockExecFile(null, signatureJson(), "WARNING: something")
    await expect(readAuthenticodeSignature(FILE, 1)).resolves.toMatchObject({ type: "ok", stderr: "WARNING: something" })
  })

  test("reports output that is not a signature as unparsable, with the output", async ({ expect }) => {
    mockExecFile(null, "garbage")
    const result = await readAuthenticodeSignature(FILE, 1)
    expect(result).toMatchObject({ type: "unparsable", stdout: "garbage" })
    expect(result.type === "unparsable" ? result.error : null).toBeInstanceOf(SyntaxError)
  })
})

describe("verifyAuthenticodePublisher", () => {
  const valid = { status: AuthenticodeSignatureStatus.Valid, signerSubject: SUBJECT }

  test("a Valid signature by a matching publisher matches, saying how", ({ expect }) => {
    expect(verifyAuthenticodePublisher(valid, ["CN=Other", SUBJECT])).toEqual({ type: "match", subject: SUBJECT, match: { publisherName: SUBJECT, kind: "dn" } })
    expect(verifyAuthenticodePublisher(valid, ["Acme Corp"])).toMatchObject({ type: "match", match: { kind: "cn" } })
  })

  test("by default only a Valid status is accepted, whatever the signer", ({ expect }) => {
    for (const status of [AuthenticodeSignatureStatus.NotTrusted, AuthenticodeSignatureStatus.HashMismatch, AuthenticodeSignatureStatus.UnknownError, null]) {
      expect(verifyAuthenticodePublisher({ status, signerSubject: SUBJECT }, [SUBJECT])).toEqual({ type: "invalidStatus", status })
    }
  })

  test("a caller can accept more statuses", ({ expect }) => {
    const isAcceptedStatus = (status: number | null) => status !== AuthenticodeSignatureStatus.HashMismatch
    expect(verifyAuthenticodePublisher({ status: null, signerSubject: SUBJECT }, [SUBJECT], { isAcceptedStatus }).type).toBe("match")
    expect(verifyAuthenticodePublisher({ status: AuthenticodeSignatureStatus.NotTrusted, signerSubject: SUBJECT }, [SUBJECT], { isAcceptedStatus }).type).toBe("match")
    expect(verifyAuthenticodePublisher({ status: AuthenticodeSignatureStatus.HashMismatch, signerSubject: SUBJECT }, [SUBJECT], { isAcceptedStatus }).type).toBe("invalidStatus")
  })

  test("no signer certificate, or a signer matching no publisher name, does not match", ({ expect }) => {
    expect(verifyAuthenticodePublisher({ status: 0, signerSubject: null }, [SUBJECT])).toEqual({ type: "notSigned" })
    expect(verifyAuthenticodePublisher(valid, ["CN=Other Corp", "Other"])).toEqual({ type: "publisherMismatch", subject: SUBJECT })
    expect(verifyAuthenticodePublisher(valid, [])).toEqual({ type: "publisherMismatch", subject: SUBJECT })
  })

  test("status names", ({ expect }) => {
    expect(authenticodeSignatureStatusName(0)).toBe("Valid")
    expect(authenticodeSignatureStatusName(3)).toBe("HashMismatch")
    expect(authenticodeSignatureStatusName(42)).toBe("42")
    expect(authenticodeSignatureStatusName(null)).toBe("unknown")
  })
})

describe("readAuthenticodeSignerWithPowerShell (electron-builder adapter)", () => {
  test("maps a signature to the signer and its numeric status, with a 60s timeout", async ({ expect }) => {
    mockExecFile(null, signatureJson({ Status: AuthenticodeSignatureStatus.NotTrusted }))
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toEqual({ type: "signed", subject: SUBJECT, status: AuthenticodeSignatureStatus.NotTrusted })
    expect(lastExecFileCall().options.timeout).toBe(60_000)
  })

  test("a signature without a signer certificate is unsigned, naming the status", async ({ expect }) => {
    mockExecFile(null, signatureJson({ SignerCertificate: null, Status: AuthenticodeSignatureStatus.NotSigned }))
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toEqual({
      type: "unsigned",
      reason: "Get-AuthenticodeSignature reports no signer certificate (status: NotSigned)",
    })
  })

  test("a PowerShell failure or unparsable output is unreadable", async ({ expect }) => {
    mockExecFile(new Error("Command failed"), "", "boom\r\n")
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toEqual({ type: "unreadable", reason: "Get-AuthenticodeSignature failed: Command failed\nboom" })
    mockExecFile(null, "garbage")
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toMatchObject({
      type: "unreadable",
      reason: expect.stringMatching(/^cannot parse Get-AuthenticodeSignature output \(.+\): garbage$/),
    })
  })

  test("stderr next to a parsed signature does not make it unreadable (as before, the build only fails on an exit error)", async ({ expect }) => {
    mockExecFile(null, signatureJson(), "WARNING: something")
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toMatchObject({ type: "signed", subject: SUBJECT })
  })
})
