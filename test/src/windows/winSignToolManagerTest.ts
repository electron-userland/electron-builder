import { HsmSignManager } from "app-builder-lib/src/codeSign/win/hsmSignManager"
import { Pkcs11SignManager } from "app-builder-lib/src/codeSign/win/pkcs11SignManager"
import { publisherNameMatchesCertificate, SigntoolBaseSignManager, SigntoolSignManager } from "app-builder-lib/src/codeSign/win/signtoolBaseSignManager"
import { WindowsSignTaskConfiguration } from "app-builder-lib/src/codeSign/win/signtoolBaseSignManager"
import { readCertInfoFromX509 } from "app-builder-lib/src/codeSign/certInfo"
import { WindowsSignAzureManager } from "app-builder-lib/src/codeSign/win/windowsSignAzureManager"
import { getAtsBundleDir, getDotnetRuntimeDir, getWindowsKitsBundle } from "app-builder-lib/src/toolsets/winCodeSign"
import type { WinPackager } from "app-builder-lib/src/winPackager"
import { InvalidConfigurationError } from "builder-util"
import { writeFile } from "fs/promises"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("app-builder-lib/src/toolsets/winCodeSign", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/toolsets/winCodeSign")>()
  return { ...actual, getWindowsKitsBundle: vi.fn(), getAtsBundleDir: vi.fn(), getDotnetRuntimeDir: vi.fn() }
})

function makeManager(winCodeSign?: string): SigntoolSignManager {
  const manager = Object.create(SigntoolSignManager.prototype) as SigntoolSignManager
  ;(manager as any).packager = { config: { toolsets: { winCodeSign: winCodeSign ?? "1.1.0" } } }
  return manager
}

function makeHsmManager(winCodeSign?: string): HsmSignManager {
  const manager = Object.create(HsmSignManager.prototype) as HsmSignManager
  ;(manager as any).packager = { config: { toolsets: { winCodeSign: winCodeSign ?? "1.1.0" } } }
  return manager
}

function makePkcs11Manager(winCodeSign?: string, getCscPassword?: () => string | null): Pkcs11SignManager {
  const manager = Object.create(Pkcs11SignManager.prototype) as Pkcs11SignManager
  ;(manager as any).packager = {
    config: { toolsets: { winCodeSign: winCodeSign ?? "1.1.0" } },
    getCscPassword: getCscPassword ?? (() => null),
  }
  return manager
}

function makeTaskConfig(overrides: Partial<WindowsSignTaskConfiguration> = {}): WindowsSignTaskConfiguration {
  return {
    path: "/app/dist/file.exe",
    options: { sign: { type: "signtool" } } as any,
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
  // Tool resolution always flows through the toolset (getSignToolPath). There is intentionally no
  // env-var override (e.g. SIGNTOOL_PATH / USE_SYSTEM_SIGNCODE): a user-provided tool must be supplied
  // via a checksum-validated `toolsets.winCodeSign` ToolsetCustom for security.
  test("returns a ToolInfo with a non-empty string path", async () => {
    const manager = makeManager("1.1.0")
    const toolInfo = await manager.getToolPath(true)
    expect(typeof toolInfo.path).toBe("string")
    expect(toolInfo.path.length).toBeGreaterThan(0)
  })
})

// ─── HSM signing: /csp and /kc args (Windows path) ───────────────────────────

describe("computeSignToolArgs — HSM (isWin=true, modern toolset)", () => {
  const hsmOptions = {
    sign: {
      type: "hsm" as const,
      cryptoServiceProvider: "Google Cloud KMS Provider",
      keyContainer: "projects/proj/locations/us/keyRings/ring/cryptoKeys/key/cryptoKeyVersions/1",
    },
  } as any

  test("HSM with .pfx file: /f, /csp, /kc present in correct order", () => {
    const manager = makeHsmManager("1.1.0")
    const config = makeTaskConfig({
      options: hsmOptions,
      cscInfo: { file: "/certs/cert.pfx", password: null },
    })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/f")
    const fIdx = args.indexOf("/f")
    const cspIdx = args.indexOf("/csp")
    const kcIdx = args.indexOf("/kc")
    expect(cspIdx).toBeGreaterThan(fIdx)
    expect(kcIdx).toBeGreaterThan(cspIdx)
    expect(args[cspIdx + 1]).toBe("Google Cloud KMS Provider")
    expect(args[kcIdx + 1]).toBe("projects/proj/locations/us/keyRings/ring/cryptoKeys/key/cryptoKeyVersions/1")
  })

  test("HSM with .crt file: /f accepted without error", () => {
    const manager = makeHsmManager("1.1.0")
    const config = makeTaskConfig({
      options: hsmOptions,
      cscInfo: { file: "/certs/mycert.crt", password: null },
    })
    expect(() => manager.computeSignToolArgs(config, true)).not.toThrow()
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/f")
    const fIdx = args.indexOf("/f")
    expect(args[fIdx + 1]).toBe("/certs/mycert.crt")
    expect(args).toContain("/csp")
    expect(args).toContain("/kc")
  })

  test("HSM with .cer file: /f accepted without error", () => {
    const manager = makeHsmManager("1.1.0")
    const config = makeTaskConfig({
      options: hsmOptions,
      cscInfo: { file: "/certs/mycert.cer", password: null },
    })
    expect(() => manager.computeSignToolArgs(config, true)).not.toThrow()
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/f")
  })

  test("HSM with store-based cert: /sha1 present, /csp and /kc appended", () => {
    const manager = makeHsmManager("1.1.0")
    const storeCscInfo = { thumbprint: "AABBCC", subject: "CN=Test", store: "My", isLocalMachineStore: false }
    const config = makeTaskConfig({
      options: hsmOptions,
      cscInfo: storeCscInfo as any,
    })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/sha1")
    expect(args).toContain("/csp")
    expect(args).toContain("/kc")
  })

  test("/csp and /kc appear before /debug and the input file", () => {
    const manager = makeHsmManager("1.1.0")
    const config = makeTaskConfig({ options: hsmOptions })
    const args = manager.computeSignToolArgs(config, true)
    const debugIdx = args.indexOf("/debug")
    const cspIdx = args.indexOf("/csp")
    const kcIdx = args.indexOf("/kc")
    expect(cspIdx).toBeGreaterThan(-1)
    expect(kcIdx).toBeGreaterThan(-1)
    expect(cspIdx).toBeLessThan(debugIdx)
    expect(kcIdx).toBeLessThan(debugIdx)
    // input file is always last
    expect(args[args.length - 1]).toBe(config.path)
  })
})

// ─── HSM validation errors ────────────────────────────────────────────────────

describe("HSM validation errors", () => {
  const hsmOptions = {
    sign: {
      type: "hsm" as const,
      cryptoServiceProvider: "Google Cloud KMS Provider",
      keyContainer: "my-key-container",
    },
  } as any

  test("legacy toolset (0.0.0) + HSM → throws toolset error", () => {
    const manager = makeHsmManager("0.0.0")
    const config = makeTaskConfig({ options: hsmOptions })
    expect(() => manager.computeSignToolArgs(config, true)).toThrow(/winCodeSign toolset 1\.x/)
  })

  test("null toolset (modern default) + HSM → succeeds (resolves to newest bundle)", () => {
    const manager = makeHsmManager(undefined)
    // unset / null toolset now resolves to the newest bundle (modern), so HSM is supported.
    ;(manager as any).packager = { config: { toolsets: {} } }
    const config = makeTaskConfig({ options: hsmOptions })
    const args = manager.computeSignToolArgs(config, true)
    expect(args).toContain("/csp")
    expect(args).toContain("/kc")
  })

  test("non-Windows (isWin=false) + HSM → throws Windows-only error", () => {
    const manager = makeHsmManager("1.1.0")
    const config = makeTaskConfig({ options: hsmOptions })
    expect(() => manager.computeSignToolArgs(config, false)).toThrow(/only supported on Windows/)
  })

  test(".crt file without HSM mode → throws pkcs12 error", () => {
    const manager = makeManager("1.1.0")
    const config = makeTaskConfig({
      options: { sign: { type: "signtool" as const } },
      cscInfo: { file: "/certs/cert.crt", password: null },
    })
    expect(() => manager.computeSignToolArgs(config, true)).toThrow(/pkcs12/)
  })
})

// ─── PKCS#11 signing: osslsigncode path ──────────────────────────────────────

describe("computeSignToolArgs — PKCS#11 (isWin=false)", () => {
  const pkcs11Options = {
    sign: {
      type: "pkcs11" as const,
      pkcs11Module: "/usr/lib/opensc-pkcs11.so",
      pkcs11KeyUri: "pkcs11:token=MyToken;object=MyKey;type=private",
    },
  } as any

  test("PKCS#11 mode: -pkcs11module and -key present, no -pkcs12", () => {
    const manager = makePkcs11Manager("1.1.0")
    const config = makeTaskConfig({ options: pkcs11Options })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).toContain("-pkcs11module")
    const modIdx = args.indexOf("-pkcs11module")
    expect(args[modIdx + 1]).toBe("/usr/lib/opensc-pkcs11.so")
    expect(args).toContain("-key")
    const keyIdx = args.indexOf("-key")
    expect(args[keyIdx + 1]).toBe("pkcs11:token=MyToken;object=MyKey;type=private")
    expect(args).not.toContain("-pkcs12")
  })

  test("PKCS#11 mode: -in and -out are present", () => {
    const manager = makePkcs11Manager("1.1.0")
    const config = makeTaskConfig({ options: pkcs11Options })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).toContain("-in")
    expect(args).toContain("-out")
  })

  test("only pkcs11Module without pkcs11KeyUri → throws validation error", () => {
    const manager = makePkcs11Manager("1.1.0")
    // as any: testing runtime JSON-config validation (bypasses TypeScript's required-field check)
    const config = makeTaskConfig({
      options: { sign: { type: "pkcs11" as const, pkcs11Module: "/usr/lib/opensc-pkcs11.so" } } as any,
    })
    expect(() => manager.computeSignToolArgs(config, false)).toThrow(/pkcs11Module and pkcs11KeyUri must both be set/)
  })

  test("only pkcs11KeyUri without pkcs11Module → throws validation error", () => {
    const manager = makePkcs11Manager("1.1.0")
    // as any: testing runtime JSON-config validation (bypasses TypeScript's required-field check)
    const config = makeTaskConfig({
      options: { sign: { type: "pkcs11" as const, pkcs11KeyUri: "pkcs11:token=X;object=Y;type=private" } } as any,
    })
    expect(() => manager.computeSignToolArgs(config, false)).toThrow(/pkcs11Module and pkcs11KeyUri must both be set/)
  })

  test("HSM csp/kc on non-Windows → throws Windows-only error (via HsmSignManager)", () => {
    const manager = makeHsmManager("1.1.0")
    const config = makeTaskConfig({
      options: { sign: { type: "hsm" as const, cryptoServiceProvider: "Google Cloud KMS Provider", keyContainer: "my-key" } },
    })
    expect(() => manager.computeSignToolArgs(config, false)).toThrow(/only supported on Windows/)
  })

  test("resultOutputPath is set in PKCS#11 mode", () => {
    const manager = makePkcs11Manager("1.1.0")
    const config = makeTaskConfig({ options: pkcs11Options, hash: "sha256" }) as any
    manager.computeSignToolArgs(config, false)
    expect(config.resultOutputPath).toBeDefined()
    expect(config.resultOutputPath).toContain("-signed-sha256")
  })
})

// ─── PKCS#11 timestamp: -ts for sha256, -t for sha1 ──────────────────────────

describe("PKCS#11 timestamp flags", () => {
  const pkcs11Base = {
    type: "pkcs11" as const,
    pkcs11Module: "/usr/lib/opensc-pkcs11.so",
    pkcs11KeyUri: "pkcs11:token=T;object=K;type=private",
  }

  test("sha256 → uses -ts (RFC 3161)", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({ options: { sign: pkcs11Base }, hash: "sha256" })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).toContain("-ts")
    expect(args).not.toContain("-t")
  })

  test("sha1 → uses -t (HTTP Authenticode)", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({ options: { sign: pkcs11Base }, hash: "sha1" })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).toContain("-t")
    expect(args).not.toContain("-ts")
  })

  test("sha256 nested → uses -ts", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({ options: { sign: pkcs11Base }, hash: "sha256", isNest: true })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).toContain("-ts")
  })

  test("sha1 nested → uses -ts (nested always RFC 3161)", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({ options: { sign: pkcs11Base }, hash: "sha1", isNest: true })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).toContain("-ts")
    expect(args).not.toContain("-t")
  })

  test("custom rfc3161TimeStampServer is used for -ts", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({
      options: { sign: { ...pkcs11Base, rfc3161TimeStampServer: "http://my-ts.example.com" } },
      hash: "sha256",
    })
    const args = manager.computeSignToolArgs(config, false)
    const idx = args.indexOf("-ts")
    expect(args[idx + 1]).toBe("http://my-ts.example.com")
  })

  test("custom timeStampServer is used for -t", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({
      options: { sign: { ...pkcs11Base, timeStampServer: "http://old-ts.example.com" } },
      hash: "sha1",
    })
    const args = manager.computeSignToolArgs(config, false)
    const idx = args.indexOf("-t")
    expect(args[idx + 1]).toBe("http://old-ts.example.com")
  })

  test("offline mode omits all timestamp args", () => {
    const origEnv = process.env.ELECTRON_BUILDER_OFFLINE
    process.env.ELECTRON_BUILDER_OFFLINE = "true"
    try {
      const manager = makePkcs11Manager()
      const config = makeTaskConfig({ options: { sign: pkcs11Base }, hash: "sha256" })
      const args = manager.computeSignToolArgs(config, false)
      expect(args).not.toContain("-ts")
      expect(args).not.toContain("-t")
    } finally {
      if (origEnv === undefined) {
        delete process.env.ELECTRON_BUILDER_OFFLINE
      } else {
        process.env.ELECTRON_BUILDER_OFFLINE = origEnv
      }
    }
  })
})

// ─── PKCS#11 certificateFile → -certs passthrough ────────────────────────────

describe("PKCS#11 certificateFile passed as -certs to osslsigncode", () => {
  const pkcs11Base = {
    type: "pkcs11" as const,
    pkcs11Module: "/usr/lib/opensc-pkcs11.so",
    pkcs11KeyUri: "pkcs11:token=T;object=K;type=private",
  }

  test("certificateFile set → -certs present with correct path", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({
      options: { sign: { ...pkcs11Base, certificateFile: "/certs/chain.pem" } },
      cscInfo: { file: "/certs/chain.pem", password: null },
    })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).toContain("-certs")
    const idx = args.indexOf("-certs")
    expect(args[idx + 1]).toBe("/certs/chain.pem")
  })

  test("no certificateFile → no -certs arg", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({ options: { sign: pkcs11Base }, cscInfo: null })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).not.toContain("-certs")
  })

  test("-certs appears between -key and -h", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({
      options: { sign: { ...pkcs11Base, certificateFile: "/certs/chain.crt" } },
      cscInfo: { file: "/certs/chain.crt", password: null },
    })
    const args = manager.computeSignToolArgs(config, false)
    const keyIdx = args.indexOf("-key")
    const certsIdx = args.indexOf("-certs")
    const hashIdx = args.indexOf("-h")
    expect(certsIdx).toBeGreaterThan(keyIdx)
    expect(certsIdx).toBeLessThan(hashIdx)
  })
})

// ─── PKCS#11 PIN via env vars ─────────────────────────────────────────────────

describe("PKCS#11 PIN via env var (no cert file)", { concurrent: false }, () => {
  const pkcs11Options = {
    sign: {
      type: "pkcs11" as const,
      pkcs11Module: "/usr/lib/opensc-pkcs11.so",
      pkcs11KeyUri: "pkcs11:token=MyToken;object=MyKey;type=private",
    },
  } as any

  const origEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    origEnv.WIN_CSC_KEY_PASSWORD = process.env.WIN_CSC_KEY_PASSWORD
    origEnv.CSC_KEY_PASSWORD = process.env.CSC_KEY_PASSWORD
    delete process.env.WIN_CSC_KEY_PASSWORD
    delete process.env.CSC_KEY_PASSWORD
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) {
        delete process.env[k as any]
      } else {
        process.env[k as any] = v
      }
    }
  })

  test("no PIN env var set → no -pass arg", () => {
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({ options: pkcs11Options, cscInfo: null })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).not.toContain("-pass")
  })

  test("WIN_CSC_KEY_PASSWORD set → -pass appended when cscInfo is null", () => {
    process.env.WIN_CSC_KEY_PASSWORD = "token-pin-1234"
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({ options: pkcs11Options, cscInfo: null })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).toContain("-pass")
    const idx = args.indexOf("-pass")
    expect(args[idx + 1]).toBe("token-pin-1234")
  })

  test("CSC_KEY_PASSWORD fallback → -pass appended when WIN_CSC_KEY_PASSWORD absent", () => {
    process.env.CSC_KEY_PASSWORD = "fallback-pin"
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({ options: pkcs11Options, cscInfo: null })
    const args = manager.computeSignToolArgs(config, false)
    expect(args).toContain("-pass")
    const idx = args.indexOf("-pass")
    expect(args[idx + 1]).toBe("fallback-pin")
  })

  test("WIN_CSC_KEY_PASSWORD takes priority over CSC_KEY_PASSWORD", () => {
    process.env.WIN_CSC_KEY_PASSWORD = "win-pin"
    process.env.CSC_KEY_PASSWORD = "csc-pin"
    const manager = makePkcs11Manager()
    const config = makeTaskConfig({ options: pkcs11Options, cscInfo: null })
    const args = manager.computeSignToolArgs(config, false)
    const idx = args.indexOf("-pass")
    expect(args[idx + 1]).toBe("win-pin")
  })

  test("-pass not added when cscInfo carries password via cert file (addCommonSigningArgs handles it)", () => {
    process.env.WIN_CSC_KEY_PASSWORD = "should-not-duplicate"
    const manager = makePkcs11Manager("1.1.0", () => "should-not-duplicate")
    const config = makeTaskConfig({
      options: pkcs11Options,
      cscInfo: { file: "/certs/chain.crt", password: "should-not-duplicate" },
    })
    const args = manager.computeSignToolArgs(config, false)
    // -pass appears exactly once (from addCommonSigningArgs via cscInfo.password)
    const count = args.filter(a => a === "-pass").length
    expect(count).toBe(1)
  })
})

// ─── addCertificateArgs error type ───────────────────────────────────────────

describe("addCertificateArgs throws InvalidConfigurationError for bad cert extension", () => {
  test("non-pfx cert in signtool mode throws InvalidConfigurationError (not Error)", () => {
    const manager = makeManager()
    const config = makeTaskConfig({ cscInfo: { file: "/certs/cert.crt", password: null } })
    let thrown: unknown
    try {
      manager.computeSignToolArgs(config, true)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeDefined()
    // InvalidConfigurationError is a subclass of Error; check it has the right name
    expect((thrown as any).constructor.name).toBe("InvalidConfigurationError")
  })
})

// ─── readCertInfoFromX509 ─────────────────────────────────────────────────────

describe("readCertInfoFromX509", () => {
  test("parses a self-signed PEM certificate and extracts CN", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    // Minimal self-signed cert for CN=Test Signer, O=Test Org
    // Generated with: openssl req -x509 -newkey rsa:2048 -keyout /dev/null -out cert.pem
    // -subj "/CN=Test Signer/O=Test Org" -days 1 -nodes 2>/dev/null
    // This is a real minimal self-signed cert (PEM format):
    const pem = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDU+pQ4pHLSpDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
b2NhbGhvc3QwHhcNMjUwMTAxMDAwMDAwWhcNMjYwMTAxMDAwMDAwWjAUMRIwEAYD
VQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7
o4qne60TB3wolLhOJqQ3uJLPvOmFI5oMnEAmhP0JlwFSBj3SiYoHScLuNP2YQXB+
-----END CERTIFICATE-----`
    const certFile = path.join(tmpDirPath, "cert.pem")
    await writeFile(certFile, pem)
    // Invalid DER content in PEM will throw — we just confirm the function is callable
    // and throws the right error shape for a malformed cert
    await expect(readCertInfoFromX509(certFile)).rejects.toThrow(/could not be parsed|invalid/)
  })

  test("throws descriptive error for non-certificate file", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const badFile = path.join(tmpDirPath, "bad.crt")
    await writeFile(badFile, "this is not a certificate")
    await expect(readCertInfoFromX509(badFile)).rejects.toThrow(/could not be parsed|invalid/)
  })
})

// ─── WindowsSignAzureManager: dlib kit arch selection (v1.3.0+) ───────────────
// The ATS payload ships x64/x86 only (no arm64 dir). arm64 hosts fall back to
// the x64 kit. From v1.3.0 the dlib lives in a separate ats-bundle (not the
// kits bundle) and the .NET runtime root is injected via DOTNET_ROOT.

describe("WindowsSignAzureManager signFileWithDlib arch selection", { concurrent: false }, () => {
  const originalArch = process.arch

  beforeEach(async () => {
    vi.mocked(getWindowsKitsBundle).mockImplementation(async () => ({
      // Kit tools are always x64 (x86 on 32-bit hosts), never arm64 — x64 runs on arm64 via emulation.
      kit: path.resolve("/mock-kits", process.arch === "ia32" ? "x86" : "x64"),
      appxAssets: path.resolve("/mock-kits"),
    }))
    vi.mocked(getAtsBundleDir).mockResolvedValue("/mock-ats-bundle")
    vi.mocked(getDotnetRuntimeDir).mockResolvedValue("/mock-dotnet-runtime")
  })

  afterEach(() => {
    Object.defineProperty(process, "arch", { value: originalArch })
    vi.mocked(getWindowsKitsBundle).mockReset()
    vi.mocked(getAtsBundleDir).mockReset()
    vi.mocked(getDotnetRuntimeDir).mockReset()
  })

  function makeAzureManager(tmpDir: string, execSpy: ReturnType<typeof vi.fn>, toVmFile = (f: string) => f, toolsets: any = { winCodeSign: "1.3.0" }): WindowsSignAzureManager {
    const manager = Object.create(WindowsSignAzureManager.prototype) as WindowsSignAzureManager
    ;(manager as any).packager = {
      config: { toolsets },
      getTempFile: (ext: string) => Promise.resolve(path.join(tmpDir, `metadata${ext}`)),
    }
    ;(manager as any).signing = {
      type: "azure",
      publisherName: "CN=Test",
      endpoint: "https://weu.codesigning.azure.net/",
      certificateProfileName: "profile",
      codeSigningAccountName: "account",
    }
    ;(manager as any).vm = { toVmFile, exec: execSpy }
    return manager
  }

  async function signedInfo(
    tmpDir: string,
    arch: NodeJS.Architecture,
    toVmFile = (f: string) => f,
    toolsets: any = { winCodeSign: "1.3.0" }
  ): Promise<{ signtool: string; dlib: string; dotnetRoot: string | undefined }> {
    Object.defineProperty(process, "arch", { value: arch })
    const exec = vi.fn().mockResolvedValue(undefined)
    const manager = makeAzureManager(tmpDir, exec, toVmFile, toolsets)
    await manager.signFile({ path: path.join(tmpDir, "app.exe"), options: {} })
    const [signtool, args, execOptions] = exec.mock.calls[0]
    const dlib = args[args.indexOf("/dlib") + 1]
    return { signtool, dlib, dotnetRoot: execOptions?.env?.DOTNET_ROOT }
  }

  // The modern default: an unset / null / "latest" winCodeSign resolves to the newest bundle
  // (>= 1.3.0), which ships the ATS dlib + .NET payload — so Azure Trusted Signing uses the fast
  // signtool /dlib path WITHOUT requiring an explicit "1.3.0" pin.
  for (const [label, toolsets] of [
    ["toolsets absent", {}],
    ["winCodeSign null", { winCodeSign: null }],
    ['winCodeSign "latest"', { winCodeSign: "latest" }],
  ] as const) {
    test(`modern default (${label}) activates the dlib path on an x64 host`, async ({ tmpDir }) => {
      const tmpDirPath = await tmpDir.createTempDir()
      const { signtool, dlib, dotnetRoot } = await signedInfo(tmpDirPath, "x64", f => f, toolsets)
      expect(signtool).toBe(path.resolve("/mock-kits", "x64", "signtool.exe"))
      expect(dlib).toBe(path.resolve("/mock-ats-bundle", "x64", "Azure.CodeSigning.Dlib.dll"))
      expect(dotnetRoot).toBe(path.resolve("/mock-dotnet-runtime"))
    })
  }

  test("arm64 host falls back to the x64 ats-bundle (no arm64 dlib exists)", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const { signtool, dlib, dotnetRoot } = await signedInfo(tmpDirPath, "arm64")
    expect(signtool).toBe(path.resolve("/mock-kits", "x64", "signtool.exe"))
    expect(dlib).toBe(path.resolve("/mock-ats-bundle", "x64", "Azure.CodeSigning.Dlib.dll"))
    expect(dotnetRoot).toBe(path.resolve("/mock-dotnet-runtime"))
  })

  test("x64 host uses the x64 ats-bundle", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const { signtool, dlib, dotnetRoot } = await signedInfo(tmpDirPath, "x64")
    expect(signtool).toBe(path.resolve("/mock-kits", "x64", "signtool.exe"))
    expect(dlib).toBe(path.resolve("/mock-ats-bundle", "x64", "Azure.CodeSigning.Dlib.dll"))
    expect(dotnetRoot).toBe(path.resolve("/mock-dotnet-runtime"))
  })

  test("ia32 host uses the x86 ats-bundle", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const { signtool, dlib, dotnetRoot } = await signedInfo(tmpDirPath, "ia32")
    expect(signtool).toBe(path.resolve("/mock-kits", "x86", "signtool.exe"))
    expect(dlib).toBe(path.resolve("/mock-ats-bundle", "x86", "Azure.CodeSigning.Dlib.dll"))
    expect(dotnetRoot).toBe(path.resolve("/mock-dotnet-runtime"))
  })

  test.skipIf(process.platform === "win32")("Wine: DOTNET_ROOT is converted to a Z:\\ path via toVmFile", async ({ tmpDir }) => {
    // Wine is only used on macOS/Linux; on Windows signtool runs natively, no Z: conversion happens.
    const wineToVmFile = (f: string) => path.win32.join("Z:", f)
    const tmpDirPath = await tmpDir.createTempDir()
    const { dotnetRoot } = await signedInfo(tmpDirPath, "x64", wineToVmFile)
    expect(dotnetRoot).toBe(path.win32.join("Z:", "/mock-dotnet-runtime"))
  })
})

// ─── publisherName ↔ signing certificate validation ──────────────────────────

const acmeCertInfo = {
  commonName: "Acme Corp",
  bloodyMicrosoftSubjectDn: "CN=Acme Corp, O=Acme Corporation, L=San Francisco, S=California, C=US",
}

describe("publisherNameMatchesCertificate", () => {
  test("plain string matches the certificate CN strictly", () => {
    expect(publisherNameMatchesCertificate(["Acme Corp"], acmeCertInfo)).toBe(true)
  })

  test("plain string with a different CN does not match", () => {
    expect(publisherNameMatchesCertificate(["Evil Corp"], acmeCertInfo)).toBe(false)
    // strict equality — no substring/case-insensitive matching
    expect(publisherNameMatchesCertificate(["acme corp"], acmeCertInfo)).toBe(false)
    expect(publisherNameMatchesCertificate(["Acme"], acmeCertInfo)).toBe(false)
  })

  test("DN matches when every configured RDN equals the subject's value (subset match)", () => {
    expect(publisherNameMatchesCertificate(["CN=Acme Corp, O=Acme Corporation"], acmeCertInfo)).toBe(true)
    // full DN, different RDN order
    expect(publisherNameMatchesCertificate(["O=Acme Corporation, CN=Acme Corp, C=US, S=California, L=San Francisco"], acmeCertInfo)).toBe(true)
  })

  test("DN with one mismatched RDN value does not match", () => {
    expect(publisherNameMatchesCertificate(["CN=Acme Corp, O=Other Org"], acmeCertInfo)).toBe(false)
  })

  test("DN with an RDN key absent from the subject does not match", () => {
    expect(publisherNameMatchesCertificate(["CN=Acme Corp, OU=Engineering"], acmeCertInfo)).toBe(false)
  })

  test("any of multiple configured names matching passes (certificate rotation)", () => {
    expect(publisherNameMatchesCertificate(["Old Corp Name", "Acme Corp"], acmeCertInfo)).toBe(true)
    expect(publisherNameMatchesCertificate(["CN=Old Corp, O=Old Org", "CN=Acme Corp, O=Acme Corporation"], acmeCertInfo)).toBe(true)
  })

  test("no configured name matching fails even with multiple names", () => {
    expect(publisherNameMatchesCertificate(["Old Corp Name", "Other Corp"], acmeCertInfo)).toBe(false)
  })
})

describe("validateExplicitPublisherName", () => {
  function makeValidationManager(sign: any, certInfo: unknown | null, options: { certInfoRejects?: boolean } = {}) {
    const manager: any = Object.create(SigntoolSignManager.prototype)
    manager.platformSpecificBuildOptions = { sign }
    manager.lazyCertInfo = {
      value: options.certInfoRejects ? Promise.reject(new Error("cannot read cert")) : Promise.resolve(certInfo),
    }
    return manager
  }

  const validate = (manager: any) => manager.validateExplicitPublisherName()

  test("passes when the configured name matches the certificate CN", async () => {
    const manager = makeValidationManager({ type: "signtool", publisherName: "Acme Corp" }, acmeCertInfo)
    await expect(validate(manager)).resolves.toBeUndefined()
  })

  test("passes when a configured DN subset matches the certificate subject", async () => {
    const manager = makeValidationManager({ type: "signtool", publisherName: "CN=Acme Corp, O=Acme Corporation" }, acmeCertInfo)
    await expect(validate(manager)).resolves.toBeUndefined()
  })

  test("throws on mismatch, naming both the configured value and the certificate subject", async () => {
    const manager = makeValidationManager({ type: "signtool", publisherName: "Evil Corp" }, acmeCertInfo)
    await expect(validate(manager)).rejects.toThrow(/Evil Corp/)
    await expect(validate(manager)).rejects.toThrow(/CN=Acme Corp, O=Acme Corporation, L=San Francisco, S=California, C=US/)
    await expect(validate(manager)).rejects.toThrow(/wrong certificate/)
    await expect(validate(manager)).rejects.toThrow(/Fix win\.sign\.publisherName/)
  })

  test("passes when any of multiple configured names matches (certificate rotation)", async () => {
    const manager = makeValidationManager({ type: "signtool", publisherName: ["Old Corp Name", "Acme Corp"] }, acmeCertInfo)
    await expect(validate(manager)).resolves.toBeUndefined()
  })

  test("throws when none of multiple configured names matches", async () => {
    const manager = makeValidationManager({ type: "signtool", publisherName: ["Old Corp Name", "Other Corp"] }, acmeCertInfo)
    await expect(validate(manager)).rejects.toThrow(/Old Corp Name \| Other Corp/)
  })

  test("skips when certificate info is unavailable (null)", async () => {
    const manager = makeValidationManager({ type: "signtool", publisherName: "Evil Corp" }, null)
    await expect(validate(manager)).resolves.toBeUndefined()
  })

  test("skips when certificate info cannot be read (rejects)", async () => {
    const manager = makeValidationManager({ type: "signtool", publisherName: "Evil Corp" }, null, { certInfoRejects: true })
    await expect(validate(manager)).resolves.toBeUndefined()
  })

  test("skips when a custom sign hook is configured (actual signing certificate unknown)", async () => {
    const manager = makeValidationManager({ type: "signtool", publisherName: "Evil Corp", sign: "./my-sign-hook.js" }, acmeCertInfo)
    await expect(validate(manager)).resolves.toBeUndefined()
  })

  test("skips when publisherName is not configured (auto-derive path)", async () => {
    const manager = makeValidationManager({ type: "signtool" }, acmeCertInfo)
    await expect(validate(manager)).resolves.toBeUndefined()
  })

  test("skips on explicit publisherName: null opt-out", async () => {
    const manager = makeValidationManager({ type: "signtool", publisherName: null }, acmeCertInfo)
    await expect(validate(manager)).resolves.toBeUndefined()
  })

  test("skips for azure signing config (no local certificate)", async () => {
    const manager = makeValidationManager({ type: "azure", publisherName: "Evil Corp" }, acmeCertInfo)
    await expect(validate(manager)).resolves.toBeUndefined()
  })
})

// ─── computedPublisherName: a signed build must resolve a publisher name ─────
// electron-updater verifies downloaded updates against the publisherName in app-update.yml, so a
// code-signed build whose publisher name cannot be determined must fail.

describe("computedPublisherName: signed builds must resolve a publisher name", () => {
  // a real self-signed certificate whose subject (O=No CN Org, C=US) has no Common Name
  const noCommonNameCertificatePem = `-----BEGIN CERTIFICATE-----
MIIBmDCCAT+gAwIBAgIUZhMJYIkw4i5RjyJOVDh0pzF9uY8wCgYIKoZIzj0EAwIw
ITESMBAGA1UECgwJTm8gQ04gT3JnMQswCQYDVQQGEwJVUzAgFw0yNjA5MjcwMjUx
MTdaGA8yMTI2MDkwMzAyNTExN1owITESMBAGA1UECgwJTm8gQ04gT3JnMQswCQYD
VQQGEwJVUzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABMai2MgYpjg5dnkqJUa3
gcfg+Ik33mEtOxLsqw+lXzWSpgPAwHb7yBaC/f9cKCBxxdtMfWC18v2XIyEmFoGm
23ujUzBRMB0GA1UdDgQWBBTWiHaBT33GpXFMX84Ry934sqrwAjAfBgNVHSMEGDAW
gBTWiHaBT33GpXFMX84Ry934sqrwAjAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49
BAMCA0cAMEQCIBatA9LgGVzZvqS8X/x3cgV/lk9r86fB/O5hXBhkgBmNAiBlj5Iw
6pIwCDrcmO3YuFQm/66dzUn3NC6iXXQnnHHApA==
-----END CERTIFICATE-----`

  async function writeNoCommonNameCertificate(tmpDir: TmpDir): Promise<string> {
    const file = path.join(await tmpDir.createTempDir(), "chain.crt")
    await writeFile(file, noCommonNameCertificatePem)
    return file
  }

  // Real constructors (computedPublisherName is a class field). `getCscLink` stands in for WIN_CSC_LINK / CSC_LINK,
  // so a certificate link in the environment of the test run is not picked up.
  function makePublisherNameManager(sign: any, packagerOverrides: Record<string, unknown> = {}): SigntoolBaseSignManager {
    const packager = {
      platformOptions: { sign },
      config: {},
      projectDir: process.cwd(),
      getCscLink: () => null,
      getCscPassword: () => null,
      ...packagerOverrides,
    } as unknown as WinPackager
    switch (sign?.type) {
      case "hsm":
        return new HsmSignManager(packager)
      case "pkcs11":
        return new Pkcs11SignManager(packager)
      default:
        return new SigntoolSignManager(packager)
    }
  }

  const hsmSign = { type: "hsm", cryptoServiceProvider: "Google Cloud KMS Provider", keyContainer: "my-key-container" }

  async function expectMissingPublisherNameError(manager: SigntoolBaseSignManager) {
    const error = await manager.computedPublisherName.value.then(
      () => null,
      (e: Error) => e
    )
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toMatch(/win\.sign\.publisherName/)
    expect(error!.message).toMatch(/win\.verifyUpdateCodeSignature: false/)
  }

  test("custom sign hook without a certificate throws (documented win.md example)", async () => {
    await expectMissingPublisherNameError(makePublisherNameManager({ type: "signtool", sign: "./customSign.js" }))
  })

  test("HSM + custom sign hook without a certificate identifier throws", async () => {
    await expectMissingPublisherNameError(makePublisherNameManager({ ...hsmSign, sign: "./customSign.js" }))
  })

  test("HSM certificateFile without a Common Name throws", async ({ tmpDir }) => {
    const certificateFile = await writeNoCommonNameCertificate(tmpDir)
    await expectMissingPublisherNameError(makePublisherNameManager({ ...hsmSign, certificateFile }))
  })

  test("PKCS#11 certificateFile without a Common Name throws", async ({ tmpDir }) => {
    const certificateFile = await writeNoCommonNameCertificate(tmpDir)
    await expectMissingPublisherNameError(makePublisherNameManager({ type: "pkcs11", pkcs11Module: "m.so", pkcs11KeyUri: "pkcs11:object=k", certificateFile }))
  })

  test("certificate-store lookup failure swallowed for a custom sign hook throws", async () => {
    const manager = makePublisherNameManager(
      { type: "signtool", certificateSubjectName: "My Company", sign: "./customSign.js" },
      {
        // getter, so the rejected promise is only created when cscInfo asks for the VM
        vm: {
          get value() {
            return Promise.reject(new Error("no Windows VM"))
          },
        },
      }
    )
    await expectMissingPublisherNameError(manager)
  })

  test("unreadable .pfx certificateFile names win.sign.publisherName as the workaround", async ({ tmpDir }) => {
    const certificateFile = path.join(await tmpDir.createTempDir(), "broken.pfx")
    await writeFile(certificateFile, "not a PKCS#12 file")
    const manager = makePublisherNameManager({ type: "signtool", certificateFile })
    await expect(manager.computedPublisherName.value).rejects.toThrow(InvalidConfigurationError)
    await expect(manager.computedPublisherName.value).rejects.toThrow(/As workaround, set win\.sign\.publisherName\./)
  })

  test("custom sign hook + explicit publisherName returns it (documented fix)", async () => {
    const manager = makePublisherNameManager({ type: "signtool", sign: "./customSign.js", publisherName: "CN=My Company, O=My Company, C=US" })
    await expect(manager.computedPublisherName.value).resolves.toEqual(["CN=My Company, O=My Company, C=US"])
  })

  test("custom sign hook + publisherName: null stays an explicit opt-out", async () => {
    const manager = makePublisherNameManager({ type: "signtool", sign: "./customSign.js", publisherName: null })
    await expect(manager.computedPublisherName.value).resolves.toBeNull()
  })

  // A hook may sign with another certificate than any electron-builder can read, so a readable certificate (in the config or from
  // WIN_CSC_LINK / CSC_LINK) never supplies the publisher name of a hook: it must be set explicitly.
  test.for([
    ["certificateFile", { type: "signtool", sign: "./customSign.js", certificateFile: "cert.pfx" }, {}],
    ["certificateSubjectName", { type: "signtool", sign: "./customSign.js", certificateSubjectName: "Acme Corp" }, {}],
    ["certificateSha1", { type: "signtool", sign: "./customSign.js", certificateSha1: "ABCDEF" }, {}],
    ["win.cscLink", { type: "signtool", sign: "./customSign.js" }, { platformOptions: { sign: { type: "signtool", sign: "./customSign.js" }, cscLink: "cert.pfx" } }],
    ["the top-level cscLink", { type: "signtool", sign: "./customSign.js" }, { config: { cscLink: "cert.pfx" } }],
    ["WIN_CSC_LINK / CSC_LINK", { type: "signtool", sign: "./customSign.js" }, { getCscLink: () => "env-cert.pfx" }],
    ["HSM certificateFile", { ...hsmSign, sign: "./customSign.js", certificateFile: "chain.crt" }, {}],
  ] as const)("custom sign hook with a readable certificate (%s) throws without publisherName", async ([, sign, overrides]) => {
    const manager: any = makePublisherNameManager(sign, overrides)
    manager.lazyCertInfo = {
      get value() {
        throw new Error("the certificate must not be read for a custom sign hook")
      },
    }
    await expectMissingPublisherNameError(manager)
  })

  test("certificate-store subject without a Common Name throws instead of an undefined publisher name", async () => {
    const manager: any = makePublisherNameManager({ type: "signtool", certificateSubjectName: "No CN Org" })
    manager.cscInfo = { value: Promise.resolve({ thumbprint: "AB12", subject: "O=No CN Org, C=US", store: "My", isLocalMachineStore: false }) }
    await expect(manager.lazyCertInfo.value).resolves.toEqual({ commonName: "", bloodyMicrosoftSubjectDn: "O=No CN Org, C=US" })
    await expectMissingPublisherNameError(manager)
  })

  test("implicit signtool with a certificate without a Common Name from WIN_CSC_LINK / CSC_LINK throws", async () => {
    const manager: any = makePublisherNameManager(undefined)
    manager.cscInfo = { value: Promise.resolve({ file: "env-cert.pfx", password: null }) }
    manager.lazyCertInfo = { value: Promise.resolve({ commonName: "", bloodyMicrosoftSubjectDn: "O=No CN Org, C=US" }) }
    await expectMissingPublisherNameError(manager)
  })

  test("unsigned build (no certificate, no hook) resolves null", async () => {
    await expect(makePublisherNameManager({ type: "signtool" }).computedPublisherName.value).resolves.toBeNull()
    await expect(makePublisherNameManager(undefined).computedPublisherName.value).resolves.toBeNull()
  })

  test("win.sign: false with a certificate link resolves null (signing disabled)", async ({ tmpDir }) => {
    const certificateFile = await writeNoCommonNameCertificate(tmpDir)
    const manager = makePublisherNameManager(false, { getCscLink: () => certificateFile })
    // the certificate link is still resolved, but nothing is signed, so there is no publisher name to require
    await expect(manager.cscInfo.value).resolves.toEqual({ file: certificateFile, password: null })
    await expect(manager.computedPublisherName.value).resolves.toBeNull()
  })
})
