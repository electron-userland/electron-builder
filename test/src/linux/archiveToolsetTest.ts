import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Never reach the network: intercept the shared toolset downloader. Everything else in electronGet stays real
// (the ToolsetCustom `file://` path relies on it).
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
import { archiveChecksums, getArchiveToolsetBinDir } from "app-builder-lib/src/toolsets/archive"
import { downloadBuilderToolset } from "app-builder-lib/src/util/electronGet"
import { exec, InvalidConfigurationError } from "builder-util"
import * as path from "path"

const FAKE_TOOLSET = "/fake/archive-toolset"
const HOSTS = [
  ["linux", "x64", "archive-linux-amd64.7z"],
  ["linux", "arm64", "archive-linux-arm64v8.7z"],
  ["linux", "ia32", "archive-linux-i386.7z"],
  ["darwin", "arm64", "archive-darwin-arm64.7z"],
  ["darwin", "x64", "archive-darwin-x86_64.7z"],
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

describe("getArchiveToolsetBinDir", () => {
  test.each([undefined, "latest", "1.0.0"] as const)("%s downloads archive@1.0.0 and returns its bin directory", async toolset => {
    expect(await getArchiveToolsetBinDir(toolset, "build")).toBe(path.join(FAKE_TOOLSET, "bin"))
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "archive@1.0.0",
      filenameWithExt: "archive-linux-amd64.7z",
      checksums: archiveChecksums["1.0.0"],
      githubOrgRepo: "electron-userland/electron-builder-binaries",
    })
  })

  test.each(HOSTS)("%s %s downloads %s", async (platform, arch, filename) => {
    pinHost(platform, arch)
    await getArchiveToolsetBinDir("latest", "build")
    expect(vi.mocked(downloadBuilderToolset).mock.calls[0][0].filenameWithExt).toBe(filename)
  })

  test("every asset has a sha256 checksum", () => {
    expect(Object.keys(archiveChecksums["1.0.0"]).sort()).toEqual(HOSTS.map(it => it[2]).sort())
    for (const checksum of Object.values(archiveChecksums["1.0.0"])) {
      expect(checksum).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  test.each([
    ["win32", "x64", "latest"],
    ["linux", "x64", "9.9.9"],
  ])("%s %s %s is rejected before any download", async (platform, arch, version) => {
    pinHost(platform, arch)
    await expect(getArchiveToolsetBinDir(version as any, "build")).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test("a ToolsetCustom directory is used in place", async context => {
    const tmpDir = await context.tmpDir.createTempDir({ prefix: "eb-archive-toolset-test" })
    expect(await getArchiveToolsetBinDir({ url: `file://${tmpDir}` }, "build")).toBe(path.join(tmpDir, "bin"))
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })
})

test.each(["deb", "rpm", "pacman"])("FpmTarget puts the archive toolset first on fpm's PATH for %s", async target => {
  const fpm: any = Object.create(FpmTarget.prototype)
  fpm.packager = { config: {}, buildResourcesDir: "build" }
  await fpm.executeFpm(target, { target, args: [] }, { PATH: "/usr/bin:/bin" })
  expect((vi.mocked(exec).mock.calls[0][2] as any).env.PATH).toBe([path.join(FAKE_TOOLSET, "bin"), "/usr/bin", "/bin"].join(":"))
})
