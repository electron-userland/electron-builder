import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import yargs from "yargs"

// ─── Module mocks (hoisted by vitest above all imports) ───────────────────────

vi.mock("app-builder-lib/out/util/electronGet", () => ({
  getCacheDirectory: vi.fn().mockReturnValue("/home/user/.cache/electron-builder"),
}))

vi.mock("fs/promises", async () => {
  const actual = await vi.importActual<typeof import("fs/promises")>("fs/promises")
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("readline/promises", () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn().mockResolvedValue("y"),
    close: vi.fn(),
  })),
}))

// Keep real InvalidConfigurationError and ExecError for instanceof checks in wrap()
vi.mock("builder-util", async () => {
  const actual = await vi.importActual<typeof import("builder-util")>("builder-util")
  return {
    ...actual,
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  }
})

vi.mock("app-builder-lib/out/util/config/load", () => ({
  loadEnv: vi.fn().mockResolvedValue(undefined),
}))

// ─── Imports ──────────────────────────────────────────────────────────────────

import { access, rm } from "fs/promises"
import { createInterface } from "readline/promises"
import { getCacheDirectory } from "app-builder-lib/out/util/electronGet"
import { ExecError, InvalidConfigurationError, log } from "builder-util"
// Relative imports bypass project-reference declaration files, which strip @internal exports
import { clearCache } from "../../packages/electron-builder/src/cli/clear-cache"
import { wrap } from "../../packages/electron-builder/src/cli/cli-util"
import { quoteString } from "../../packages/electron-builder/src/cli/create-self-signed-cert"
import { configureBuildCommand } from "../../packages/electron-builder/src/builder"
// @ts-ignore — configureInstallAppDepsCommand is @internal; CLI tsc strips it from declarations
import { configureInstallAppDepsCommand } from "../../packages/electron-builder/src/cli/install-app-deps"
// @ts-ignore — configurePublishCommand is @internal; CLI tsc strips it from declarations
import { configurePublishCommand } from "../../packages/electron-builder/src/publish"

// ─── clearCache ───────────────────────────────────────────────────────────────

describe("clearCache", () => {
  beforeEach(() => {
    vi.mocked(getCacheDirectory).mockReturnValue("/home/user/.cache/electron-builder")
    vi.mocked(access).mockResolvedValue(undefined as any)
    vi.mocked(rm).mockResolvedValue(undefined as any)
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue("y"),
      close: vi.fn(),
    } as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test("calls getCacheDirectory with isAvoidSystemOnWindows=false, allowEnvVarOverride=false", async () => {
    await clearCache()
    expect(getCacheDirectory).toHaveBeenCalledWith(false, false)
  })

  test("deletes cache dir when it exists and user confirms", async () => {
    await clearCache()
    expect(rm).toHaveBeenCalledWith("/home/user/.cache/electron-builder", { recursive: true })
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ cacheDir: expect.any(String) }), "cache cleared")
  })

  test("checks both existence and write permission before prompting", async () => {
    await clearCache()
    expect(access).toHaveBeenCalledWith("/home/user/.cache/electron-builder", expect.any(Number))
  })

  test("does not delete and logs when cache dir does not exist", async () => {
    vi.mocked(access).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
    await clearCache()
    expect(rm).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ cacheDir: expect.any(String) }),
      "cache directory does not exist, nothing to clear"
    )
  })

  test("does not delete when cache dir is not writable and logs error", async () => {
    vi.mocked(access).mockRejectedValue(Object.assign(new Error("EACCES"), { code: "EACCES" }))
    await clearCache()
    expect(rm).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ cacheDir: expect.any(String) }), "cache directory is not writable")
  })

  test("propagates error thrown by rm", async () => {
    vi.mocked(rm).mockRejectedValue(new Error("rm failed"))
    await expect(clearCache()).rejects.toThrow("rm failed")
  })

  test("aborts and logs error when cache dir resolves to filesystem root", async () => {
    vi.mocked(getCacheDirectory).mockReturnValue("/")
    await clearCache()
    expect(rm).not.toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ cacheDir: "/" }),
      expect.stringContaining("filesystem root")
    )
  })

  test("closes readline interface even when user aborts", async () => {
    const closeSpy = vi.fn()
    vi.mocked(createInterface).mockReturnValue({
      question: vi.fn().mockResolvedValue("n"),
      close: closeSpy,
    } as any)
    await clearCache()
    expect(closeSpy).toHaveBeenCalled()
  })

  for (const answer of ["y", "Y", "yes", "Yes", "YES", "  y  "]) {
    test(`proceeds when user answers "${answer}"`, async () => {
      vi.mocked(createInterface).mockReturnValue({
        question: vi.fn().mockResolvedValue(answer),
        close: vi.fn(),
      } as any)
      await clearCache()
      expect(rm).toHaveBeenCalled()
    })
  }

  for (const answer of ["n", "N", "no", "", "   ", "maybe"]) {
    test(`aborts when user answers "${answer}"`, async () => {
      vi.mocked(createInterface).mockReturnValue({
        question: vi.fn().mockResolvedValue(answer),
        close: vi.fn(),
      } as any)
      await clearCache()
      expect(rm).not.toHaveBeenCalled()
      expect(log.info).toHaveBeenCalledWith(null, "aborted")
    })
  }
})

// ─── wrap ─────────────────────────────────────────────────────────────────────

describe("wrap", () => {
  const savedExitCode = process.exitCode

  beforeEach(() => {
    process.env.NO_UPDATE_NOTIFIER = "1"
    process.exitCode = undefined as any
  })

  afterEach(() => {
    delete process.env.NO_UPDATE_NOTIFIER
    process.exitCode = savedExitCode as any
    vi.clearAllMocks()
  })

  test("invokes task with the provided args", async () => {
    const task = vi.fn().mockResolvedValue("result")
    await wrap(task)({ foo: "bar" })
    expect(task).toHaveBeenCalledWith({ foo: "bar" })
    expect(process.exitCode).toBeUndefined()
  })

  test("sets exitCode=1 and logs message only for InvalidConfigurationError", async () => {
    const task = vi.fn().mockRejectedValue(new InvalidConfigurationError("bad config"))
    await wrap(task)({})
    expect(process.exitCode).toBe(1)
    expect(log.error).toHaveBeenCalledWith(null, "bad config")
  })

  test("sets exitCode=1 but does not re-log ExecError when alreadyLogged=true", async () => {
    const err = new ExecError("cmd", 1, "", "")
    err.alreadyLogged = true
    const task = vi.fn().mockRejectedValue(err)
    await wrap(task)({})
    expect(process.exitCode).toBe(1)
    expect(log.error).not.toHaveBeenCalled()
  })

  test("logs ExecError with stack trace when alreadyLogged=false", async () => {
    const err = new ExecError("cmd", 1, "out", "err output")
    const task = vi.fn().mockRejectedValue(err)
    await wrap(task)({})
    expect(process.exitCode).toBe(1)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ stackTrace: expect.any(String) }),
      expect.any(String)
    )
  })

  test("logs stack trace for generic errors", async () => {
    const err = new Error("something went wrong")
    const task = vi.fn().mockRejectedValue(err)
    await wrap(task)({})
    expect(process.exitCode).toBe(1)
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ stackTrace: expect.any(String) }),
      "something went wrong"
    )
  })
})

// ─── quoteString ─────────────────────────────────────────────────────────────

describe("quoteString", () => {
  test("returns string unchanged when no special characters", () => {
    expect(quoteString("Acme Corp")).toBe("Acme Corp")
  })

  test("wraps in double quotes when string contains a comma", () => {
    expect(quoteString("Acme, Corp")).toBe('"Acme, Corp"')
  })

  test("escapes double quotes and wraps", () => {
    expect(quoteString('Acme "Corp"')).toBe('"Acme \\"Corp\\""')
  })

  test("handles both comma and double quote", () => {
    expect(quoteString('Acme, "Corp"')).toBe('"Acme, \\"Corp\\""')
  })

  test("returns empty string unchanged", () => {
    expect(quoteString("")).toBe("")
  })
})

// ─── Command configuration ───────────────────────────────────────────────────

function makeYargs() {
  return yargs([] as string[])
    .exitProcess(false)
    .fail((msg: string, err: Error) => {
      throw err ?? new Error(msg)
    })
}

describe("configureBuildCommand", () => {
  test("registers --x64 and --arm64 as boolean arch flags", () => {
    const instance = makeYargs()
    configureBuildCommand(instance)
    const parsed = instance.parseSync(["--x64", "--arm64"])
    expect(parsed.x64).toBe(true)
    expect(parsed.arm64).toBe(true)
  })

  test("registers --mac as an array platform flag", () => {
    const instance = makeYargs()
    configureBuildCommand(instance)
    const parsed = instance.parseSync(["--mac", "dmg", "--mac", "zip"])
    expect(parsed.mac).toEqual(["dmg", "zip"])
  })

  test("registers --linux and --win as array platform flags", () => {
    const instance = makeYargs()
    configureBuildCommand(instance)
    const parsed = instance.parseSync(["--linux", "deb"])
    expect(parsed.linux).toEqual(["deb"])
  })

  test("registers --dir as boolean flag", () => {
    const instance = makeYargs()
    configureBuildCommand(instance)
    const parsed = instance.parseSync(["--dir"])
    expect(parsed.dir).toBe(true)
  })

  test("registers --config / -c option", () => {
    const instance = makeYargs()
    configureBuildCommand(instance)
    const parsed = instance.parseSync(["-c", "my.config.js"])
    expect(parsed.config).toBe("my.config.js")
  })
})

describe("configureInstallAppDepsCommand", () => {
  test("registers --platform with linux/darwin/win32 choices", () => {
    const instance = makeYargs()
    configureInstallAppDepsCommand(instance)
    expect(() => instance.parseSync(["--platform", "invalid"])).toThrow()
  })

  test("accepts valid --platform values", () => {
    for (const platform of ["linux", "darwin", "win32"]) {
      const instance = makeYargs()
      configureInstallAppDepsCommand(instance)
      const parsed = instance.parseSync(["--platform", platform])
      expect(parsed.platform).toBe(platform)
    }
  })

  test("registers --arch option", () => {
    const instance = makeYargs()
    configureInstallAppDepsCommand(instance)
    const parsed = instance.parseSync(["--arch", "x64"])
    expect(parsed.arch).toBe("x64")
  })
})

describe("configurePublishCommand", () => {
  test("throws when --files is not provided", () => {
    const instance = makeYargs()
    configurePublishCommand(instance)
    expect(() => instance.parseSync([])).toThrow()
  })

  test("accepts --files with multiple paths", () => {
    const instance = makeYargs()
    configurePublishCommand(instance)
    const parsed = instance.parseSync(["--files", "app.dmg", "--files", "app.exe"])
    expect(parsed.files).toEqual(["app.dmg", "app.exe"])
  })

  test("registers --policy with valid choices", () => {
    const instance = makeYargs()
    configurePublishCommand(instance)
    expect(() => instance.parseSync(["--files", "app.dmg", "--policy", "invalid"])).toThrow()
  })

  test("accepts valid --policy values", () => {
    for (const policy of ["onTag", "onTagOrDraft", "always", "never"]) {
      const instance = makeYargs()
      configurePublishCommand(instance)
      const parsed = instance.parseSync(["--files", "app.dmg", "--policy", policy])
      expect(parsed.policy).toBe(policy)
    }
  })
})
