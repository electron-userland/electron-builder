import { WindowsSignAzureManager } from "app-builder-lib/src/codeSign/win/windowsSignAzureManager"
import type { WindowsAzureSigningConfig } from "app-builder-lib/src/options/winOptions"
import type { WinPackager } from "app-builder-lib/src/winPackager"
import type { WindowsSignOptions } from "app-builder-lib/src/codeSign/win/windowsCodeSign"
import { describe, test, vi, beforeEach } from "vitest"

// ─── Test helpers ─────────────────────────────────────────────────────────────

type ExecArgs = [string, string[], ...unknown[]]

function makeVm(execSpy: ReturnType<typeof vi.fn>) {
  return {
    powershellCommand: { value: Promise.resolve("pwsh.exe") },
    exec: execSpy,
    toVmFile: (f: string) => f,
  }
}

function makePackager(azureSignConfig: Partial<WindowsAzureSigningConfig>, vm?: ReturnType<typeof makeVm>): WinPackager {
  const mockVm = vm ?? makeVm(vi.fn().mockResolvedValue(""))
  return {
    platformOptions: { sign: azureSignConfig },
    vm: { value: Promise.resolve(mockVm) },
    config: { toolsets: null },
    buildResourcesDir: "",
  } as unknown as WinPackager
}

const baseAzureOpts: WindowsAzureSigningConfig = {
  type: "azure",
  publisherName: "Test Publisher",
  endpoint: "https://weu.codesigning.azure.net/",
  certificateProfileName: "my-profile",
  codeSigningAccountName: "my-account",
}

// Decode the -EncodedCommand Base64 argument to a plain PowerShell command string
function decodeEncodedCommand(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf16le")
}

// Extract the -EncodedCommand value from exec call args
function captureEncodedCommand(execArgs: ExecArgs): string {
  const [, args] = execArgs
  const idx = args.indexOf("-EncodedCommand")
  if (idx === -1) {
    throw new Error("No -EncodedCommand found in exec call")
  }
  return decodeEncodedCommand(args[idx + 1])
}

// ─── computedPublisherName ────────────────────────────────────────────────────

describe("WindowsSignAzureManager.computedPublisherName", () => {
  test("wraps a single publisherName string in an array", async ({ expect }) => {
    const manager = new WindowsSignAzureManager(makePackager({ ...baseAzureOpts, publisherName: "ACME Corp" }))
    const result = await manager.computedPublisherName.value
    expect(result).toEqual(["ACME Corp"])
  })

  test("throws synchronously when publisherName is empty", ({ expect }) => {
    const manager = new WindowsSignAzureManager(makePackager({ ...baseAzureOpts, publisherName: "" }))
    expect(() => manager.computedPublisherName.value).toThrow("publisherName")
  })

  test("throws synchronously when publisherName is null", ({ expect }) => {
    const manager = new WindowsSignAzureManager(makePackager({ ...baseAzureOpts, publisherName: null as any }))
    expect(() => manager.computedPublisherName.value).toThrow("publisherName")
  })
})

// ─── signFile ─────────────────────────────────────────────────────────────────

describe("WindowsSignAzureManager.signFile", () => {
  let execSpy: ReturnType<typeof vi.fn>
  let manager: WindowsSignAzureManager
  const filePath = "C:\\builds\\app\\my-app.exe"
  const signOptions: WindowsSignOptions = {
    path: filePath,
    options: { sign: baseAzureOpts } as any,
  }

  beforeEach(() => {
    execSpy = vi.fn().mockResolvedValue("")
    manager = new WindowsSignAzureManager(makePackager(baseAzureOpts, makeVm(execSpy)))
  })

  test("invokes PowerShell via -EncodedCommand flag", async ({ expect }) => {
    await manager.signFile(signOptions)
    const [, args] = execSpy.mock.calls[0] as ExecArgs
    expect(args).toContain("-EncodedCommand")
    expect(args).toContain("-NoProfile")
    expect(args).toContain("-NonInteractive")
  })

  test("decoded command calls Invoke-TrustedSigning", async ({ expect }) => {
    await manager.signFile(signOptions)
    const psCommand = captureEncodedCommand(execSpy.mock.calls[0] as ExecArgs)
    expect(psCommand).toMatch(/^Invoke-TrustedSigning\b/)
  })

  test("includes all required Azure signing parameters", async ({ expect }) => {
    await manager.signFile(signOptions)
    const psCommand = captureEncodedCommand(execSpy.mock.calls[0] as ExecArgs)
    expect(psCommand).toContain(`-Endpoint '${baseAzureOpts.endpoint}'`)
    expect(psCommand).toContain(`-CertificateProfileName '${baseAzureOpts.certificateProfileName}'`)
    expect(psCommand).toContain(`-CodeSigningAccountName '${baseAzureOpts.codeSigningAccountName}'`)
    expect(psCommand).toContain(`-Files '${filePath}'`)
  })

  test("applies default values for optional parameters", async ({ expect }) => {
    await manager.signFile(signOptions)
    const psCommand = captureEncodedCommand(execSpy.mock.calls[0] as ExecArgs)
    expect(psCommand).toContain("-TimestampRfc3161 'http://timestamp.acs.microsoft.com'")
    expect(psCommand).toContain("-TimestampDigest 'SHA256'")
    expect(psCommand).toContain("-FileDigest 'SHA256'")
  })

  test("uses caller-supplied optional params when provided", async ({ expect }) => {
    const opts: WindowsAzureSigningConfig = {
      ...baseAzureOpts,
      timestampRfc3161: "http://custom-tsa.example.com",
      timestampDigest: "SHA384",
      fileDigest: "SHA512",
    }
    const manager2 = new WindowsSignAzureManager(makePackager(opts, makeVm(execSpy)))
    await manager2.signFile({ path: filePath, options: { sign: opts } as any })
    const psCommand = captureEncodedCommand(execSpy.mock.calls[0] as ExecArgs)
    expect(psCommand).toContain("-TimestampRfc3161 'http://custom-tsa.example.com'")
    expect(psCommand).toContain("-TimestampDigest 'SHA384'")
    expect(psCommand).toContain("-FileDigest 'SHA512'")
  })

  test("excludes publisherName from the PowerShell command", async ({ expect }) => {
    await manager.signFile(signOptions)
    const psCommand = captureEncodedCommand(execSpy.mock.calls[0] as ExecArgs)
    expect(psCommand).not.toContain("publisherName")
    expect(psCommand).not.toContain("PublisherName")
    expect(psCommand).not.toContain(baseAzureOpts.publisherName)
  })

  test("passes additionalMetadata args through to the command", async ({ expect }) => {
    const opts = { ...baseAzureOpts, additionalMetadata: { ExcludeCredentials: "true" } }
    const manager2 = new WindowsSignAzureManager(makePackager(opts, makeVm(execSpy)))
    await manager2.signFile({ path: filePath, options: { sign: opts } as any })
    const psCommand = captureEncodedCommand(execSpy.mock.calls[0] as ExecArgs)
    expect(psCommand).toContain("-ExcludeCredentials 'true'")
  })

  test("throws when additionalMetadata contains an invalid key", async ({ expect }) => {
    const opts = { ...baseAzureOpts, additionalMetadata: { "bad;key": "value" } as any }
    const manager2 = new WindowsSignAzureManager(makePackager(opts, makeVm(execSpy)))
    await expect(manager2.signFile({ path: filePath, options: { sign: opts } as any })).rejects.toThrow("not a valid PowerShell parameter name")
  })

  test("escapes single quotes in parameter values", async ({ expect }) => {
    const pathWithQuote = "C:\\user's documents\\app.exe"
    await manager.signFile({ path: pathWithQuote, options: { sign: baseAzureOpts } as any })
    const psCommand = captureEncodedCommand(execSpy.mock.calls[0] as ExecArgs)
    // PowerShell single-quote escaping: ' → ''
    expect(psCommand).toContain(`-Files 'C:\\user''s documents\\app.exe'`)
  })

  test("returns true on success", async ({ expect }) => {
    const result = await manager.signFile(signOptions)
    expect(result).toBe(true)
  })

  test("the encoded command round-trips correctly through Base64 UTF-16LE", async ({ expect }) => {
    await manager.signFile(signOptions)
    const [, args] = execSpy.mock.calls[0] as ExecArgs
    const encodedIdx = args.indexOf("-EncodedCommand")
    const base64 = args[encodedIdx + 1]
    // Must decode cleanly with no replacement characters
    const decoded = decodeEncodedCommand(base64)
    expect(decoded).not.toContain("�")
    expect(decoded.startsWith("Invoke-TrustedSigning")).toBe(true)
  })
})
