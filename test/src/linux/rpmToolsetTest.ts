import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Version resolution must never reach the network in a unit test: intercept the shared toolset downloader and assert the
// release descriptor it is asked for. Everything else in electronGet stays real (the ToolsetCustom `file://` path relies on it).
vi.mock("app-builder-lib/src/util/electronGet", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/electronGet")>()
  return { ...actual, downloadBuilderToolset: vi.fn() }
})
// fpm is not run: capture the environment it would get
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn(async () => "") }
})
vi.mock("app-builder-lib/src/toolsets/fpm", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/toolsets/fpm")>()
  return { ...actual, getFpmPath: async () => "fpm" }
})

import FpmTarget from "app-builder-lib/src/targets/linux/FpmTarget"
import { getRpmBundleFilename, getRpmToolsetBinDir, rpmChecksums } from "app-builder-lib/src/toolsets/rpm"
import { downloadBuilderToolset } from "app-builder-lib/src/util/electronGet"
import { exec, InvalidConfigurationError } from "builder-util"
import * as path from "path"

const FAKE_TOOLSET = "/fake/rpm-toolset"
const GITHUB_ORG_REPO = "electron-userland/electron-builder-binaries"
const PUBLISHED_HOSTS = [
  ["linux", "x64", "rpm-6.1.0-linux-amd64.7z"],
  ["linux", "arm64", "rpm-6.1.0-linux-arm64v8.7z"],
  ["darwin", "arm64", "rpm-6.1.0-darwin-arm64.7z"],
] as const

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!
const originalArch = Object.getOwnPropertyDescriptor(process, "arch")!

function pinHost(platform: string, arch: string) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
  Object.defineProperty(process, "arch", { value: arch, configurable: true })
}

beforeEach(() => {
  vi.mocked(downloadBuilderToolset).mockReset().mockResolvedValue(FAKE_TOOLSET)
  vi.mocked(exec).mockClear()
  pinHost("linux", "x64")
})

afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform)
  Object.defineProperty(process, "arch", originalArch)
})

describe("getRpmToolsetBinDir", () => {
  test('"system" resolves to null (the host rpmbuild), without a download', async () => {
    expect(await getRpmToolsetBinDir("system", "build")).toBeNull()
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test.each([
    ["undefined", undefined],
    ["null", null],
    ["latest", "latest" as const],
    ["1.0.0", "1.0.0" as const],
  ])("%s downloads rpm@1.0.0 and returns its bin directory", async (_label, toolset) => {
    expect(await getRpmToolsetBinDir(toolset, "build")).toBe(path.join(FAKE_TOOLSET, "bin"))
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "rpm@1.0.0",
      filenameWithExt: "rpm-6.1.0-linux-amd64.7z",
      checksums: rpmChecksums["1.0.0"],
      githubOrgRepo: GITHUB_ORG_REPO,
    })
  })

  test.each(PUBLISHED_HOSTS)("%s %s downloads %s", async (platform, arch, filename) => {
    pinHost(platform, arch)
    await getRpmToolsetBinDir("latest", "build")
    expect(vi.mocked(downloadBuilderToolset).mock.calls[0][0].filenameWithExt).toBe(filename)
  })

  test("every published asset has a sha256 checksum and is selected for exactly one host", () => {
    for (const [version, checksums] of Object.entries(rpmChecksums)) {
      for (const value of Object.values(checksums)) {
        expect(value, version).toMatch(/^[0-9a-f]{64}$/)
      }
      expect(PUBLISHED_HOSTS.map(([platform, arch]) => getRpmBundleFilename(version, platform, arch)).sort(), version).toEqual(Object.keys(checksums).sort())
    }
  })

  test.each([
    ["darwin", "x64"],
    ["linux", "ia32"],
  ])("%s %s has no bundle: rejected before any download", async (platform, arch) => {
    pinHost(platform, arch)
    expect(getRpmBundleFilename("1.0.0")).toBeUndefined()
    await expect(getRpmToolsetBinDir("latest", "build")).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test("an unknown pinned version is rejected before any download", async () => {
    await expect(getRpmToolsetBinDir("9.9.9" as any, "build")).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test("resolves a ToolsetCustom bare directory in place (no download)", async context => {
    const tmpDir = await context.tmpDir.createTempDir({ prefix: "eb-rpm-toolset-test" })
    expect(await getRpmToolsetBinDir({ url: `file://${tmpDir}` }, "build")).toBe(path.join(tmpDir, "bin"))
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })
})

describe("FpmTarget puts the rpm bundle first on fpm's PATH", () => {
  async function fpmPathFor(target: string, toolsets: Record<string, unknown>): Promise<string> {
    const fpm: any = Object.create(FpmTarget.prototype)
    fpm.packager = { config: { toolsets }, buildResourcesDir: "build" }
    await fpm.executeFpm(target, { target, args: [] }, { PATH: "/usr/bin:/bin" })
    expect(exec).toHaveBeenCalledTimes(1)
    return (vi.mocked(exec).mock.calls[0][2] as any).env.PATH
  }

  test("rpm with the default toolset", async () => {
    expect(await fpmPathFor("rpm", {})).toBe([path.join(FAKE_TOOLSET, "bin"), "/usr/bin", "/bin"].join(":"))
  })

  test('rpm with "system": PATH unchanged', async () => {
    expect(await fpmPathFor("rpm", { rpm: "system" })).toBe("/usr/bin:/bin")
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test.each(["deb", "pacman"])("%s never resolves the rpm toolset", async target => {
    expect(await fpmPathFor(target, { rpm: "1.0.0" })).toBe("/usr/bin:/bin")
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })
})
