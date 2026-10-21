// vi.mock calls are hoisted to the top by vitest's transformer.
import { afterEach, vi } from "vitest"

vi.mock("child_process", async importOriginal => {
  const mod = await importOriginal<typeof import("child_process")>()
  return { ...mod, execFile: vi.fn() }
})

import { AuthenticodeSignatureStatus, authenticodeSignatureStatusName, readAuthenticodeSignerWithPowerShell } from "app-builder-lib/src/codeSign/win/authenticodeSignature"
import { escapePowerShellSingleQuotes, parseAuthenticodeSignatureOutput, preparePowerShellExec } from "builder-util-runtime"
import { execFile } from "child_process"

// The Get-AuthenticodeSignature helpers shared by electron-updater (runtime update verification) and electron-builder
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
  test("removes the fields that only add noise from the output and keeps the rest as is", ({ expect }) => {
    expect(parseAuthenticodeSignatureOutput(signatureJson())).toEqual({
      SignerCertificate: { Subject: SUBJECT, Issuer: SUBJECT, Thumbprint: "AABB" },
      TimeStamperCertificate: null,
      Status: 0,
      StatusMessage: "Signature verified.",
      Path: FILE,
    })
  })

  test("an unsigned file keeps its null signer certificate", ({ expect }) => {
    expect(parseAuthenticodeSignatureOutput(signatureJson({ SignerCertificate: null, Status: 2 }))).toMatchObject({ SignerCertificate: null, Status: 2 })
  })

  test("throws for output that is not JSON or is null", ({ expect }) => {
    expect(() => parseAuthenticodeSignatureOutput("")).toThrow(SyntaxError)
    expect(() => parseAuthenticodeSignatureOutput("not { json")).toThrow(SyntaxError)
    expect(() => parseAuthenticodeSignatureOutput("null")).toThrow(TypeError)
  })
})

describe("AuthenticodeSignatureStatus (electron-builder)", () => {
  test("status names", ({ expect }) => {
    expect(authenticodeSignatureStatusName(AuthenticodeSignatureStatus.Valid)).toBe("Valid")
    expect(authenticodeSignatureStatusName(3)).toBe("HashMismatch")
    expect(authenticodeSignatureStatusName(42)).toBe("42")
    expect(authenticodeSignatureStatusName(null)).toBe("unknown")
  })
})

describe("readAuthenticodeSignerWithPowerShell (electron-builder adapter)", () => {
  test("maps a signature to the signer and its numeric status, with a 60s timeout", async ({ expect }) => {
    mockExecFile(null, signatureJson({ Status: AuthenticodeSignatureStatus.NotTrusted }))
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toEqual({ type: "signed", subject: SUBJECT, status: AuthenticodeSignatureStatus.NotTrusted })
    const { file, args, options } = lastExecFileCall()
    expect(file).toBe("powershell.exe")
    // the command electron-updater runs, with the path escaped the same way
    expect(decodeScript(args)).toContain(
      "Get-AuthenticodeSignature -LiteralPath 'C:\\Users\\D’’Andre\\AppData\\Local\\acme-updater\\pending\\Acme Setup 1.0.1.exe' | ConvertTo-Json -Compress"
    )
    expect(options).toMatchObject({ shell: false, timeout: 60_000 })
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
    mockExecFile(null, "null")
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toMatchObject({
      type: "unreadable",
      reason: expect.stringMatching(/^cannot parse Get-AuthenticodeSignature output \(.+\): null$/),
    })
  })

  test("a status or subject of an unexpected type is reported as unknown / no signer", async ({ expect }) => {
    mockExecFile(null, signatureJson({ Status: "Valid", SignerCertificate: { Subject: 2 } }))
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toEqual({
      type: "unsigned",
      reason: "Get-AuthenticodeSignature reports no signer certificate (status: unknown)",
    })
    mockExecFile(null, "5")
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toMatchObject({ type: "unsigned" })
  })

  test("stderr next to a parsed signature does not make it unreadable (as before, the build only fails on an exit error)", async ({ expect }) => {
    mockExecFile(null, signatureJson(), "WARNING: something")
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toMatchObject({ type: "signed", subject: SUBJECT })
  })
})
