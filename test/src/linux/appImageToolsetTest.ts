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
  ])("%s resolves to the newest bundle (1.1.0)", async (_label, toolset) => {
    await getAppImageTools(toolset as any, Arch.x64, tmpDir)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "appimage@1.1.0",
      filenameWithExt: "appimage-tools-runtime-20251108.tar.gz",
      checksums: appimageChecksums["1.1.0"],
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
