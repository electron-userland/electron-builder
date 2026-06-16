import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, beforeAll } from "vitest"
import { generateTests } from "../vitest-scripts/generate-tests"
import { GENERATED_TESTS_DIR } from "../vitest-scripts/runtime-tests/generate-toolset-tests-shared"
import { detectFilePlatforms, platformAllowed } from "../vitest-scripts/vitest-config/file-discovery"
import { resolveCachedMs } from "../vitest-scripts/vitest-config/shard-builder"
import type { FileStats } from "../vitest-scripts/vitest-config/cache"

// Collect all generated test filenames recursively
function collectGeneratedFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectGeneratedFiles(full))
    } else if (entry.name.endsWith("Test.ts")) {
      results.push(full.split(path.sep).join("/"))
    }
  }
  return results
}

describe("Generated toolset test filenames", () => {
  beforeAll(() => {
    generateTests()
  })

  it("files for ifWindows suites have .win. marker", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    const winOnlySuites = ["portable", "msi", "msiWrapped", "squirrelWindows", "appx", "differentialWin"]
    for (const suite of winOnlySuites) {
      const suiteFiles = files.filter(f => f.includes(`/${suite}/`))
      expect(suiteFiles.length, `${suite} should have generated files`).toBeGreaterThan(0)
      for (const f of suiteFiles) {
        expect(f, `${suite} file must contain .win.`).toContain(".win.")
      }
    }
  })

  it("files for ifLinux suites have .linux. marker", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    const linuxOnlySuites = ["blackboxLinux", "differentialLinux"]
    for (const suite of linuxOnlySuites) {
      const suiteFiles = files.filter(f => f.includes(`/${suite}/`))
      expect(suiteFiles.length, `${suite} should have generated files`).toBeGreaterThan(0)
      for (const f of suiteFiles) {
        expect(f, `${suite} file must contain .linux.`).toContain(".linux.")
      }
    }
  })

  it("cross-platform suites have no platform marker", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    // No platform marker → discovered everywhere. winPackager/assistedInstaller use ifWindowsOrWine
    // (native on Windows, via Wine on Linux); linuxPackager/wineToolset/nsisWine use ifNotWindows.
    const universalSuites = ["linuxPackager", "winPackager", "blackboxWin", "wineToolset", "assistedInstaller", "nsisWine"]
    for (const suite of universalSuites) {
      const suiteFiles = files.filter(f => f.includes(`/${suite}/`))
      expect(suiteFiles.length, `${suite} should have generated files`).toBeGreaterThan(0)
      for (const f of suiteFiles) {
        expect(f, `${suite} file must not contain .win.`).not.toContain(".win.")
        expect(f, `${suite} file must not contain .linux.`).not.toContain(".linux.")
        expect(f, `${suite} file must not contain .mac.`).not.toContain(".mac.")
      }
    }
  })

  it("wineToolset suite generates one file per wine version", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    const wineFiles = files.filter(f => f.includes("/wineToolset/"))
    expect(wineFiles.length).toBe(2)
    expect(wineFiles.some(f => f.includes("wine-0.0.0"))).toBe(true)
    expect(wineFiles.some(f => f.includes("wine-1.0.1"))).toBe(true)
  })

  it("nsisWine suite generates one file per wine version", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    const nsisWineFiles = files.filter(f => f.includes("/nsisWine/"))
    expect(nsisWineFiles.length).toBe(2)
    expect(nsisWineFiles.some(f => f.includes("wine-0.0.0"))).toBe(true)
    expect(nsisWineFiles.some(f => f.includes("wine-1.0.1"))).toBe(true)
  })

  it("platformAllowed correctly filters ifWindows files on Linux", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    const winFiles = files.filter(f => f.includes(".win."))
    expect(winFiles.length).toBeGreaterThan(0)
    for (const f of winFiles) {
      expect(platformAllowed(f, "linux"), `${f} must not be allowed on Linux`).toBe(false)
      expect(platformAllowed(f, "darwin"), `${f} must not be allowed on macOS`).toBe(false)
      expect(platformAllowed(f, "win32"), `${f} must be allowed on win32`).toBe(true)
    }
  })

  it("platformAllowed correctly filters ifLinux files on Windows and macOS", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    const linuxFiles = files.filter(f => f.includes(".linux."))
    expect(linuxFiles.length).toBeGreaterThan(0)
    for (const f of linuxFiles) {
      expect(platformAllowed(f, "win32"), `${f} must not be allowed on win32`).toBe(false)
      expect(platformAllowed(f, "darwin"), `${f} must not be allowed on darwin`).toBe(false)
      expect(platformAllowed(f, "linux"), `${f} must be allowed on linux`).toBe(true)
    }
  })

  // A file whose only platform infix is absent but whose entire suite is runtime-gated
  // (e.g. `describe.heavy.ifLinux(...)`) must be dropped from the other platforms' shard plans.
  it("detectFilePlatforms gates a whole-file ifLinux suite to linux only", () => {
    const platforms = detectFilePlatforms("test/src/updater/blackboxInstallTest.ts")
    expect(platforms).not.toBeNull()
    expect([...platforms!].sort()).toEqual(["linux"])
  })

  it("detectFilePlatforms gates a whole-file ifMac suite to darwin only", () => {
    const platforms = detectFilePlatforms("test/src/mac/masTest.ts")
    expect(platforms).not.toBeNull()
    expect([...platforms!].sort()).toEqual(["darwin"])
  })

  // Union across top-level blocks: ifMac + ifNotWindows ⇒ runs on darwin and linux, skips win32.
  it("detectFilePlatforms unions mixed gates and only excludes the common platform", () => {
    const platforms = detectFilePlatforms("test/src/mac/macArchiveTest.ts")
    expect(platforms).not.toBeNull()
    expect([...platforms!].sort()).toEqual(["darwin", "linux"])
  })

  // A file with even one ungated top-level block must stay on every platform (no silent drop).
  it("detectFilePlatforms returns null when a top-level block is ungated", () => {
    expect(detectFilePlatforms("test/src/updater/baseUpdaterUnitTest.ts")).toBeNull()
    expect(detectFilePlatforms("test/src/BuildTest.ts")).toBeNull()
  })

  it("platformAllowed drops a runtime-gated ifLinux file from non-linux shard plans", () => {
    const file = "test/src/updater/blackboxInstallTest.ts"
    expect(platformAllowed(file, "linux")).toBe(true)
    expect(platformAllowed(file, "darwin")).toBe(false)
    expect(platformAllowed(file, "win32")).toBe(false)
  })

  it("all generated Test.ts files end with Test.ts (discoverable)", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      expect(path.basename(f), `${f} must end with Test.ts`).toMatch(/Test\.ts$/)
    }
  })
})

describe("resolveCachedMs", () => {
  const statWith = (linux: { runs: number; avgMs: number }): FileStats => ({
    platformRuns: {
      win32: { runs: 0, fails: 0, avgMs: 0 },
      darwin: { runs: 0, fails: 0, avgMs: 0 },
      linux: { ...linux, fails: 0 },
    },
  })

  it("keeps a genuine measured 0 ms (runs > 0) instead of treating it as unknown", () => {
    expect(resolveCachedMs(statWith({ runs: 3, avgMs: 0 }), "linux")).toBe(0)
  })

  it("returns the measured avg when the platform has runs", () => {
    expect(resolveCachedMs(statWith({ runs: 2, avgMs: 1234 }), "linux")).toBe(1234)
  })

  it("returns undefined when the platform has never run (runs === 0)", () => {
    expect(resolveCachedMs(statWith({ runs: 0, avgMs: 0 }), "linux")).toBeUndefined()
    expect(resolveCachedMs(statWith({ runs: 5, avgMs: 999 }), "win32")).toBeUndefined()
  })

  it("returns undefined for a missing stat or missing platformRuns", () => {
    expect(resolveCachedMs(undefined, "linux")).toBeUndefined()
    expect(resolveCachedMs({}, "linux")).toBeUndefined()
  })
})
