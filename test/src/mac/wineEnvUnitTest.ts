import { afterEach, beforeEach, vi } from "vitest"
import type { ToolsetCustom } from "app-builder-lib/internal"
import * as path from "path"
import { mkdir, rm, writeFile } from "fs/promises"
import { Executables, InvalidConfigurationError } from "builder-util"
import { getWineToolset } from "app-builder-lib/src/toolsets/wine"
import { defaultExecutableLocations } from "builder-util/src/executables"
const HOST_WINE = "/usr/bin/wine"

// Unit tests for wine env merging via ToolsetCustom with a file:// directory path.
// A minimal fake wine directory is created in /tmp for each test.

let FAKE_WINE_DIR = ""

function fakeToolset(): ToolsetCustom {
  return { url: `file://${FAKE_WINE_DIR}`, checksum: "test" }
}

async function setupFakeWineDir(): Promise<void> {
  // Minimal structure expected by createWineEnvironment: bin/wine, wine-home/, lib/
  await mkdir(path.join(FAKE_WINE_DIR, "bin"), { recursive: true })
  await mkdir(path.join(FAKE_WINE_DIR, "wine-home"), { recursive: true })
  await mkdir(path.join(FAKE_WINE_DIR, "lib"), { recursive: true })
  await writeFile(path.join(FAKE_WINE_DIR, "bin", "wine"), "#!/bin/sh\necho fake wine", { mode: 0o755 })
}

const ENV_KEYS = ["DYLD_FALLBACK_LIBRARY_PATH", "LD_LIBRARY_PATH"]
const SAVED_ENV: Record<string, string | undefined> = {}

beforeEach(async context => {
  for (const k of ENV_KEYS) {
    SAVED_ENV[k] = process.env[k]
  }
  FAKE_WINE_DIR = await context.tmpDir.createTempDir()
  await setupFakeWineDir()
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = SAVED_ENV[k]
    }
  }
})

describe.ifNotWindows("getWineToolset — ToolsetCustom file:// directory env merging", { concurrent: false }, () => {
  test("DYLD_FALLBACK_LIBRARY_PATH includes the wine lib dir", async ({ expect }) => {
    delete process.env.DYLD_FALLBACK_LIBRARY_PATH
    const result = await getWineToolset(fakeToolset(), "")
    expect(result.env.DYLD_FALLBACK_LIBRARY_PATH).toContain(path.join(FAKE_WINE_DIR, "lib"))
  })

  test("DYLD_FALLBACK_LIBRARY_PATH merges with existing process env — no duplication", async ({ expect }) => {
    process.env.DYLD_FALLBACK_LIBRARY_PATH = "/usr/local/lib"
    const result = await getWineToolset(fakeToolset(), "")
    const parts = result.env.DYLD_FALLBACK_LIBRARY_PATH.split(path.delimiter)
    expect(parts).toContain(path.join(FAKE_WINE_DIR, "lib"))
    expect(parts).toContain("/usr/local/lib")
    expect(parts.filter(p => p === "/usr/local/lib")).toHaveLength(1)
  })

  test("LD_LIBRARY_PATH includes the wine lib dir", async ({ expect }) => {
    delete process.env.LD_LIBRARY_PATH
    const result = await getWineToolset(fakeToolset(), "")
    expect(result.env.LD_LIBRARY_PATH).toContain(path.join(FAKE_WINE_DIR, "lib"))
  })

  test("LD_LIBRARY_PATH merges with existing process env", async ({ expect }) => {
    process.env.LD_LIBRARY_PATH = "/opt/mylibs"
    const result = await getWineToolset(fakeToolset(), "")
    const parts = result.env.LD_LIBRARY_PATH.split(path.delimiter)
    expect(parts).toContain(path.join(FAKE_WINE_DIR, "lib"))
    expect(parts).toContain("/opt/mylibs")
    expect(parts.filter(p => p === "/opt/mylibs")).toHaveLength(1)
  })

  test("execPath points into the fake toolset bin directory (bin/wine)", async ({ expect }) => {
    const result = await getWineToolset(fakeToolset(), "")
    expect(result.execPath).toBe(path.join(FAKE_WINE_DIR, "bin", "wine"))
  })

  test("WINEPREFIX is set to the wine-home directory inside the toolset", async ({ expect }) => {
    const result = await getWineToolset(fakeToolset(), "")
    expect(result.env.WINEPREFIX).toBe(path.join(FAKE_WINE_DIR, "wine-home"))
  })

  test("custom bundle without its wine-home prefix is a configuration error", async ({ expect }) => {
    await rm(path.join(FAKE_WINE_DIR, "wine-home"), { recursive: true })
    const result = getWineToolset(fakeToolset(), "")
    await expect(result).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(result).rejects.toThrow("is missing expected path")
  })

  test("custom bundle with only bin/wine64: falls back to bin/wine64 as execPath", async ({ expect }) => {
    await rm(path.join(FAKE_WINE_DIR, "bin", "wine"))
    await writeFile(path.join(FAKE_WINE_DIR, "bin", "wine64"), "#!/bin/sh\necho fake wine64", { mode: 0o755 })

    const result = await getWineToolset(fakeToolset(), "")
    expect(result.execPath).toBe(path.join(FAKE_WINE_DIR, "bin", "wine64"))
  })
})

describe.ifNotWindows('getWineToolset — "system"', { concurrent: false }, () => {
  beforeEach(() => {
    // the host wine is taken only from toolsets.executables.wine or its default install locations; stand in for it being installed
    vi.spyOn(Executables, "resolve").mockReturnValue(HOST_WINE)
  })

  test("resolves the host wine through toolsets.executables.wine and downloads no bundle", async ({ expect }) => {
    const result = await getWineToolset("system", "")
    expect(result.execPath).toBe(HOST_WINE)
    expect(vi.mocked(Executables.resolve)).toHaveBeenCalledWith("wine")
  })

  test("sets no WINEPREFIX or library paths, so the host wine uses its own defaults", async ({ expect }) => {
    const result = await getWineToolset("system", "")
    expect(result.env).toStrictEqual({ WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d" })
  })

  // `null` / `undefined` / "latest" are aliases for WINE_LATEST. Resolving that alias only inside the
  // download branch made every bundle request ask for a `wine@<WINE_LATEST>` release that does not
  // exist, so assert the alias reaches the same place an explicit "system" does.
  for (const value of [undefined, null, "latest"] as const) {
    test(`${value} resolves through the WINE_LATEST alias without downloading`, async ({ expect }) => {
      const result = await getWineToolset(value, "")
      expect(result.execPath).toBe(HOST_WINE)
    })
  }

  test("is the configuration error of the resolver when wine is not installed", async ({ expect }) => {
    const error = new InvalidConfigurationError("wine is not installed at its default install locations")
    vi.mocked(Executables.resolve).mockImplementation(() => {
      throw error
    })
    await expect(getWineToolset("system", "")).rejects.toBe(error)
  })

  test("looks in the order of the default PATH", ({ expect }) => {
    const linux = defaultExecutableLocations("wine", "linux")
    expect(linux.indexOf("/usr/local/bin/wine")).toBeLessThan(linux.indexOf("/usr/bin/wine"))
    const darwin = defaultExecutableLocations("wine", "darwin")
    expect(darwin.slice(0, 2)).toEqual(["/opt/homebrew/bin/wine", "/usr/local/bin/wine"])
    expect(darwin.findIndex(it => it.startsWith("/Applications/"))).toBeGreaterThan(darwin.indexOf("/opt/local/bin/wine"))
  })
})
