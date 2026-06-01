import { WindowsSignToolManager } from "app-builder-lib"
import { WindowsSignTaskConfiguration } from "app-builder-lib/out/codeSign/windowsSignToolManager"
import { mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

function makeManager(winCodeSign?: string): WindowsSignToolManager {
  const manager = Object.create(WindowsSignToolManager.prototype) as WindowsSignToolManager
  ;(manager as any).packager = { config: { toolsets: { winCodeSign: winCodeSign ?? "1.1.0" } } }
  return manager
}

function makeTaskConfig(overrides: Partial<WindowsSignTaskConfiguration> = {}): WindowsSignTaskConfiguration {
  return {
    path: "/app/dist/file.exe",
    options: { signtoolOptions: {} } as any,
    name: "My App",
    site: "https://example.com",
    cscInfo: { file: "/certs/cert.pfx", password: "s3cr3t" },
    hash: "sha256",
    isNest: false,
    ...overrides,
  }
}

// ─── getOutputPath ───────────────────────────────────────────────────────────

describe("getOutputPath", () => {
  test("appends hash and -signed suffix before extension", () => {
    const manager = makeManager()
    expect(manager.getOutputPath(path.join("/out", "app.exe"), "sha256")).toBe(path.join("/out", "app-signed-sha256.exe"))
    expect(manager.getOutputPath(path.join("/out", "app.exe"), "sha1")).toBe(path.join("/out", "app-signed-sha1.exe"))
  })

  test("handles filenames without directory", () => {
    const manager = makeManager()
    const result = manager.getOutputPath("app.dll", "sha256")
    expect(result).toBe(path.join(".", "app-signed-sha256.dll"))
  })

  test("handles path with multiple dots in filename", () => {
    const manager = makeManager()
    const result = manager.getOutputPath(path.join("/out", "my.app.v2.exe"), "sha256")
    expect(result).toBe(path.join("/out", "my.app.v2-signed-sha256.exe"))
  })
})

// ─── computeSignToolArgs (Windows path) ──────────────────────────────────────

describe("computeSignToolArgs (isWin=true, modern toolset)", () => {
  test("includes /fd and input file for sha256", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig()
    const args = manager.computeSignToolArgs(config, true)

    expect(args[0]).toBe("sign")
    expect(args).toContain("/fd")
    const fdIdx = args.indexOf("/fd")
    expect(args[fdIdx + 1]).toBe("sha256")
    expect(args[args.length - 1]).toBe(config.path)
  })

  test("includes /as (nest) when isNest=true", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig({ isNest: true })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/as")
  })

  test("includes /d (description) when name is set", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig({ name: "Signed App" })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/d")
    const idx = args.indexOf("/d")
    expect(args[idx + 1]).toBe("Signed App")
  })

  test("includes /du (site) when site is set", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig({ site: "https://myapp.example.com" })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/du")
    const idx = args.indexOf("/du")
    expect(args[idx + 1]).toBe("https://myapp.example.com")
  })

  test("includes /p (password) when password is set", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig({ cscInfo: { file: "/certs/cert.pfx", password: "hunter2" } })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/p")
    const idx = args.indexOf("/p")
    expect(args[idx + 1]).toBe("hunter2")
  })

  test("includes /f (cert file) for pfx certificate", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig({ cscInfo: { file: "/certs/cert.pfx", password: null } })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/f")
    const idx = args.indexOf("/f")
    expect(args[idx + 1]).toBe("/certs/cert.pfx")
  })

  test("includes /f for .p12 certificate (same as pfx)", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig({ cscInfo: { file: "/certs/cert.p12", password: null } })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/f")
  })

  test("omits /td in offline mode", () => {
    const origEnv = process.env.ELECTRON_BUILDER_OFFLINE
    process.env.ELECTRON_BUILDER_OFFLINE = "true"
    try {
      const manager = makeManager("1.1.0")
      const config = makeTaskConfig({ hash: "sha256" })
      const args = manager.computeSignToolArgs(config, true)
      expect(args).not.toContain("/tr")
      expect(args).not.toContain("/t")
      expect(args).not.toContain("/td")
    } finally {
      if (origEnv === undefined) {
        delete process.env.ELECTRON_BUILDER_OFFLINE
      } else {
        process.env.ELECTRON_BUILDER_OFFLINE = origEnv
      }
    }
  })
})

describe("computeSignToolArgs (isWin=true, legacy toolset 0.0.0)", () => {
  test("omits /fd for sha1 (legacy behavior)", () => {
    const manager = makeManager("0.0.0")
    const config = makeTaskConfig({ hash: "sha1" })
    const args = manager.computeSignToolArgs(config, true)
    // legacy toolset: sha1 should NOT add /fd
    const fdIdx = args.indexOf("/fd")
    expect(fdIdx).toBe(-1)
  })

  test("includes /fd sha256 for sha256 (legacy behavior)", () => {
    const manager = makeManager("0.0.0")
    const config = makeTaskConfig({ hash: "sha256" })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/fd")
    const fdIdx = args.indexOf("/fd")
    expect(args[fdIdx + 1]).toBe("sha256")
  })
})

// ─── computeSignToolArgs (non-Windows / osslsigncode path) ───────────────────

describe("computeSignToolArgs (isWin=false)", () => {
  test("includes -in / -out / -pkcs12 for pfx", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig({ cscInfo: { file: "/certs/cert.pfx", password: null } })
    const args = manager.computeSignToolArgs(config, false)

    expect(args).toContain("-in")
    expect(args).toContain("-out")
    expect(args).toContain("-pkcs12")
  })

  test("resultOutputPath is set after osslsigncode args are built", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig({ hash: "sha256" }) as any
    manager.computeSignToolArgs(config, false)
    expect(config.resultOutputPath).toBeDefined()
    expect(config.resultOutputPath).toContain("-signed-sha256")
  })
})

// ─── addCertificateArgs null guard ───────────────────────────────────────────

describe("computeSignToolArgs with null cscInfo", () => {
  test("throws a descriptive error when cscInfo is null", () => {
    const manager = makeManager()
    const config = makeTaskConfig({ cscInfo: null })
    expect(() => manager.computeSignToolArgs(config, true)).toThrow("No code signing certificate configured")
  })
})

// ─── addCertificateArgs unsupported certificate format ───────────────────────

describe("computeSignToolArgs with unsupported cert format", () => {
  test("throws for non-pfx/p12 certificate file", () => {
    const manager = makeManager()
    const config = makeTaskConfig({ cscInfo: { file: "/certs/cert.cer", password: null } })
    expect(() => manager.computeSignToolArgs(config, true)).toThrow("pkcs12")
  })

  test("throws certificateSha1/certificateSubjectName not supported on non-Windows", () => {
    const manager = makeManager()
    // When cscInfo has no `file` property (store-based cert), non-Win should throw
    const storeInfo = { thumbprint: "ABCD", subject: "CN=Test", store: "My", isLocalMachineStore: false }
    const config = makeTaskConfig({ cscInfo: storeInfo as any })
    expect(() => manager.computeSignToolArgs(config, false)).toThrow("supported only on Windows")
  })
})

// ─── getToolPath ─────────────────────────────────────────────────────────────

describe("getToolPath", () => {
  let tmpDir: string
  let fakeTool: string
  const origEnv: Record<string, string | undefined> = {}

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "eb-signtool-test-"))
    fakeTool = path.join(tmpDir, "signtool.exe")
    await writeFile(fakeTool, "")
    origEnv.SIGNTOOL_PATH = process.env.SIGNTOOL_PATH
    origEnv.USE_SYSTEM_SIGNTOOL = process.env.USE_SYSTEM_SIGNTOOL
    process.env.SIGNTOOL_PATH = fakeTool
    delete process.env.USE_SYSTEM_SIGNTOOL
  })

  afterEach(async () => {
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    await rm(tmpDir, { recursive: true, force: true })
  })

  test("returns SIGNTOOL_PATH env override when set", async () => {
    const manager = makeManager("1.1.0")
    const toolInfo = await manager.getToolPath(true)
    expect(toolInfo.path).toBe(fakeTool)
  })

  test("returns SIGNTOOL_PATH env override on non-Windows too", async () => {
    const manager = makeManager("1.1.0")
    const toolInfo = await manager.getToolPath(false)
    expect(toolInfo.path).toBe(fakeTool)
  })

  test("returned ToolInfo has a path property (string)", async () => {
    const manager = makeManager("1.1.0")
    const toolInfo = await manager.getToolPath(true)
    expect(typeof toolInfo.path).toBe("string")
    expect(toolInfo.path.length).toBeGreaterThan(0)
  })
})
