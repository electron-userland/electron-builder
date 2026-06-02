import { promises as fsp } from "fs"
import * as os from "os"
import * as path from "path"
import { afterEach, beforeEach } from "vitest"
import { checkMakensisOutput, verifyInstallerSize } from "app-builder-lib/src/targets/nsis/nsisValidation"
import type { Defines } from "app-builder-lib/src/targets/nsis/Defines"

// ─── checkMakensisOutput ────────────────────────────────────────────────────

describe("checkMakensisOutput", () => {
  test("passes when stdout and stderr are empty", ({ expect }) => {
    expect(() => checkMakensisOutput("", "")).not.toThrow()
  })

  test("passes when NSIS prints normal progress with no errors", ({ expect }) => {
    const stdout = "Processing: installer.nsi\nInstall: 1 file (123 KB)\n"
    expect(() => checkMakensisOutput(stdout, "")).not.toThrow()
  })

  test("throws when stderr contains an Error: line", ({ expect }) => {
    const stderr = "Error: can't write 67108864 bytes to output\nError - aborting creation process\n"
    expect(() => checkMakensisOutput("", stderr)).toThrow()
  })

  test("throws when stderr has mixed output with an Error: line", ({ expect }) => {
    const stderr = "Processing plugins\nError: out of disk space\n"
    expect(() => checkMakensisOutput("", stderr)).toThrow()
  })

  test("does not throw for stderr lines that merely contain the word error", ({ expect }) => {
    // Only lines *starting* with "Error:" (case-insensitive) are treated as fatal
    const stderr = "warning: deprecated function used in installer\nno errors found\n"
    expect(() => checkMakensisOutput("", stderr)).not.toThrow()
  })

  test("Error: matching is case-insensitive on stderr", ({ expect }) => {
    const stderr = "ERROR: some fatal condition\n"
    expect(() => checkMakensisOutput("", stderr)).toThrow()
  })

  test("passes when stdout has non-matching content", ({ expect }) => {
    const stdout = "Processing: installer.nsi\nOutput: installer.exe\nInstall data: 100 / 200 bytes\n"
    expect(() => checkMakensisOutput(stdout, "")).not.toThrow()
  })
})

// ─── verifyInstallerSize ────────────────────────────────────────────────────

describe("verifyInstallerSize", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "eb-nsis-test-"))
  })

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  async function writeFile(name: string, size: number): Promise<string> {
    const p = path.join(tmpDir, name)
    await fsp.writeFile(p, Buffer.alloc(size))
    return p
  }

  function baseDefines(): Defines {
    return {
      APP_ID: "test",
      APP_GUID: "test-guid",
      UNINSTALL_APP_KEY: "test-key",
      PRODUCT_NAME: "Test",
      PRODUCT_FILENAME: "test",
      APP_FILENAME: "test",
      APP_DESCRIPTION: "Test",
      VERSION: "1.0.0",
      PROJECT_DIR: tmpDir,
      BUILD_RESOURCES_DIR: tmpDir,
      APP_PACKAGE_NAME: "test",
    }
  }

  test("passes when no archive defines are present", async ({ expect }) => {
    const outFile = await writeFile("installer.exe", 1024)
    const defines = baseDefines()
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("passes when installer is larger than single archive", async ({ expect }) => {
    const archive = await writeFile("app.7z", 1000)
    const outFile = await writeFile("installer.exe", 5000)
    const defines = { ...baseDefines(), APP_64: archive }
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("passes when installer exactly equals archive size", async ({ expect }) => {
    const archive = await writeFile("app.7z", 1000)
    const outFile = await writeFile("installer.exe", 1000)
    const defines = { ...baseDefines(), APP_64: archive }
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("throws when installer is smaller than single archive", async ({ expect }) => {
    const archive = await writeFile("app.7z", 5000)
    const outFile = await writeFile("installer.exe", 1000)
    const defines = { ...baseDefines(), APP_64: archive }
    await expect(verifyInstallerSize(outFile, defines)).rejects.toThrow(/1000.*5000|smaller/i)
  })

  test("throws when installer is smaller than sum of x64 and x86 archives", async ({ expect }) => {
    const archive64 = await writeFile("app-x64.7z", 3000)
    const archive32 = await writeFile("app-x86.7z", 2000)
    const outFile = await writeFile("installer.exe", 4000) // 4000 < 5000
    const defines = { ...baseDefines(), APP_64: archive64, APP_32: archive32 }
    await expect(verifyInstallerSize(outFile, defines)).rejects.toThrow(/smaller/i)
  })

  test("passes when installer covers sum of x64 and x86 archives", async ({ expect }) => {
    const archive64 = await writeFile("app-x64.7z", 3000)
    const archive32 = await writeFile("app-x86.7z", 2000)
    const outFile = await writeFile("installer.exe", 6000) // 6000 >= 5000
    const defines = { ...baseDefines(), APP_64: archive64, APP_32: archive32 }
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("throws a descriptive error when installer file does not exist", async ({ expect }) => {
    const archive = await writeFile("app.7z", 5000)
    const defines = { ...baseDefines(), APP_64: archive }
    const missingOut = path.join(tmpDir, "missing.exe")
    await expect(verifyInstallerSize(missingOut, defines)).rejects.toThrow(/not created/i)
  })

  test("skips size check when archive path does not exist", async ({ expect }) => {
    const outFile = await writeFile("installer.exe", 100)
    const defines = { ...baseDefines(), APP_64: path.join(tmpDir, "nonexistent.7z") }
    // nonexistent archive → archiveSize stays 0 → no check performed
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("includes ARM64 archive in size calculation", async ({ expect }) => {
    const archiveArm64 = await writeFile("app-arm64.7z", 4000)
    const outFile = await writeFile("installer.exe", 3000)
    const defines = { ...baseDefines(), APP_ARM64: archiveArm64 }
    await expect(verifyInstallerSize(outFile, defines)).rejects.toThrow(/smaller/i)
  })

  test("passes when installer covers all three arch archives combined", async ({ expect }) => {
    const a64 = await writeFile("app-x64.7z", 2000)
    const a32 = await writeFile("app-x86.7z", 1000)
    const aArm64 = await writeFile("app-arm64.7z", 1500)
    const outFile = await writeFile("installer.exe", 5000) // 5000 >= 4500
    const defines = { ...baseDefines(), APP_64: a64, APP_32: a32, APP_ARM64: aArm64 }
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("throws when installer is smaller than all three arch archives combined", async ({ expect }) => {
    const a64 = await writeFile("app-x64.7z", 2000)
    const a32 = await writeFile("app-x86.7z", 1000)
    const aArm64 = await writeFile("app-arm64.7z", 1500)
    const outFile = await writeFile("installer.exe", 4000) // 4000 < 4500
    const defines = { ...baseDefines(), APP_64: a64, APP_32: a32, APP_ARM64: aArm64 }
    await expect(verifyInstallerSize(outFile, defines)).rejects.toThrow(/smaller/i)
  })

  test("error message from missing file contains the outFile path", async ({ expect }) => {
    const archive = await writeFile("app.7z", 5000)
    const defines = { ...baseDefines(), APP_64: archive }
    const missingOut = path.join(tmpDir, "missing.exe")
    await expect(verifyInstallerSize(missingOut, defines)).rejects.toThrow("missing.exe")
  })
})
