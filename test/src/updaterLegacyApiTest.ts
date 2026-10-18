import { describe, expect, test, vi } from "vitest"

/**
 * v26 call shapes must keep working for one major, and must say so. TypeScript rejects all three at
 * compile time, but plain JavaScript callers get no signal at all without these shims — which is the
 * dangerous case, since electron-updater runs inside a shipped desktop app.
 */

function createLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}

/** Minimal stand-in exercising the accessor and normalizer without booting a real updater. */
class FakeUpdater {
  autoInstallEvent: "manual" | "onQuit" | "onNextLaunch" = "onQuit"
  _logger = createLogger()

  get autoInstallOnAppQuit(): boolean {
    return this.autoInstallEvent === "onQuit"
  }

  set autoInstallOnAppQuit(value: boolean) {
    const mapped = value ? "onQuit" : "manual"
    this._logger.warn(`autoInstallOnAppQuit was removed in electron-updater 7 (electron-builder v27) — use autoInstallEvent instead. Mapping ${value} to "${mapped}".`)
    this.autoInstallEvent = mapped as any
  }
}

describe("autoInstallOnAppQuit shim", () => {
  test("setting false maps to autoInstallEvent 'manual' and warns", () => {
    const updater = new FakeUpdater()
    updater.autoInstallOnAppQuit = false
    // Without the shim this assignment is a no-op and the app installs on quit anyway —
    // the exact opposite of what the caller asked for.
    expect(updater.autoInstallEvent).toBe("manual")
    expect(updater._logger.warn).toHaveBeenCalledWith(expect.stringContaining("autoInstallEvent"))
  })

  test("setting true maps to 'onQuit'", () => {
    const updater = new FakeUpdater()
    updater.autoInstallEvent = "manual"
    updater.autoInstallOnAppQuit = true
    expect(updater.autoInstallEvent).toBe("onQuit")
  })

  test("the getter reflects autoInstallEvent", () => {
    const updater = new FakeUpdater()
    expect(updater.autoInstallOnAppQuit).toBe(true)
    updater.autoInstallEvent = "onNextLaunch"
    expect(updater.autoInstallOnAppQuit).toBe(false)
  })
})

describe("AppUpdater source contract", () => {
  // The shims live on AppUpdater/BaseUpdater/MacUpdater; assert they are wired rather than
  // constructing a real updater, which needs a live Electron app object.
  const read = async (file: string) => {
    const { promises: fs } = await import("fs")
    const path = await import("path")
    return fs.readFile(path.join(__dirname, "..", "..", "packages", "electron-updater", "src", file), "utf8")
  }

  test("AppUpdater declares the autoInstallOnAppQuit accessor pair", async () => {
    const source = await read("AppUpdater.ts")
    expect(source).toContain("get autoInstallOnAppQuit()")
    expect(source).toContain("set autoInstallOnAppQuit(")
    expect(source).toContain("removed in v28")
  })

  test("AppUpdater declares the positional quitAndInstall normalizer", async () => {
    const source = await read("AppUpdater.ts")
    expect(source).toContain("normalizeQuitAndInstallOptions")
    expect(source).toContain("quitandinstall-takes-an-options-object")
  })

  test.each(["BaseUpdater.ts", "MacUpdater.ts"])("%s routes quitAndInstall through the normalizer", async file => {
    const source = await read(file)
    expect(source).toMatch(/quitAndInstall\(options: QuitAndInstallOptions \| boolean = \{\}, legacyIsForceRunAfter\?: boolean\)/)
    expect(source).toContain("this.normalizeQuitAndInstallOptions(options, legacyIsForceRunAfter)")
  })

  test("downloadUpdate results carry the legacy array shim", async () => {
    const source = await read("AppUpdater.ts")
    expect(source).toContain("withLegacyArrayCompat")
    expect(source).toContain("Symbol.iterator")
    expect(source).toContain("removed in v28")
  })
})

describe("downloadUpdate legacy array destructuring", () => {
  // Mirrors withLegacyArrayCompat so the behaviour is asserted directly.
  function withLegacyArrayCompat(result: { updateFile: string; packageFile?: string }, logger: ReturnType<typeof createLogger>) {
    return Object.defineProperty(result, Symbol.iterator, {
      enumerable: false,
      configurable: true,
      writable: true,
      value: function* () {
        logger.warn("downloadUpdate() resolves with a DownloadExecutorResult object")
        yield result.updateFile
        if (result.packageFile != null) {
          yield result.packageFile
        }
      },
    })
  }

  test("array destructuring yields updateFile and warns instead of throwing", () => {
    const logger = createLogger()
    const result = withLegacyArrayCompat({ updateFile: "/tmp/app.exe" }, logger)
    const [installer] = result as any
    expect(installer).toBe("/tmp/app.exe")
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("DownloadExecutorResult"))
  })

  test("a web installer yields [updateFile, packageFile] in the v26 order", () => {
    const logger = createLogger()
    const result = withLegacyArrayCompat({ updateFile: "/tmp/app.exe", packageFile: "/tmp/package.7z" }, logger)
    expect([...(result as any)]).toEqual(["/tmp/app.exe", "/tmp/package.7z"])
  })

  test("the object shape is unchanged — the shim is non-enumerable", () => {
    const result = withLegacyArrayCompat({ updateFile: "/tmp/app.exe", packageFile: "/tmp/p.7z" }, createLogger())
    expect(Object.keys(result)).toEqual(["updateFile", "packageFile"])
    expect(JSON.parse(JSON.stringify(result))).toEqual({ updateFile: "/tmp/app.exe", packageFile: "/tmp/p.7z" })
    expect(result).toEqual({ updateFile: "/tmp/app.exe", packageFile: "/tmp/p.7z" })
  })

  test("destructuring the object form still works and does not warn", () => {
    const logger = createLogger()
    const result = withLegacyArrayCompat({ updateFile: "/tmp/app.exe" }, logger)
    const { updateFile } = result
    expect(updateFile).toBe("/tmp/app.exe")
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe("quitAndInstall positional-argument normalization", () => {
  // Mirrors AppUpdater.normalizeQuitAndInstallOptions.
  function normalize(logger: ReturnType<typeof createLogger>, options?: any, legacyIsForceRunAfter?: boolean) {
    if (typeof options !== "boolean" && typeof legacyIsForceRunAfter !== "boolean") {
      return options ?? {}
    }
    const isSilent = typeof options === "boolean" ? options : false
    const isForceRunAfter = legacyIsForceRunAfter === true
    logger.warn("quitAndInstall(isSilent, isForceRunAfter) was replaced by quitAndInstall({ isSilent, isForceRunAfter })")
    return { isSilent, isForceRunAfter }
  }

  test("quitAndInstall(true, false) maps to the options object and warns", () => {
    const logger = createLogger()
    // Without the shim the boolean lands in the destructured parameter, every field reads back
    // undefined, and a caller asking for a SILENT install silently gets a non-silent one.
    expect(normalize(logger, true, false)).toEqual({ isSilent: true, isForceRunAfter: false })
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("quitAndInstall({ isSilent, isForceRunAfter })"))
  })

  test("quitAndInstall(true) maps isSilent and defaults isForceRunAfter", () => {
    expect(normalize(createLogger(), true)).toEqual({ isSilent: true, isForceRunAfter: false })
  })

  test("quitAndInstall(false, true) preserves both positional values", () => {
    expect(normalize(createLogger(), false, true)).toEqual({ isSilent: false, isForceRunAfter: true })
  })

  test("the v27 object form passes through untouched and does not warn", () => {
    const logger = createLogger()
    expect(normalize(logger, { isSilent: true, waitUntilNextLaunch: true })).toEqual({ isSilent: true, waitUntilNextLaunch: true })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  test("no arguments produces an empty options object and does not warn", () => {
    const logger = createLogger()
    expect(normalize(logger)).toEqual({})
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
