import { MacUpdater } from "electron-updater/src/MacUpdater"
import { describe, expect, test } from "vitest"
import type { ResolvedUpdateFileInfo } from "electron-updater/src/types"

// MacUpdater is in skipPerOSTests.darwin (requires live Electron), but
// filterFilesForArch is a protected static with no Electron dependency — it
// can be called directly via (MacUpdater as any).filterFilesForArch without
// constructing an instance.

function filterFilesForArch(files: ResolvedUpdateFileInfo[], isArm64Mac: boolean): ResolvedUpdateFileInfo[] {
  return (MacUpdater as any).filterFilesForArch(files, isArm64Mac)
}

function makeFile(filename: string): ResolvedUpdateFileInfo {
  return {
    url: new URL(`https://example.com/${filename}`),
    info: { url: filename, sha512: "abc", size: 1024 },
  }
}

describe("MacUpdater.filterFilesForArch", () => {
  test("arm64 Mac with arm64 files: only arm64 files returned", () => {
    const files = [makeFile("app-x64.zip"), makeFile("app-arm64.zip")]
    const result = filterFilesForArch(files, true)
    expect(result).toHaveLength(1)
    expect(result[0].info.url).toBe("app-arm64.zip")
  })

  test("x64 Mac: arm64 files are filtered out", () => {
    const files = [makeFile("app-x64.zip"), makeFile("app-arm64.zip")]
    const result = filterFilesForArch(files, false)
    expect(result).toHaveLength(1)
    expect(result[0].info.url).toBe("app-x64.zip")
  })

  test("arm64 Mac with no arm64 files: all files returned unchanged", () => {
    // isArm64Mac=true but files.some(isArm64File) is false → else branch → filter arm64 out (none present)
    const files = [makeFile("app-x64.zip"), makeFile("app-universal.zip")]
    const result = filterFilesForArch(files, true)
    expect(result).toHaveLength(2)
    expect(result.map(f => f.info.url)).toEqual(["app-x64.zip", "app-universal.zip"])
  })

  test("x64 Mac with only non-arm64 files: all returned", () => {
    const files = [makeFile("app-x64.zip"), makeFile("app-universal.zip")]
    expect(filterFilesForArch(files, false)).toHaveLength(2)
  })

  test("arm64 detected via info.url field (not URL pathname)", () => {
    const file: ResolvedUpdateFileInfo = {
      url: new URL("https://example.com/download"),
      info: { url: "release-arm64.zip", sha512: "abc", size: 100 },
    }
    expect(filterFilesForArch([file], false)).toHaveLength(0) // x64 → arm64 excluded
    expect(filterFilesForArch([file], true)).toHaveLength(1) // arm64 → arm64 kept
  })

  test("arm64 detected via URL pathname (not info.url)", () => {
    const file: ResolvedUpdateFileInfo = {
      url: new URL("https://example.com/releases/v1/app-arm64.zip"),
      info: { url: "app.zip", sha512: "abc", size: 100 },
    }
    expect(filterFilesForArch([file], false)).toHaveLength(0)
    expect(filterFilesForArch([file], true)).toHaveLength(1)
  })
})
