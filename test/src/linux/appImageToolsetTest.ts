import { beforeEach, describe, expect, test, vi } from "vitest"

// Version resolution must never reach the network in a unit test: intercept the shared toolset
// downloader and assert the release descriptor it is asked for. Everything else in electronGet stays real
// (the ToolsetCustom `file://` path below relies on it).
vi.mock("app-builder-lib/src/util/electronGet", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/electronGet")>()
  return { ...actual, downloadBuilderToolset: vi.fn() }
})

import { downloadBuilderToolset } from "app-builder-lib/internal"
import { appimageChecksums, getAppImageTools } from "app-builder-lib/src/toolsets/appimage"
import { Arch, InvalidConfigurationError } from "builder-util"
import * as path from "path"

const FAKE_TOOLSET = "/fake/appimage-toolset"
const GITHUB_ORG_REPO = "electron-userland/electron-builder-binaries"

describe("getAppImageTools", () => {
  let tmpDir: string

  // The context's `tmpDir` fixture (vitest-tmpdir.ts) cleans up after each test.
  beforeEach(async context => {
    tmpDir = await context.tmpDir.createTempDir({ prefix: "eb-appimage-toolset-test" })
    vi.mocked(downloadBuilderToolset).mockReset()
    vi.mocked(downloadBuilderToolset).mockResolvedValue(FAKE_TOOLSET)
  })

  test.each([
    ["latest", "latest"],
    ["undefined", undefined],
    ["null", null],
  ])("%s resolves to the newest bundle (1.2.1)", async (_label, toolset) => {
    await getAppImageTools(toolset as any, Arch.x64, tmpDir)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "appimage@1.2.1",
      filenameWithExt: "appimage-tools-runtime-20251108.tar.gz",
      checksums: appimageChecksums["1.2.1"],
      githubOrgRepo: GITHUB_ORG_REPO,
    })
  })

  // 1.2.1 is the license-corrected re-release of 1.2.0 (same asset name, new contents). 1.2.0 shipped
  // as the default in the v27.0.0-alpha.14 prerelease and was withdrawn because its bundle lacked
  // license files, so it is replaced rather than kept as a pin; every earlier pin keeps its own release
  // and checksum.
  test("1.2.1 replaces 1.2.0 alongside the earlier pins, which keep their checksums", () => {
    expect(Object.keys(appimageChecksums)).toEqual(["0.0.0", "1.0.3", "1.1.0", "1.2.1"])
    expect(appimageChecksums["1.2.1"]).toEqual({
      "appimage-tools-runtime-20251108.tar.gz": "2e43e1f7ea58a38822d060f1f437f1201fae7d293ae3b45167a9eea41d440353",
    })
    expect(appimageChecksums["1.1.0"]).toEqual({
      "appimage-tools-runtime-20251108.tar.gz": "098182ab8d3bb93db8a23691671f665ff92316249ace850aec63b9d010ec7fe0",
    })
    expect(appimageChecksums["1.0.3"]).toEqual({
      "appimage-tools-runtime-20251108.tar.gz": "84021a78ee214ae6fd33a2d62a92ba25542dd10bc86bf117a9b2d0bba44e7665",
    })
  })

  test("the flagged 1.2.0 bundle can no longer be pinned", async () => {
    const promise = getAppImageTools("1.2.0" as any, Arch.x64, tmpDir)
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow('Unknown toolsets.appimage version "1.2.0"')
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test.each(["1.0.3", "1.1.0"])('an explicit "%s" pin still resolves to that release, not the new default', async version => {
    await getAppImageTools(version as any, Arch.x64, tmpDir)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: `appimage@${version}`,
      filenameWithExt: "appimage-tools-runtime-20251108.tar.gz",
      checksums: (appimageChecksums as any)[version],
      githubOrgRepo: GITHUB_ORG_REPO,
    })
  })

  // Generic guard against a pin floating to another release: every known non-legacy version must
  // download exactly its own `appimage@<version>` release, with that version's archive and checksum.
  test.each(Object.keys(appimageChecksums).filter(v => v !== "0.0.0"))('pinned "%s" downloads exactly its own release', async version => {
    const checksums: Record<string, string> = (appimageChecksums as any)[version]
    await getAppImageTools(version as any, Arch.x64, tmpDir)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: `appimage@${version}`,
      filenameWithExt: Object.keys(checksums)[0],
      checksums,
      githubOrgRepo: GITHUB_ORG_REPO,
    })
  })

  test('legacy "0.0.0" downloads appimage-12.0.1 with the FUSE2 layout', async () => {
    const tools = await getAppImageTools("0.0.0", Arch.armv7l, tmpDir)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "appimage-12.0.1",
      filenameWithExt: "appimage-12.0.1.7z",
      checksums: appimageChecksums["0.0.0"],
      githubOrgRepo: GITHUB_ORG_REPO,
    })
    // Host tools live under a host-platform subdir; the runtime sits at the root with the target-arch suffix
    expect(path.relative(FAKE_TOOLSET, tools.mksquashfs)).toMatch(/^(darwin|linux-(x64|ia32|arm64|arm32))[/\\]mksquashfs$/)
    expect(path.relative(FAKE_TOOLSET, tools.desktopFileValidate)).toMatch(/^(darwin|linux-(x64|ia32|arm64|arm32))[/\\]desktop-file-validate$/)
    expect(tools.runtime).toBe(path.resolve(FAKE_TOOLSET, "runtime-armv7l"))
    expect(tools.runtimeLibraries).toBe(path.resolve(FAKE_TOOLSET, "lib", "x64"))
  })

  test.each([
    ["x64", Arch.x64, "x64"],
    ["ia32", Arch.ia32, "ia32"],
    ["arm64", Arch.arm64, "arm64"],
    ["armv7l", Arch.armv7l, "arm32"],
  ])("static-runtime layout for %s", async (_label, arch, runtimeArch) => {
    const tools = await getAppImageTools("latest", arch, tmpDir)
    expect(tools).toEqual({
      mksquashfs: path.resolve(FAKE_TOOLSET, "mksquashfs"),
      desktopFileValidate: path.resolve(FAKE_TOOLSET, "desktop-file-validate"),
      runtime: path.resolve(FAKE_TOOLSET, "runtimes", `runtime-${runtimeArch}`),
      runtimeLibraries: path.resolve(FAKE_TOOLSET, "lib", runtimeArch),
    })
  })

  test("an unknown pinned version is rejected before any download", async () => {
    // Without a checksum entry the downloader would run with integrity verification disabled, so an
    // unknown version (only reachable through a programmatic / unvalidated config) must fail fast.
    const promise = getAppImageTools("9.9.9" as any, Arch.x64, tmpDir)
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(`Unknown toolsets.appimage version "9.9.9". Known versions: ${Object.keys(appimageChecksums).join(", ")} (or "latest")`)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test("every checksum entry is a single sha256 value", () => {
    for (const [version, checksums] of Object.entries(appimageChecksums)) {
      const values = Object.values(checksums)
      expect(values, version).toHaveLength(1)
      expect(values[0], version).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  test("resolves a ToolsetCustom bare directory in place (no download)", async () => {
    const tools = await getAppImageTools({ url: `file://${tmpDir}` }, Arch.x64, tmpDir)
    expect(tools.mksquashfs).toBe(path.resolve(tmpDir, "mksquashfs"))
    expect(tools.runtime).toBe(path.resolve(tmpDir, "runtimes", "runtime-x64"))
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })
})
