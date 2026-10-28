import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Toolset resolution must never reach the network in a unit test: intercept the shared toolset downloader and assert the
// release descriptor it is asked for. Everything else in electronGet stays real (the ToolsetCustom `file://` path relies on it).
vi.mock("app-builder-lib/src/util/electronGet", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/electronGet")>()
  return { ...actual, downloadBuilderToolset: vi.fn() }
})
// fpm itself is not run: capture the command line and environment it would get
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn(async () => "") }
})
vi.mock("app-builder-lib/src/toolsets/fpm", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/toolsets/fpm")>()
  return { ...actual, getFpmPath: async () => "fpm" }
})

import FpmTarget from "app-builder-lib/src/targets/linux/FpmTarget"
import { getRpmBundleFilename, getRpmToolsetBinDir, RPM_TOOLSET_MIGRATION_URL, rpmChecksums } from "app-builder-lib/src/toolsets/rpm"
import { downloadBuilderToolset } from "app-builder-lib/src/util/electronGet"
import { exec, InvalidConfigurationError, log } from "builder-util"
import * as path from "path"

const FAKE_BUNDLE = "/fake/rpm-toolset"
const GITHUB_ORG_REPO = "electron-userland/electron-builder-binaries"
const DEFAULT_ANNOUNCEMENT_KEY = "toolset-rpm-default"

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!
const originalArch = Object.getOwnPropertyDescriptor(process, "arch")!

function pinHost(platform: NodeJS.Platform, arch: string) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
  Object.defineProperty(process, "arch", { value: arch, configurable: true })
}

beforeEach(() => {
  vi.mocked(downloadBuilderToolset).mockReset()
  vi.mocked(downloadBuilderToolset).mockResolvedValue(FAKE_BUNDLE)
  log.resetLimits(DEFAULT_ANNOUNCEMENT_KEY)
  pinHost("linux", "x64")
})

afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform)
  Object.defineProperty(process, "arch", originalArch)
  vi.restoreAllMocks()
})

describe("getRpmToolsetBinDir", () => {
  test('"system" uses the host rpmbuild: no bundle, PATH untouched', async () => {
    expect(await getRpmToolsetBinDir("system", "build")).toBeNull()
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test.each([
    ["undefined", undefined],
    ["latest", "latest" as const],
    ["1.0.0", "1.0.0" as const],
  ])("%s downloads rpm@1.0.0 and returns its bin directory", async (_label, toolset) => {
    expect(await getRpmToolsetBinDir(toolset, "build")).toBe(path.join(FAKE_BUNDLE, "bin"))
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "rpm@1.0.0",
      filenameWithExt: "rpm-6.1.0-linux-amd64.7z",
      checksums: rpmChecksums["1.0.0"],
      githubOrgRepo: GITHUB_ORG_REPO,
    })
  })

  test.each([
    ["linux", "x64", "rpm-6.1.0-linux-amd64.7z"],
    ["linux", "arm64", "rpm-6.1.0-linux-arm64v8.7z"],
    ["darwin", "arm64", "rpm-6.1.0-darwin-arm64.7z"],
  ] as const)("%s %s downloads %s", async (platform, arch, filename) => {
    pinHost(platform, arch)
    expect(getRpmBundleFilename()).toBe(filename)
    await getRpmToolsetBinDir("latest", "build")
    expect(vi.mocked(downloadBuilderToolset).mock.calls[0][0].filenameWithExt).toBe(filename)
  })

  test("every published bundle has a checksum entry for each version", () => {
    for (const checksums of Object.values(rpmChecksums)) {
      for (const [platform, arch] of [
        ["linux", "x64"],
        ["linux", "arm64"],
        ["darwin", "arm64"],
      ] as const) {
        expect(Object.keys(checksums)).toContain(getRpmBundleFilename(platform, arch))
      }
    }
  })

  test.each([
    ["darwin", "x64"],
    ["linux", "ia32"],
    ["linux", "arm"],
    ["win32", "x64"],
  ] as const)('%s %s has no bundle: anything but "system" fails with a configuration error', async (platform, arch) => {
    pinHost(platform, arch)
    expect(getRpmBundleFilename()).toBeNull()
    for (const toolset of [undefined, "latest", "1.0.0"] as const) {
      const error = await getRpmToolsetBinDir(toolset, "build").catch(e => e)
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect(error.message).toContain('toolsets.rpm: "system"')
      expect(error.message).toContain(RPM_TOOLSET_MIGRATION_URL)
      expect(error.message).toContain(`${platform} ${arch}`)
    }
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
    // the legacy host rpmbuild stays available there
    expect(await getRpmToolsetBinDir("system", "build")).toBeNull()
  })

  test("the unsupported-host error names the default change when toolsets.rpm is unset", async () => {
    pinHost("darwin", "x64")
    await expect(getRpmToolsetBinDir(undefined, "build")).rejects.toThrow(/defaults to the bundled rpmbuild \(rpm@1\.0\.0\) in v27/)
    await expect(getRpmToolsetBinDir("1.0.0", "build")).rejects.toThrow(/"1\.0\.0" selects the bundled rpmbuild/)
  })

  test("a custom toolset directory is honored on every host, including ones without a published bundle", async context => {
    pinHost("darwin", "x64")
    const dir = await context.tmpDir.createTempDir({ prefix: "eb-rpm-custom" })
    expect(await getRpmToolsetBinDir({ url: `file://${dir}` }, "build")).toBe(path.join(dir, "bin"))
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })
})

describe("v27 default-change announcement", () => {
  test("logs once per process when toolsets.rpm is unset", async () => {
    const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
    await getRpmToolsetBinDir(undefined, "build")
    await getRpmToolsetBinDir(undefined, "build")
    const announcements = info.mock.calls.filter(([, message]) => typeof message === "string" && message.startsWith("v27: the rpm target"))
    expect(announcements).toHaveLength(1)
    const [fields, message] = announcements[0]
    expect(message).toContain('toolsets.rpm: "system"')
    expect(fields).toMatchObject({ toolset: "rpm@1.0.0", docs: RPM_TOOLSET_MIGRATION_URL })
  })

  test.each([["latest" as const], ["1.0.0" as const], ["system" as const]])("is not logged for an explicit %s", async toolset => {
    const info = vi.spyOn(log, "info").mockImplementation(() => undefined)
    await getRpmToolsetBinDir(toolset, "build")
    expect(info).not.toHaveBeenCalled()
  })
})

describe("FpmTarget puts the rpm bundle on fpm's PATH", () => {
  async function fpmEnvFor(target: string, toolsets: Record<string, unknown>): Promise<Record<string, string>> {
    const fpm: any = Object.create(FpmTarget.prototype)
    fpm.packager = { config: { toolsets }, buildResourcesDir: "build" }
    vi.mocked(exec).mockClear()
    await fpm.executeFpm(target, { target, args: [] }, { PATH: "/usr/bin:/bin", HOME: "/home/u" })
    expect(exec).toHaveBeenCalledTimes(1)
    return (vi.mocked(exec).mock.calls[0][2] as any).env
  }

  test("rpm with the default toolset: the bundle's bin directory comes first", async () => {
    const env = await fpmEnvFor("rpm", {})
    expect(env.PATH).toBe([path.join(FAKE_BUNDLE, "bin"), "/usr/bin", "/bin"].join(":"))
    expect(env.HOME).toBe("/home/u")
  })

  test('rpm with "system": PATH is passed through unchanged', async () => {
    const env = await fpmEnvFor("rpm", { rpm: "system" })
    expect(env.PATH).toBe("/usr/bin:/bin")
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test.each([["deb"], ["pacman"], ["apk"]])("%s never resolves the rpm toolset", async target => {
    const env = await fpmEnvFor(target, { rpm: "1.0.0" })
    expect(env.PATH).toBe("/usr/bin:/bin")
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test('an Intel macOS host fails before fpm runs unless toolsets.rpm is "system"', async () => {
    pinHost("darwin", "x64")
    const fpm: any = Object.create(FpmTarget.prototype)
    fpm.packager = { config: { toolsets: {} }, buildResourcesDir: "build" }
    vi.mocked(exec).mockClear()
    await expect(fpm.executeFpm("rpm", { target: "rpm", args: [] }, { PATH: "/usr/bin" })).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(exec).not.toHaveBeenCalled()
    expect((await fpmEnvFor("rpm", { rpm: "system" })).PATH).toBe("/usr/bin:/bin")
  })
})
