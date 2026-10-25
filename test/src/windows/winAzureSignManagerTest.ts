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

// Default to a pre-1.3.0 winCodeSign pin so signFile() exercises the legacy PowerShell
// (Invoke-TrustedSigning) path. The modern default (unset / null / "latest" → newest bundle →
// signtool /dlib) is covered in winSignToolManagerTest's "signFileWithDlib" suite.
function makePackager(azureSignConfig: Partial<WindowsAzureSigningConfig>, vm?: ReturnType<typeof makeVm>, toolsets: any = { winCodeSign: "1.2.1" }): WinPackager {
  const mockVm = vm ?? makeVm(vi.fn().mockResolvedValue(""))
  return {
    platformOptions: { sign: azureSignConfig },
    vm: { value: Promise.resolve(mockVm) },
    config: { toolsets },
    buildResourcesDir: "",
  } as unknown as WinPackager
}

const baseAzureOpts: WindowsAzureSigningConfig = {
  type: "azure",
  publisherName: "CN=Test Publisher, O=Test Publisher Inc, C=US",
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
    const manager = new WindowsSignAzureManager(makePackager({ ...baseAzureOpts, publisherName: "CN=ACME Corp, O=ACME Corp" }))
    const result = await manager.computedPublisherName.value
    expect(result).toEqual(["CN=ACME Corp, O=ACME Corp"])
  })

  test("accepts a CN-only DN", async ({ expect }) => {
    const manager = new WindowsSignAzureManager(makePackager({ ...baseAzureOpts, publisherName: "CN=ACME Corp" }))
    await expect(manager.computedPublisherName.value).resolves.toEqual(["CN=ACME Corp"])
  })

  test.for(["ACME Corp", "CN="])("throws synchronously when publisherName %j is not a DN (electron-builder v27)", (publisherName, { expect }) => {
    const manager = new WindowsSignAzureManager(makePackager({ ...baseAzureOpts, publisherName }))
    expect(() => manager.computedPublisherName.value).toThrow(/is not a distinguished name\. Since electron-builder v27/)
    expect(() => manager.computedPublisherName.value).toThrow(/v27-build-changes#windows-publishername-must-be-a-distinguished-name$/)
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

describe("WindowsSignAzureManager.signFile", { concurrent: false }, () => {
  let execSpy: ReturnType<typeof vi.fn>
  let manager: WindowsSignAzureManager
  const filePath = "C:\\builds\\app\\my-app.exe"
  const signOptions: WindowsSignOptions = {
    path: filePath,
    options: { sign: baseAzureOpts },
  }

  beforeEach(() => {
    execSpy = vi.fn().mockResolvedValue("")
    manager = new WindowsSignAzureManager(makePackager(baseAzureOpts, makeVm(execSpy)))
  })

  test("rejects a publisherName that is not a DN before signing anything", async ({ expect }) => {
    const bareNameManager = new WindowsSignAzureManager(makePackager({ ...baseAzureOpts, publisherName: "Test Publisher" }, makeVm(execSpy)))
    await expect(bareNameManager.signFile(signOptions)).rejects.toThrow(/Since electron-builder v27/)
    expect(execSpy).not.toHaveBeenCalled()
  })

  test("passes the AZURE_* credential variables explicitly, since a child process gets no credentials otherwise", async ({ expect }) => {
    vi.stubEnv("AZURE_CLIENT_SECRET", "azure-secret")
    vi.stubEnv("AZURE_TENANT_ID", "tenant")
    vi.stubEnv("GH_TOKEN", "github-token")
    try {
      await manager.signFile(signOptions)
    } finally {
      vi.unstubAllEnvs()
    }
    const env = (execSpy.mock.calls[0][2] as { env: Record<string, string> }).env
    expect(env.AZURE_CLIENT_SECRET).toBe("azure-secret")
    expect(env.AZURE_TENANT_ID).toBe("tenant")
    expect(env).not.toHaveProperty("GH_TOKEN")
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
    await manager2.signFile({ path: filePath, options: { sign: opts } })
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
    await manager2.signFile({ path: filePath, options: { sign: opts } })
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
    await manager.signFile({ path: pathWithQuote, options: { sign: baseAzureOpts } })
    const psCommand = captureEncodedCommand(execSpy.mock.calls[0] as ExecArgs)
    // PowerShell single-quote escaping: ' → ''
    expect(psCommand).toContain(`-Files 'C:\\user''s documents\\app.exe'`)
  })

  test(`returns "signed" on success`, async ({ expect }) => {
    const result = await manager.signFile(signOptions)
    expect(result).toBe("signed")
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
