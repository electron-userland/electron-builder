import { promises as fsp } from "fs"
import * as path from "path"
import { checkMakensisOutput, verifyInstallerSize } from "app-builder-lib/internal"
import type { Defines } from "app-builder-lib/internal"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { getMakeNsisPath } from "app-builder-lib/src/toolsets/nsis"
import { spawnAndWriteWithOutput } from "builder-util"
import { afterEach, vi } from "vitest"

// makensis itself is stubbed for the environment test below; the checks above never start it
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, spawnAndWriteWithOutput: vi.fn(), ensureNotBusy: vi.fn() }
})

vi.mock("app-builder-lib/src/toolsets/nsis", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/toolsets/nsis")>()
  return { ...actual, getMakeNsisPath: vi.fn() }
})

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
  async function writeFile(dir: string, name: string, size: number): Promise<string> {
    const p = path.join(dir, name)
    await fsp.writeFile(p, Buffer.alloc(size))
    return p
  }

  function baseDefines(dir: string): Defines {
    return {
      APP_ID: "test",
      APP_GUID: "test-guid",
      UNINSTALL_APP_KEY: "test-key",
      PRODUCT_NAME: "Test",
      PRODUCT_FILENAME: "test",
      APP_FILENAME: "test",
      APP_DESCRIPTION: "Test",
      VERSION: "1.0.0",
      PROJECT_DIR: dir,
      BUILD_RESOURCES_DIR: dir,
      APP_PACKAGE_NAME: "test",
    }
  }

  test("passes when no archive defines are present", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const outFile = await writeFile(tmpDirPath, "installer.exe", 1024)
    const defines = baseDefines(tmpDirPath)
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("passes when installer is larger than single archive", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const archive = await writeFile(tmpDirPath, "app.7z", 1000)
    const outFile = await writeFile(tmpDirPath, "installer.exe", 5000)
    const defines = { ...baseDefines(tmpDirPath), APP_64: archive }
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("passes when installer exactly equals archive size", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const archive = await writeFile(tmpDirPath, "app.7z", 1000)
    const outFile = await writeFile(tmpDirPath, "installer.exe", 1000)
    const defines = { ...baseDefines(tmpDirPath), APP_64: archive }
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("throws when installer is smaller than single archive", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const archive = await writeFile(tmpDirPath, "app.7z", 5000)
    const outFile = await writeFile(tmpDirPath, "installer.exe", 1000)
    const defines = { ...baseDefines(tmpDirPath), APP_64: archive }
    await expect(verifyInstallerSize(outFile, defines)).rejects.toThrow(/1000.*5000|smaller/i)
  })

  test("throws when installer is smaller than sum of x64 and x86 archives", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const archive64 = await writeFile(tmpDirPath, "app-x64.7z", 3000)
    const archive32 = await writeFile(tmpDirPath, "app-x86.7z", 2000)
    const outFile = await writeFile(tmpDirPath, "installer.exe", 4000) // 4000 < 5000
    const defines = { ...baseDefines(tmpDirPath), APP_64: archive64, APP_32: archive32 }
    await expect(verifyInstallerSize(outFile, defines)).rejects.toThrow(/smaller/i)
  })

  test("passes when installer covers sum of x64 and x86 archives", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const archive64 = await writeFile(tmpDirPath, "app-x64.7z", 3000)
    const archive32 = await writeFile(tmpDirPath, "app-x86.7z", 2000)
    const outFile = await writeFile(tmpDirPath, "installer.exe", 6000) // 6000 >= 5000
    const defines = { ...baseDefines(tmpDirPath), APP_64: archive64, APP_32: archive32 }
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("throws a descriptive error when installer file does not exist", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const archive = await writeFile(tmpDirPath, "app.7z", 5000)
    const defines = { ...baseDefines(tmpDirPath), APP_64: archive }
    const missingOut = path.join(tmpDirPath, "missing.exe")
    await expect(verifyInstallerSize(missingOut, defines)).rejects.toThrow(/not created/i)
  })

  test("skips size check when archive path does not exist", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const outFile = await writeFile(tmpDirPath, "installer.exe", 100)
    const defines = { ...baseDefines(tmpDirPath), APP_64: path.join(tmpDirPath, "nonexistent.7z") }
    // nonexistent archive → archiveSize stays 0 → no check performed
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("includes ARM64 archive in size calculation", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const archiveArm64 = await writeFile(tmpDirPath, "app-arm64.7z", 4000)
    const outFile = await writeFile(tmpDirPath, "installer.exe", 3000)
    const defines = { ...baseDefines(tmpDirPath), APP_ARM64: archiveArm64 }
    await expect(verifyInstallerSize(outFile, defines)).rejects.toThrow(/smaller/i)
  })

  test("passes when installer covers all three arch archives combined", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const a64 = await writeFile(tmpDirPath, "app-x64.7z", 2000)
    const a32 = await writeFile(tmpDirPath, "app-x86.7z", 1000)
    const aArm64 = await writeFile(tmpDirPath, "app-arm64.7z", 1500)
    const outFile = await writeFile(tmpDirPath, "installer.exe", 5000) // 5000 >= 4500
    const defines = { ...baseDefines(tmpDirPath), APP_64: a64, APP_32: a32, APP_ARM64: aArm64 }
    await expect(verifyInstallerSize(outFile, defines)).resolves.not.toThrow()
  })

  test("throws when installer is smaller than all three arch archives combined", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const a64 = await writeFile(tmpDirPath, "app-x64.7z", 2000)
    const a32 = await writeFile(tmpDirPath, "app-x86.7z", 1000)
    const aArm64 = await writeFile(tmpDirPath, "app-arm64.7z", 1500)
    const outFile = await writeFile(tmpDirPath, "installer.exe", 4000) // 4000 < 4500
    const defines = { ...baseDefines(tmpDirPath), APP_64: a64, APP_32: a32, APP_ARM64: aArm64 }
    await expect(verifyInstallerSize(outFile, defines)).rejects.toThrow(/smaller/i)
  })

  test("error message from missing file contains the outFile path", async ({ expect, tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const archive = await writeFile(tmpDirPath, "app.7z", 5000)
    const defines = { ...baseDefines(tmpDirPath), APP_64: archive }
    const missingOut = path.join(tmpDirPath, "missing.exe")
    await expect(verifyInstallerSize(missingOut, defines)).rejects.toThrow("missing.exe")
  })
})

// ─── makensis environment ───────────────────────────────────────────────────

describe("makensis environment", { concurrent: false }, () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("publish credentials are removed; signing variables and the toolset's own variables are kept", async ({ expect }) => {
    vi.stubEnv("GH_TOKEN", "gh-secret")
    vi.stubEnv("GITHUB_TOKEN", "actions-secret")
    vi.stubEnv("BITBUCKET_TOKEN", "bitbucket-secret")
    vi.stubEnv("CF_R2_SECRET_ACCESS_KEY", "r2-secret")
    vi.stubEnv("SNAPCRAFT_STORE_CREDENTIALS", "snap-secret")
    // Windows env names are case-insensitive
    vi.stubEnv("Keygen_Token", "keygen-secret")
    // `!finalize` / `!uninstfinalize` commands run with the makensis environment and may sign
    vi.stubEnv("WIN_CSC_KEY_PASSWORD", "csc-password")
    vi.stubEnv("AZURE_CLIENT_SECRET", "azure-secret")
    vi.mocked(getMakeNsisPath).mockResolvedValueOnce({ path: "/nsis/makensis", env: { NSISDIR: "/nsis" } })
    const spawn = vi.mocked(spawnAndWriteWithOutput)
    spawn.mockResolvedValueOnce({ stdout: "", stderr: "" })

    const target = { options: {}, packager: { config: {}, buildResourcesDir: "/build", debugLogger: { isEnabled: false } }, nsisToolsetOptions: {} }
    // BUILD_UNINSTALLER: no installer size check after the (stubbed) compile
    await (NsisTarget.prototype as any).executeMakensis.call(target, { BUILD_UNINSTALLER: null }, { OutFile: '"/out/installer.exe"' }, "")

    expect(spawn).toHaveBeenCalledTimes(1)
    const env = spawn.mock.calls[0][3]?.env ?? {}
    const names = Object.keys(env).map(it => it.toUpperCase())
    for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "BITBUCKET_TOKEN", "CF_R2_SECRET_ACCESS_KEY", "SNAPCRAFT_STORE_CREDENTIALS", "KEYGEN_TOKEN"]) {
      expect(names).not.toContain(name)
    }
    expect(env).toMatchObject({ WIN_CSC_KEY_PASSWORD: "csc-password", AZURE_CLIENT_SECRET: "azure-secret", NSISDIR: "/nsis" })
  })
})
