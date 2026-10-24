// vi.mock calls are hoisted to the top by vitest's transformer.
import { afterEach, beforeEach, vi } from "vitest"

vi.mock("child_process", async importOriginal => {
  const mod = await importOriginal<typeof import("child_process")>()
  return { ...mod, execFile: vi.fn() }
})

import { AuthenticodeSignatureStatus, authenticodeSignatureStatusName, readAuthenticodeSignerWithPowerShell } from "app-builder-lib/src/codeSign/win/authenticodeSignature"
import { parseAuthenticodeSignatureOutput, prepareAuthenticodeSignatureExec, preparePowerShellExec } from "builder-util-runtime"
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

function lastExecFileCall(): { file: string; args: Array<string>; options: { shell?: unknown; timeout?: unknown; windowsHide?: unknown; env?: NodeJS.ProcessEnv } } {
  const [file, args, options] = vi.mocked(execFile).mock.calls[0] as unknown as [
    string,
    Array<string>,
    { shell?: unknown; timeout?: unknown; windowsHide?: unknown; env?: NodeJS.ProcessEnv },
  ]
  return { file, args, options }
}

const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
const FILE_ENV = "ELECTRON_BUILDER_AUTHENTICODE_FILE"

beforeEach(() => {
  // the absolute PowerShell path is derived from SystemRoot, which is only set on Windows
  vi.stubEnv("SystemRoot", "C:\\Windows")
})

afterEach(() => {
  vi.mocked(execFile).mockReset()
  vi.unstubAllEnvs()
})

describe("PowerShell script construction", () => {
  test("the system Windows PowerShell runs the command without a shell or a console window, after the module setup", ({ expect }) => {
    const [file, args, options] = preparePowerShellExec("Write-Output 1", 1234)
    // by absolute path: a bare powershell.exe is searched for in the current directory first
    expect(file).toBe(POWERSHELL)
    expect(args.slice(0, -1)).toEqual(["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-EncodedCommand"])
    expect(args[args.length - 1]).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(decodeScript(args)).toBe(
      `$ProgressPreference = 'SilentlyContinue'; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Security"; Import-Module "$PSHOME\\Modules\\Microsoft.PowerShell.Utility"; $env:PSModulePath = ""; Write-Output 1`
    )
    expect(options.shell).toBe(false)
    expect(options.timeout).toBe(1234)
    expect(options.windowsHide).toBe(true)
  })

  test("the script uses nothing Constrained Language Mode (AppLocker / WDAC) forbids, such as assigning an output encoding", ({ expect }) => {
    const [, args] = prepareAuthenticodeSignatureExec("C:\\update.exe", 1)
    const script = decodeScript(args)
    expect(script).not.toMatch(/\[Console\]::|\$OutputEncoding|New-Object|::new\(|Add-Type|\[pscustomobject\]/i)
    // case-sensitive: -match would fold U+0130 (İ) and the Kelvin sign into ASCII and print them unescaped
    expect(script).toContain("-cmatch '[^\\x00-\\x7F]'")
  })

  test("a cmdlet error is written to stderr escaped like the output, with exit code 1", ({ expect }) => {
    // the script ends with the output statement, so without the catch PowerShell would exit with 0 after an error, and the error
    // text would reach Node in the console code page
    const script = decodeScript(prepareAuthenticodeSignatureExec("C:\\update.exe", 1)[1])
    expect(script).toContain("catch { Write-Error -Message (ConvertTo-AsciiEscaped ($_ | Out-String)); exit 1 }")
  })

  test("falls back to windir and refuses a SystemRoot that is missing or not an absolute path", ({ expect }) => {
    vi.stubEnv("SystemRoot", "")
    vi.stubEnv("windir", "D:\\Win")
    expect(preparePowerShellExec("Write-Output 1")[0]).toBe("D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
    vi.stubEnv("windir", undefined)
    expect(() => preparePowerShellExec("Write-Output 1")).toThrow("SystemRoot is not set")
    for (const relative of ["Windows", "\\Windows", "C:Windows"]) {
      vi.stubEnv("SystemRoot", relative)
      expect(() => preparePowerShellExec("Write-Output 1")).toThrow("not an absolute path")
    }
  })

  test("the file is passed verbatim in an environment variable, never in the script", ({ expect }) => {
    const file = "C:\\Users\\D’Andre\\it's ‘a’b‚c‛d $(whoami) `x %USERNAME% & calc\\Pálfi 你好 😀.exe"
    const [, args, options] = prepareAuthenticodeSignatureExec(file, 1)
    expect(options.env?.[FILE_ENV]).toBe(file)
    const script = decodeScript(args)
    expect(script).toContain(`Get-AuthenticodeSignature -LiteralPath $env:${FILE_ENV} -ErrorAction Stop | ConvertTo-Json -Compress`)
    expect(script).not.toContain("D’Andre")
    expect(script).not.toContain("whoami")
    expect(process.env[FILE_ENV]).toBeUndefined()
  })

  // One casing per test: on Windows process.env is case-insensitive, so two casings stubbed together collapse into one variable.
  for (const key of [FILE_ENV, FILE_ENV.toLowerCase(), "Electron_Builder_Authenticode_File"]) {
    test(`an inherited ${key} is replaced, not duplicated in another casing`, ({ expect }) => {
      vi.stubEnv(key, "C:\\attacker.exe")
      const [, , options] = prepareAuthenticodeSignatureExec("C:\\update.exe", 1)
      const keys = Object.keys(options.env ?? {}).filter(it => it.toLowerCase() === FILE_ENV.toLowerCase())
      expect(keys).toEqual([FILE_ENV])
      expect(options.env?.[FILE_ENV]).toBe("C:\\update.exe")
    })
  }

  test("an extraEnv with an own __proto__ key cannot replace the environment's prototype", ({ expect }) => {
    // JSON.parse creates `__proto__` as an own data property; Object.assign would pass it to the __proto__ setter
    const extraEnv: Record<string, string> = JSON.parse('{"__proto__": {"polluted": "yes"}, "ACME_EXTRA": "extra"}')
    expect(Object.prototype.hasOwnProperty.call(extraEnv, "__proto__")).toBe(true)
    const [, , options] = preparePowerShellExec("Write-Output 1", 1, extraEnv)
    const env = options.env ?? {}
    expect(Object.getPrototypeOf(env)).toBe(Object.prototype)
    expect(env.polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(env, "__proto__")).toBe(false)
    expect(env.ACME_EXTRA).toBe("extra")
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
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
      // kept: electron-updater rejects a catalog signature (2)
      SignatureType: 1,
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
    expect(file).toBe(POWERSHELL)
    // the command electron-updater runs, with the path passed the same way
    expect(decodeScript(args)).toContain(`Get-AuthenticodeSignature -LiteralPath $env:${FILE_ENV} -ErrorAction Stop | ConvertTo-Json -Compress`)
    expect(options.env?.[FILE_ENV]).toBe(FILE)
    expect(options).toMatchObject({ shell: false, timeout: 60_000, windowsHide: true })
  })

  test("a non-ASCII subject escaped as \\uXXXX by the script reads back losslessly", async ({ expect }) => {
    mockExecFile(null, '{"SignerCertificate":{"Subject":"CN=\\u00c4cme \\u4f60\\u597d"},"Status":0}')
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toEqual({ type: "signed", subject: "CN=Äcme 你好", status: 0 })
  })

  test("PowerShell that cannot be located is unreadable", async ({ expect }) => {
    vi.stubEnv("SystemRoot", undefined)
    vi.stubEnv("windir", undefined)
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toEqual({
      type: "unreadable",
      reason: "Get-AuthenticodeSignature failed: cannot locate Windows PowerShell: SystemRoot is not set",
    })
    expect(execFile).not.toHaveBeenCalled()
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
    // an exit code or a timeout is named instead of the message, which repeats the whole command line (encoded script included) and stderr
    mockExecFile(Object.assign(new Error("Command failed: powershell.exe -EncodedCommand JABQAHIA\nboom"), { code: 1 }), "", "boom\r\n")
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toEqual({ type: "unreadable", reason: "Get-AuthenticodeSignature failed: exited with code 1\nboom" })
    mockExecFile(Object.assign(new Error("Command failed: powershell.exe -EncodedCommand JABQAHIA"), { killed: true, signal: "SIGTERM" }), "")
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toEqual({ type: "unreadable", reason: "Get-AuthenticodeSignature failed: did not finish within 60s" })
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
    // what PowerShell wrote to stderr is part of the reason
    mockExecFile(null, "", '#< CLIXML <Objs><S S="Error">Cannot find path</S></Objs>\r\n')
    await expect(readAuthenticodeSignerWithPowerShell(FILE)).resolves.toMatchObject({
      type: "unreadable",
      reason: expect.stringMatching(/^cannot parse Get-AuthenticodeSignature output \(.+\): \n#< CLIXML <Objs><S S="Error">Cannot find path<\/S><\/Objs>$/),
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
