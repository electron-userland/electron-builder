import { beforeEach, describe, expect, test, vi } from "vitest"

// Version resolution must never reach the network in a unit test: intercept the shared toolset
// downloader and assert the release descriptor it is asked for.
vi.mock("app-builder-lib/src/util/electronGet", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/electronGet")>()
  return { ...actual, downloadBuilderToolset: vi.fn() }
})

import { downloadBuilderToolset } from "app-builder-lib/internal"
import {
  getAtsBundleDir,
  getDotnetRuntimeAssetName,
  getDotnetRuntimeDir,
  getRceditBundle,
  WIN_CODESIGN_LATEST,
  wincodesignChecksums,
} from "app-builder-lib/src/toolsets/winCodeSign"

const FAKE_TOOLSET = "/fake/win-codesign-toolset"
const checksumsOf = (version: string) => (wincodesignChecksums as Record<string, Record<string, string>>)[version]

beforeEach(() => {
  vi.mocked(downloadBuilderToolset).mockReset()
  vi.mocked(downloadBuilderToolset).mockResolvedValue(FAKE_TOOLSET)
})

describe("winCodeSign default version", () => {
  test("latest is 1.3.3", () => {
    expect(WIN_CODESIGN_LATEST).toBe("1.3.3")
  })

  test.each([
    ["latest", "latest"],
    ["undefined", undefined],
    ["null", null],
  ])("%s resolves to the newest bundle (1.3.3)", async (_label, toolset) => {
    await getRceditBundle(toolset as any)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "win-codesign@1.3.3",
      filenameWithExt: "rcedit-windows-2_0_0.zip",
      checksums: { "rcedit-windows-2_0_0.zip": "99a37b6b54d0500b0ab9ca134b08a35faf8dfe4668b379c0091212815412504b" },
    })
  })

  test('an explicit "1.3.1" pin still resolves to that release, not the new default', async () => {
    await getRceditBundle("1.3.1")
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "win-codesign@1.3.1",
      filenameWithExt: "rcedit-windows-2_0_0.zip",
      checksums: { "rcedit-windows-2_0_0.zip": "eb975970b1295a960ba5d428693f9aa548fc00b16ae441fb8cc97abedb7cb4b9" },
    })
  })

  // Making 1.3.3 the default must leave every earlier pin with its own release and checksums. 1.3.2 was withdrawn
  // (its bundles lacked required license files) and replaced by 1.3.3, so it must not be selectable at all.
  test("1.3.3 is added alongside the earlier pins, which keep their checksums, and 1.3.2 is gone", () => {
    expect(Object.keys(wincodesignChecksums)).toEqual(["0.0.0", "1.0.0", "1.1.0", "1.1.1", "1.2.1", "1.3.0", "1.3.1", "1.3.3"])
    expect(checksumsOf("1.3.3")).toEqual({
      "ats-bundle-1_0_95.zip": "5695927ad1411f38e57fe1739475272192a6939f59c1e0525abc87b21f278035",
      "dotnet-runtime-win-x64-8_0_33.zip": "2e26d49416b0a4bd29f3f11f36aa971439b5e741ff40513fb1bc738a7bf3fd89",
      "rcedit-windows-2_0_0.zip": "99a37b6b54d0500b0ab9ca134b08a35faf8dfe4668b379c0091212815412504b",
      "win-codesign-darwin-arm64.zip": "94dd0ecf145103fc9039e3b73ee8eb40a71a9a637203657d55415e9f4f48b9a3",
      "win-codesign-darwin-x86_64.zip": "1b2f9300712e372ad2360c8cdd6cfaad9eabdc61cc95b26e68ea36be90ecc65f",
      "win-codesign-linux-amd64.zip": "5b55fa4853df581ec1ebc53f98c0e41d642a58a876a45fe35c86246ee964a534",
      "win-codesign-linux-arm64.zip": "a2e08d4a691429c92c3582d9d6d05fec67758e6e7c206e638f5d46d7a0c5c588",
      "win-codesign-linux-i386.zip": "1bb4fa33ebd18c58cdb6a9f96b08664337584529a8e8182071780b1fc0caebb5",
      "win-codesign-windows-arm64.zip": "49cb977a1f70c8bd5922db363ebc0736903f9574ab101ec39d943de45752baa7",
      "win-codesign-windows-x64.zip": "dcbb852ca7186be81ae374b2980f2df03655f208cce3a5ec95d064127de6a105",
      "windows-kits-bundle-10_0_26100_0.zip": "cf272921858dd134e997f4a372d413563e4375b2c4fceda06e7716fedb9e8bc7",
    })
    expect(checksumsOf("1.3.1")["dotnet-runtime-win-x64-8_0_28.zip"]).toBe("9de4bdfdf33d98afb73947a8c013eb1511af0d6e1051bfc4921fbe2d34426308")
    expect(checksumsOf("1.3.1")["win-codesign-linux-amd64.zip"]).toBe("8443dfd4acf811b2d7eb8420fdd500c07058f507cc65ee9a6b215f833acba659")
    expect(checksumsOf("1.3.0")["dotnet-runtime-win-x64-8_0_28.zip"]).toBe("71b9aa960ebaae196a62ec0bb1a4d224e1b48e18b6dc5eed89a37b28b72965ee")
  })

  test("1.3.3's ATS bundle downloads from its own release", async () => {
    await getAtsBundleDir("latest")
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "win-codesign@1.3.3",
      filenameWithExt: "ats-bundle-1_0_95.zip",
      checksums: { "ats-bundle-1_0_95.zip": "5695927ad1411f38e57fe1739475272192a6939f59c1e0525abc87b21f278035" },
    })
  })
})

// The .NET runtime asset is named after the runtime it ships (8.0.28 in 1.3.0/1.3.1, 8.0.33 in 1.3.3),
// so each win-codesign version must resolve its own asset name and checksum.
describe(".NET runtime lookup per winCodeSign version", () => {
  test.each([
    ["1.3.0", "dotnet-runtime-win-x64-8_0_28.zip"],
    ["1.3.1", "dotnet-runtime-win-x64-8_0_28.zip"],
    ["1.3.3", "dotnet-runtime-win-x64-8_0_33.zip"],
    ["latest", "dotnet-runtime-win-x64-8_0_33.zip"],
  ])("%s ships %s", (version, asset) => {
    expect(getDotnetRuntimeAssetName(version)).toBe(asset)
  })

  test.each(["0.0.0", "1.0.0", "1.1.0", "1.1.1", "1.2.1", "1.3.2", "9.9.9", "constructor", "__proto__"])("%s has no .NET runtime asset", version => {
    expect(getDotnetRuntimeAssetName(version)).toBeUndefined()
  })

  test.each([
    ["1.3.0", "1.3.0", "dotnet-runtime-win-x64-8_0_28.zip"],
    ["1.3.1", "1.3.1", "dotnet-runtime-win-x64-8_0_28.zip"],
    ["1.3.3", "1.3.3", "dotnet-runtime-win-x64-8_0_33.zip"],
    ["latest", "1.3.3", "dotnet-runtime-win-x64-8_0_33.zip"],
  ])("getDotnetRuntimeDir(%s) downloads %s's %s with its checksum", async (requested, release, asset) => {
    await expect(getDotnetRuntimeDir(requested)).resolves.toBe(FAKE_TOOLSET)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: `win-codesign@${release}`,
      filenameWithExt: asset,
      checksums: { [asset]: checksumsOf(release)[asset] },
    })
  })

  test.each(["1.2.1", "1.3.2", "0.0.0", "9.9.9"])("getDotnetRuntimeDir(%s) fails without downloading", async version => {
    await expect(getDotnetRuntimeDir(version)).rejects.toThrow(`winCodeSign version "${version}" does not include a .NET runtime bundle (requires >= 1.3.0)`)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })
})
