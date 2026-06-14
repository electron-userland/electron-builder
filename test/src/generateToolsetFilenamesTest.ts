import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, beforeAll } from "vitest"
import { generateTests } from "../vitest-scripts/generate-tests"
import { GENERATED_TESTS_DIR } from "../vitest-scripts/runtime-tests/generate-toolset-tests-shared"
import { platformAllowed } from "../vitest-scripts/vitest-config/file-discovery"

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
    // These suites use ifWindowsOrWine chain → no platform marker (run natively on Windows; via Wine on macOS/Linux)
    const universalSuites = ["linuxPackager", "winPackager", "blackboxWin", "wineToolset", "assistedInstaller"]
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
    expect(wineFiles.length).toBe(1)
    expect(wineFiles.some(f => f.includes("wine-0.0.0"))).toBe(true)
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

  it("all generated Test.ts files end with Test.ts (discoverable)", () => {
    const files = collectGeneratedFiles(GENERATED_TESTS_DIR)
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      expect(path.basename(f), `${f} must end with Test.ts`).toMatch(/Test\.ts$/)
    }
  })
})
