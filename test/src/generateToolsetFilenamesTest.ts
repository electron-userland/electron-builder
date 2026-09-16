import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, beforeAll } from "vitest"
import { generateTests } from "../vitest-scripts/generate-tests"
import { GENERATED_TESTS_DIR } from "../vitest-scripts/runtime-tests/generate-toolset-tests-shared"
import { detectFilePlatforms, getAllTestFiles, isE2eTestFile, platformAllowed } from "../vitest-scripts/vitest-config/file-discovery"
import { resolveCachedMs } from "../vitest-scripts/vitest-config/shard-builder"
import type { FileStats } from "../vitest-scripts/vitest-config/cache"
import { getTestFilesOverride, type SupportedPlatforms } from "../vitest-scripts/vitest-config/smart-config"

// Collect all generated test filenames recursively (`*Test.ts` and `*.e2e.ts`)
function collectGeneratedFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectGeneratedFiles(full))
    } else if (entry.name.endsWith("Test.ts") || isE2eTestFile(entry.name)) {
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
    const platforms = detectFilePlatforms("test/src/mac/macArchive.e2e.ts")
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

  it("all generated files end with Test.ts or e2e.ts (discoverable)", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      expect(path.basename(f), `${f} must end with Test.ts, .e2e.ts or __e2e.ts`).toMatch(/(?:Test|\.e2e|__e2e)\.ts$/)
    }
  })

  // Suites that build and inspect installers are emitted as `*.e2e.ts` (TEST_MODE=e2e); the platform suffix
  // logic is unchanged, so `.win.e2e.ts` and `__e2e.ts` both occur.
  it("installer-building suites are emitted as .e2e.ts files, app-directory suites as Test.ts files", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    const e2eSuites = ["portable", "assistedInstaller", "msi", "msiWrapped", "squirrelWindows", "appx", "msix", "differentialWin", "blackboxWin", "nsisWine"]
    for (const suite of e2eSuites) {
      const suiteFiles = files.filter(f => f.includes(`/${suite}/`))
      expect(suiteFiles.length, `${suite} should have generated files`).toBeGreaterThan(0)
      for (const f of suiteFiles) {
        expect(isE2eTestFile(f), `${f} must be an e2e file (.e2e.ts / __e2e.ts)`).toBe(true)
        expect(path.basename(f), `${suite} file must not end with Test.ts`).not.toMatch(/Test\.ts$/)
      }
    }
    const unitSuites = ["winPackager", "winCodeSign", "wineToolset", "linuxPackager", "blackboxLinux", "differentialLinux"]
    for (const suite of unitSuites) {
      const suiteFiles = files.filter(f => f.includes(`/${suite}/`))
      expect(suiteFiles.length, `${suite} should have generated files`).toBeGreaterThan(0)
      for (const f of suiteFiles) {
        expect(path.basename(f), `${suite} file must end with Test.ts`).toMatch(/Test\.ts$/)
      }
    }
    expect(
      files.some(f => f.endsWith(".win.e2e.ts")),
      "a .win. gated e2e suite (portable)"
    ).toBe(true)
    expect(
      files.some(f => f.endsWith("__e2e.ts")),
      "an ungated e2e suite (nsisWine, assistedInstaller)"
    ).toBe(true)
    // the wine dimension is stripped from the snapshot path, so both wine variants share `<stem>__e2e.js.snap`
    expect(files.some(f => f.endsWith("__wine-0.0.0__e2e.ts") && f.includes("/assistedInstaller/"))).toBe(true)
  })

  it("platformAllowed honours the .win. infix on .e2e.ts files", () => {
    const winE2eFiles = collectGeneratedFiles(GENERATED_TESTS_DIR).filter(f => f.endsWith(".win.e2e.ts"))
    expect(winE2eFiles.length).toBeGreaterThan(0)
    for (const f of winE2eFiles) {
      expect(platformAllowed(f, "linux"), `${f} must not be allowed on Linux`).toBe(false)
      expect(platformAllowed(f, "darwin"), `${f} must not be allowed on macOS`).toBe(false)
      expect(platformAllowed(f, "win32"), `${f} must be allowed on win32`).toBe(true)
    }
  })
})

describe("TEST_MODE file discovery", () => {
  beforeAll(() => {
    generateTests()
  })

  // TEST_FILES forces inclusion regardless of mode, so the partition only holds without a real override (a blank
  // TEST_FILES, as docker/run-tests.sh passes for an unset variable, is not one).
  const withoutOverride = getTestFilesOverride() ? it.skip : it

  for (const platform of ["linux", "darwin", "win32"] as SupportedPlatforms[]) {
    withoutOverride(`unit and e2e are disjoint and partition all on ${platform}`, () => {
      const all = getAllTestFiles(platform, "all")
      const unit = getAllTestFiles(platform, "unit")
      const e2e = getAllTestFiles(platform, "e2e")

      expect(unit.length).toBeGreaterThan(0)
      expect(e2e.length).toBeGreaterThan(0)
      expect(unit.filter(f => e2e.includes(f))).toEqual([])
      expect([...unit, ...e2e].sort()).toEqual([...all].sort())
      for (const f of e2e) {
        expect(isE2eTestFile(f), `${f} selected by TEST_MODE=e2e must be a .e2e.ts file`).toBe(true)
      }
      for (const f of unit) {
        expect(isE2eTestFile(f), `${f} selected by TEST_MODE=unit must not be a .e2e.ts file`).toBe(false)
      }
    })
  }

  // docker/run-tests.sh forwards `-e TEST_FILES="${TEST_FILES:-}"`, so an unset variable reaches discovery as "". That must
  // behave exactly like unset: `"".split(",")` → `[""]` would make every directory entry (helpers, .sh, dockerfiles) an
  // "override match" and inflate the file universe (253 files / 14 shards on Linux instead of 201 / 11).
  it('TEST_FILES="" (blank) is not an override and discovers the same files as unset', () => {
    const original = process.env.TEST_FILES
    try {
      delete process.env.TEST_FILES
      expect(getTestFilesOverride()).toBeUndefined()
      const unset = getAllTestFiles("linux", "all")

      for (const blank of ["", "   ", " , ,"]) {
        process.env.TEST_FILES = blank
        expect(getTestFilesOverride(), `TEST_FILES=${JSON.stringify(blank)}`).toBeUndefined()
        expect(getAllTestFiles("linux", "all"), `TEST_FILES=${JSON.stringify(blank)}`).toEqual(unset)
      }
      expect(unset.some(f => f.endsWith("/helpers/packTester.ts") || f.endsWith(".sh"))).toBe(false)

      process.env.TEST_FILES = " snapHeavy , webInstaller "
      expect(getTestFilesOverride()).toEqual(["snapHeavy", "webInstaller"])
    } finally {
      if (original == null) {
        delete process.env.TEST_FILES
      } else {
        process.env.TEST_FILES = original
      }
    }
  })

  it("hand-written e2e files are discovered next to their unit-level siblings", () => {
    const e2e = getAllTestFiles("linux", "e2e")
    expect(e2e).toContain("test/src/windows/oneClickInstaller.e2e.ts")
    expect(e2e).toContain("test/src/PublishManager.e2e.ts")
    const unit = getAllTestFiles("linux", "unit")
    expect(unit).toContain("test/src/windows/oneClickInstallerTest.ts")
    expect(unit).toContain("test/src/PublishManagerTest.ts")
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
