import { afterEach, beforeEach } from "vitest"
import type { ToolsetCustom } from "app-builder-lib/internal"
import * as os from "os"
import * as path from "path"
import { mkdir, rm, writeFile } from "fs/promises"
import { getWineToolset } from "app-builder-lib/src/toolsets/win/wine"

// Unit tests for wine env merging via ToolsetCustom with a file:// directory path.
// A minimal fake wine directory is created in /tmp for each test.

const FAKE_WINE_DIR = path.join(os.tmpdir(), "wine-env-unit-test")

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

const ENV_KEYS = ["DYLD_FALLBACK_LIBRARY_PATH", "LD_LIBRARY_PATH", "USE_SYSTEM_WINE"]
const SAVED_ENV: Record<string, string | undefined> = {}

beforeEach(async () => {
  for (const k of ENV_KEYS) {
    SAVED_ENV[k] = process.env[k]
  }
  await setupFakeWineDir()
  delete process.env.USE_SYSTEM_WINE
})

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = SAVED_ENV[k]
    }
  }
  await rm(FAKE_WINE_DIR, { recursive: true, force: true })
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
