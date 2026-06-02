import { mkdir, lstat, readlink, rm } from "fs/promises"
import * as os from "os"
import * as path from "path"
import { describe, expect, test, afterEach, beforeEach } from "vitest"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronMacUtils = require("../../../packages/app-builder-lib/out/electron/electronMacUtils") as {
  addHelperCompatSymlinks(suffixes: string[], frameworksPath: string, appName: string, brandingName: string): Promise<void>
  assertSafeHelperName(name: string, label: string): void
  getAvailableHelperSuffixes(
    helperEHPlist: object | null,
    helperNPPlist: object | null,
    helperRendererPlist: object | null,
    helperPluginPlist: object | null,
    helperGPUPlist: object | null
  ): string[]
}

const { addHelperCompatSymlinks, assertSafeHelperName, getAvailableHelperSuffixes } = electronMacUtils

// ─────────────────────────────────────────────────────────────────────────────
// assertSafeHelperName
// ─────────────────────────────────────────────────────────────────────────────

describe("assertSafeHelperName", () => {
  const cases: [string, boolean][] = [
    ["MyApp", false],
    ["My App", false],
    ["My-App", false],
    ["My.App", false],
    ["My App (Beta)", false],
    ["Electron", false],
    // path separator characters must throw
    ["My/App", true],
    ["My\\App", true],
    // null byte must throw
    ["My\0App", true],
    // forward-slash disguised as component
    ["../evil", true],
    ["../../etc/passwd", true],
  ]

  test.each(cases)('name="%s" throws=%s', (name, shouldThrow) => {
    if (shouldThrow) {
      expect(() => assertSafeHelperName(name, "Product name")).toThrow()
    } else {
      expect(() => assertSafeHelperName(name, "Product name")).not.toThrow()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getAvailableHelperSuffixes
// ─────────────────────────────────────────────────────────────────────────────

describe("getAvailableHelperSuffixes", () => {
  const dummy = {} as any

  test("only basic helper when all optional plists are null", () => {
    expect(getAvailableHelperSuffixes(null, null, null, null, null)).toEqual([" Helper"])
  })

  test("includes EH when helperEHPlist is present", () => {
    const result = getAvailableHelperSuffixes(dummy, null, null, null, null)
    expect(result).toContain(" Helper EH")
    expect(result).toContain(" Helper")
  })

  test("includes NP when helperNPPlist is present", () => {
    expect(getAvailableHelperSuffixes(null, dummy, null, null, null)).toContain(" Helper NP")
  })

  test("includes (Renderer) when helperRendererPlist is present", () => {
    expect(getAvailableHelperSuffixes(null, null, dummy, null, null)).toContain(" Helper (Renderer)")
  })

  test("includes (Plugin) when helperPluginPlist is present", () => {
    expect(getAvailableHelperSuffixes(null, null, null, dummy, null)).toContain(" Helper (Plugin)")
  })

  test("includes (GPU) when helperGPUPlist is present", () => {
    expect(getAvailableHelperSuffixes(null, null, null, null, dummy)).toContain(" Helper (GPU)")
  })

  test("includes all modern helpers when all plists are present", () => {
    const result = getAvailableHelperSuffixes(null, null, dummy, dummy, dummy)
    expect(result).toEqual([" Helper", " Helper (Renderer)", " Helper (Plugin)", " Helper (GPU)"])
  })

  test("always starts with basic ' Helper'", () => {
    const result = getAvailableHelperSuffixes(dummy, dummy, dummy, dummy, dummy)
    expect(result[0]).toBe(" Helper")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// addHelperCompatSymlinks
// ─────────────────────────────────────────────────────────────────────────────

describe("addHelperCompatSymlinks", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `electron-mac-test-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  /**
   * Build the minimal helper bundle skeleton that addHelperCompatSymlinks expects:
   *   <frameworksPath>/<appName><suffix>.app/Contents/MacOS/<appName><suffix>
   */
  async function scaffoldRenamedHelper(frameworksPath: string, appName: string, suffix: string) {
    const macOSDir = path.join(frameworksPath, `${appName}${suffix}.app`, "Contents", "MacOS")
    await mkdir(macOSDir, { recursive: true })
    // Create the renamed executable (just an empty file for testing)
    const { writeFile } = await import("fs/promises")
    await writeFile(path.join(macOSDir, `${appName}${suffix}`), "")
  }

  test("no-op when appName equals brandingName", async () => {
    const frameworksPath = tmpDir
    await scaffoldRenamedHelper(frameworksPath, "Electron", " Helper")

    await addHelperCompatSymlinks([" Helper"], frameworksPath, "Electron", "Electron")

    // No extra symlinks should exist
    const entries = await (await import("fs/promises")).readdir(frameworksPath)
    expect(entries.filter(e => e.includes(".app"))).toEqual(["Electron Helper.app"])
  })

  test("creates bundle-level directory symlink for single helper", async () => {
    const frameworksPath = tmpDir
    await scaffoldRenamedHelper(frameworksPath, "MyApp", " Helper")

    await addHelperCompatSymlinks([" Helper"], frameworksPath, "MyApp", "Electron")

    // Check bundle symlink: "Electron Helper.app" → "./MyApp Helper.app"
    const symlinkPath = path.join(frameworksPath, "Electron Helper.app")
    const symlinkStat = await lstat(symlinkPath)
    expect(symlinkStat.isSymbolicLink()).toBe(true)
    const target = await readlink(symlinkPath)
    expect(target).toBe("./MyApp Helper.app")
  })

  test("creates executable symlink inside renamed bundle", async () => {
    const frameworksPath = tmpDir
    await scaffoldRenamedHelper(frameworksPath, "MyApp", " Helper")

    await addHelperCompatSymlinks([" Helper"], frameworksPath, "MyApp", "Electron")

    // Check executable symlink: "Electron Helper" → "./MyApp Helper"
    const execSymlink = path.join(frameworksPath, "MyApp Helper.app", "Contents", "MacOS", "Electron Helper")
    const execStat = await lstat(execSymlink)
    expect(execStat.isSymbolicLink()).toBe(true)
    const target = await readlink(execSymlink)
    expect(target).toBe("./MyApp Helper")
  })

  test("symlinks resolve transitively to the renamed binary", async () => {
    const frameworksPath = tmpDir
    await scaffoldRenamedHelper(frameworksPath, "MyApp", " Helper")

    await addHelperCompatSymlinks([" Helper"], frameworksPath, "MyApp", "Electron")

    // stat() (which follows symlinks) should resolve all the way to the real file
    const resolvedStat = await (await import("fs/promises")).stat(path.join(frameworksPath, "Electron Helper.app", "Contents", "MacOS", "Electron Helper"))
    expect(resolvedStat.isFile()).toBe(true)
  })

  test("creates symlinks for multiple helper variants", async () => {
    const frameworksPath = tmpDir
    const suffixes = [" Helper", " Helper (Renderer)", " Helper (GPU)", " Helper (Plugin)"]
    for (const suffix of suffixes) {
      await scaffoldRenamedHelper(frameworksPath, "MyApp", suffix)
    }

    await addHelperCompatSymlinks(suffixes, frameworksPath, "MyApp", "Electron")

    for (const suffix of suffixes) {
      const bundleSymlink = path.join(frameworksPath, `Electron${suffix}.app`)
      const bundleStat = await lstat(bundleSymlink)
      expect(bundleStat.isSymbolicLink()).toBe(true)
      expect(await readlink(bundleSymlink)).toBe(`./MyApp${suffix}.app`)

      const exeSymlink = path.join(frameworksPath, `MyApp${suffix}.app`, "Contents", "MacOS", `Electron${suffix}`)
      const exeStat = await lstat(exeSymlink)
      expect(exeStat.isSymbolicLink()).toBe(true)
      expect(await readlink(exeSymlink)).toBe(`./MyApp${suffix}`)
    }
  })

  test("rejects appName containing path separator", async () => {
    await expect(addHelperCompatSymlinks([" Helper"], tmpDir, "My/App", "Electron")).rejects.toThrow()
  })

  test("rejects brandingName containing path separator", async () => {
    const frameworksPath = tmpDir
    await scaffoldRenamedHelper(frameworksPath, "MyApp", " Helper")
    await expect(addHelperCompatSymlinks([" Helper"], frameworksPath, "MyApp", "El/ectron")).rejects.toThrow()
  })

  test("uses product name with spaces correctly", async () => {
    const frameworksPath = tmpDir
    await scaffoldRenamedHelper(frameworksPath, "My App", " Helper")

    await addHelperCompatSymlinks([" Helper"], frameworksPath, "My App", "Electron")

    const bundleSymlink = path.join(frameworksPath, "Electron Helper.app")
    expect((await lstat(bundleSymlink)).isSymbolicLink()).toBe(true)
    expect(await readlink(bundleSymlink)).toBe("./My App Helper.app")

    const exeSymlink = path.join(frameworksPath, "My App Helper.app", "Contents", "MacOS", "Electron Helper")
    expect((await lstat(exeSymlink)).isSymbolicLink()).toBe(true)
    expect(await readlink(exeSymlink)).toBe("./My App Helper")
  })

  test("custom electronBranding productName is used as the symlink source", async () => {
    const frameworksPath = tmpDir
    await scaffoldRenamedHelper(frameworksPath, "MyApp", " Helper")

    // Simulate a custom branding where the original brand is "MyCustomElectron"
    await addHelperCompatSymlinks([" Helper"], frameworksPath, "MyApp", "MyCustomElectron")

    const bundleSymlink = path.join(frameworksPath, "MyCustomElectron Helper.app")
    expect((await lstat(bundleSymlink)).isSymbolicLink()).toBe(true)
    expect(await readlink(bundleSymlink)).toBe("./MyApp Helper.app")
  })
})
