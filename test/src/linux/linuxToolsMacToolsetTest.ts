import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Version resolution must never reach the network in a unit test: intercept the shared toolset
// downloader and assert the release descriptor it is asked for. Everything else in electronGet stays real
// (the ToolsetCustom `file://` path below relies on it).
vi.mock("app-builder-lib/src/util/electronGet", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/electronGet")>()
  return { ...actual, downloadBuilderToolset: vi.fn() }
})

import { downloadBuilderToolset } from "app-builder-lib/internal"
import { getLinuxToolsMacToolset, getLinuxToolsPath, linuxToolsMacChecksums } from "app-builder-lib/src/toolsets/linuxToolsMac"
import { InvalidConfigurationError } from "builder-util"
import * as path from "path"

const FAKE_TOOLSET = "/fake/linux-tools-mac"
const GITHUB_ORG_REPO = "electron-userland/electron-builder-binaries"
const originalArch = process.arch

function setArch(arch: string) {
  Object.defineProperty(process, "arch", { value: arch, configurable: true })
}

describe("getLinuxToolsPath", () => {
  beforeEach(() => {
    vi.mocked(downloadBuilderToolset).mockReset()
    vi.mocked(downloadBuilderToolset).mockResolvedValue(FAKE_TOOLSET)
  })

  afterEach(() => {
    setArch(originalArch)
  })

  test.each([
    ["latest", "latest"],
    ["undefined", undefined],
    ["null", null],
  ])("%s resolves to the newest bundle (1.1.1)", async (_label, toolset) => {
    setArch("arm64")
    await expect(getLinuxToolsPath(toolset as any)).resolves.toBe(FAKE_TOOLSET)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "linux-tools-mac@1.1.1",
      filenameWithExt: "linux-tools-mac-darwin-arm64.tar.gz",
      checksums: linuxToolsMacChecksums["1.1.1"],
      githubOrgRepo: GITHUB_ORG_REPO,
    })
  })

  test.each([
    ["arm64", "linux-tools-mac-darwin-arm64.tar.gz"],
    ["x64", "linux-tools-mac-darwin-x86_64.tar.gz"],
  ])("on a %s host the default downloads %s", async (arch, filename) => {
    setArch(arch)
    await getLinuxToolsPath()
    expect(vi.mocked(downloadBuilderToolset).mock.calls[0][0]).toMatchObject({ releaseName: "linux-tools-mac@1.1.1", filenameWithExt: filename })
  })

  // Making 1.1.1 the default must stay additive: every earlier pin keeps its own release and checksum.
  test("1.1.1 is added alongside the earlier pins, which keep their checksums", () => {
    expect(Object.keys(linuxToolsMacChecksums)).toEqual(["1.0.0", "1.0.1", "1.1.1"])
    expect(linuxToolsMacChecksums["1.1.1"]).toEqual({
      "linux-tools-mac-darwin-arm64.tar.gz": "29bcd17a14c3285fa62fad10f2447ad21bc32cfd6a6cb2e62e341d5bb4e9ee18",
      "linux-tools-mac-darwin-x86_64.tar.gz": "61aea692e8b1c2207aa287934dcb22425e8a3b0ac75b6010708e3d48c6f11165",
    })
    expect(linuxToolsMacChecksums["1.0.1"]).toEqual({
      "linux-tools-mac-darwin-arm64.tar.gz": "3dcb43a12b8630919b8d5cc9045be102108b0edd9b0354e0a7409ee5b53141ac",
      "linux-tools-mac-darwin-x86_64.tar.gz": "d62f5e2f6949c6420fdda8b18d2e70b0e14eeb959128c0cea11acada2c105ad9",
    })
    expect(linuxToolsMacChecksums["1.0.0"]).toEqual({
      "linux-tools-mac-darwin-arm64.tar.gz": "204e76f08364352edb28a6a4be87e8f9bd9340213865d9a0d1c664aa46fcf053",
      "linux-tools-mac-darwin-x86_64.tar.gz": "7ee26dfbd0d2a4c2c83b55a9416a30cc84876eef01c6497ca49bb016a190c726",
    })
  })

  // Generic guard against a pin floating to another release: every known version must download
  // exactly its own `linux-tools-mac@<version>` release, with that version's checksums.
  test.each(Object.keys(linuxToolsMacChecksums))('pinned "%s" downloads exactly its own release', async version => {
    setArch("x64")
    await getLinuxToolsPath(version as any)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: `linux-tools-mac@${version}`,
      filenameWithExt: "linux-tools-mac-darwin-x86_64.tar.gz",
      checksums: (linuxToolsMacChecksums as any)[version],
      githubOrgRepo: GITHUB_ORG_REPO,
    })
  })

  // 1.1.0 was published without the license files its bundled tools require and was replaced by 1.1.1
  // (same asset names, new contents): it must not be pinnable, even through a config that skips the schema.
  test.each(["1.1.0", "9.9.9"])('an unknown or withdrawn pin "%s" is rejected before any download', async version => {
    expect(Object.keys(linuxToolsMacChecksums)).not.toContain(version)
    const promise = getLinuxToolsPath(version as any)
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(`Unknown toolsets.linuxToolsMac version "${version}". Known versions: ${Object.keys(linuxToolsMacChecksums).join(", ")} (or "latest")`)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test("every version has a sha256 checksum for both macOS archives", () => {
    for (const [version, checksums] of Object.entries(linuxToolsMacChecksums)) {
      expect(Object.keys(checksums).sort(), version).toEqual(["linux-tools-mac-darwin-arm64.tar.gz", "linux-tools-mac-darwin-x86_64.tar.gz"])
      for (const value of Object.values(checksums)) {
        expect(value, version).toMatch(/^[0-9a-f]{64}$/)
      }
    }
  })

  // 1.1.1 trims the bundle to gtar, lzip and ar: those are the only binaries electron-builder resolves from it.
  test("the toolset exposes ar, lzip and gtar from the bundle's bin directory", async () => {
    await expect(getLinuxToolsMacToolset()).resolves.toEqual({
      ar: path.join(FAKE_TOOLSET, "bin", "ar"),
      lzip: path.join(FAKE_TOOLSET, "bin", "lzip"),
      gtar: path.join(FAKE_TOOLSET, "bin", "gtar"),
    })
  })
})
