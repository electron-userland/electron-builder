import { afterEach, beforeEach } from "vitest"
import type { ToolsetCustom } from "app-builder-lib/internal"
import * as path from "path"
import { mkdir, rm, writeFile } from "fs/promises"
import { getWineToolset } from "app-builder-lib/src/toolsets/wine"

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
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = SAVED_ENV[k]
    }
  }
})

describe.ifNotWindows("getWineToolset — ToolsetCustom file:// directory env merging", { sequential: true }, () => {
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

  test("custom bundle with only bin/wine64: falls back to bin/wine64 as execPath", async ({ expect }) => {
    await rm(path.join(FAKE_WINE_DIR, "bin", "wine"))
    await writeFile(path.join(FAKE_WINE_DIR, "bin", "wine64"), "#!/bin/sh\necho fake wine64", { mode: 0o755 })

    const result = await getWineToolset(fakeToolset(), "")
    expect(result.execPath).toBe(path.join(FAKE_WINE_DIR, "bin", "wine64"))
  })
})

const HOST_WINE_ENV = { WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d" }

describe.ifNotWindows('getWineToolset — "system"', { sequential: true }, () => {
  test("resolves the host wine on PATH and downloads no bundle", async ({ expect }) => {
    const result = await getWineToolset("system", "")
    expect(result.execPath).toBe("wine")
  })

  test("sets no WINEPREFIX or library paths, so the host wine uses its own defaults", async ({ expect }) => {
    const result = await getWineToolset("system", "")
    expect(result.env).toStrictEqual(HOST_WINE_ENV)
  })
})

// The default resolves to the host wine on every platform — no bundle is downloaded unless the config
// names a version explicitly. Guards against `"latest"` falling through to the bundle branch, which
// would resolve a `wine@<default>` release that does not exist.
describe.ifNotWindows("getWineToolset — default resolution", { sequential: true }, () => {
  for (const [label, wine] of [
    ["undefined", undefined],
    ["null", null],
    ['"latest"', "latest"],
  ] as const) {
    test(`${label} resolves to the host wine on PATH`, async ({ expect }) => {
      const result = await getWineToolset(wine, "")
      expect(result.execPath).toBe("wine")
      expect(result.env).toStrictEqual(HOST_WINE_ENV)
    })
  }
})
