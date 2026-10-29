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
// The bundle's host floors (macOS 15, glibc 2.28) are checked against these; each test pins them, so the suite does not depend on the CI host
vi.mock("app-builder-lib/src/util/hostOsVersion", () => ({ getDarwinRelease: vi.fn(), getGlibcRuntimeVersion: vi.fn() }))
vi.mock("app-builder-lib/src/toolsets/fpm", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/toolsets/fpm")>()
  return { ...actual, getFpmPath: async () => "fpm" }
})

import FpmTarget from "app-builder-lib/src/targets/linux/FpmTarget"
import { getRpmBundleFilename, getRpmBundleHostIssue, getRpmToolsetBinDir, RPM_TOOLSET_MIGRATION_URL, rpmChecksums } from "app-builder-lib/src/toolsets/rpm"
import { downloadBuilderToolset } from "app-builder-lib/src/util/electronGet"
import { getDarwinRelease, getGlibcRuntimeVersion } from "app-builder-lib/src/util/hostOsVersion"
import { exec, InvalidConfigurationError, log } from "builder-util"
import { chmod, mkdir, writeFile } from "fs/promises"
import * as path from "path"
import type { TmpDir } from "temp-file"

const GITHUB_ORG_REPO = "electron-userland/electron-builder-binaries"
const DEFAULT_ANNOUNCEMENT_KEY = "toolset-rpm-default"

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")
const originalArch = Object.getOwnPropertyDescriptor(process, "arch")

function pinHost(platform: NodeJS.Platform, arch: string) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
  Object.defineProperty(process, "arch", { value: arch, configurable: true })
}

/** A bundle directory with the published layout (`bin/rpmbuild`, executable) unless `withRpmbuild` is false. */
async function createBundle(tmpDir: TmpDir, withRpmbuild = true): Promise<string> {
  const dir = await tmpDir.createTempDir({ prefix: "eb-rpm-bundle" })
  await mkdir(path.join(dir, "bin"))
  if (withRpmbuild) {
    const rpmbuild = path.join(dir, "bin", "rpmbuild")
    await writeFile(rpmbuild, "#!/bin/sh\n")
    await chmod(rpmbuild, 0o755)
  }
  return dir
}

// the "downloaded" bundle every default/"latest"/version resolution gets from the mocked downloader
let bundleDir: string

beforeEach(async context => {
  bundleDir = await createBundle(context.tmpDir)
  vi.mocked(downloadBuilderToolset).mockReset()
  vi.mocked(downloadBuilderToolset).mockResolvedValue(bundleDir)
  // a supported host by default: macOS 15 / glibc 2.39
  vi.mocked(getDarwinRelease).mockReset().mockReturnValue("24.0.0")
  vi.mocked(getGlibcRuntimeVersion).mockReset().mockReturnValue("2.39")
  log.resetLimits(DEFAULT_ANNOUNCEMENT_KEY)
  pinHost("linux", "x64")
})

afterEach(() => {
  if (originalPlatform != null) {
    Object.defineProperty(process, "platform", originalPlatform)
  }
  if (originalArch != null) {
    Object.defineProperty(process, "arch", originalArch)
  }
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
    expect(await getRpmToolsetBinDir(toolset, "build")).toBe(path.join(bundleDir, "bin"))
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
    const dir = await createBundle(context.tmpDir)
    expect(await getRpmToolsetBinDir({ url: `file://${dir}` }, "build")).toBe(path.join(dir, "bin"))
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test("a custom toolset is not subject to the published bundle's host floors", async context => {
    vi.mocked(getGlibcRuntimeVersion).mockReturnValue(null)
    const dir = await createBundle(context.tmpDir)
    expect(await getRpmToolsetBinDir({ url: `file://${dir}` }, "build")).toBe(path.join(dir, "bin"))
  })
})

describe("host floors of the published bundle", () => {
  test.each([
    ["23.6.0", "macOS 14 (Darwin 23.6.0)"],
    ["22.1.0", "macOS 13 (Darwin 22.1.0)"],
    ["19.6.0", "macOS 10.15 (Darwin 19.6.0)"],
  ])("macOS arm64 on Darwin %s fails before the download, naming %s and the floor", async (release, detected) => {
    pinHost("darwin", "arm64")
    vi.mocked(getDarwinRelease).mockReturnValue(release)
    for (const toolset of [undefined, "latest", "1.0.0"] as const) {
      const error = await getRpmToolsetBinDir(toolset, "build").catch(e => e)
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect(error.message).toContain(detected)
      expect(error.message).toContain("requires macOS 15 or newer (Darwin 24)")
      expect(error.message).toContain('toolsets.rpm: "system"')
      expect(error.message).toContain(RPM_TOOLSET_MIGRATION_URL)
    }
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test.each([["24.0.0"], ["25.1.0"]])("macOS arm64 on Darwin %s (macOS 15+) downloads the bundle", async release => {
    pinHost("darwin", "arm64")
    vi.mocked(getDarwinRelease).mockReturnValue(release)
    expect(await getRpmToolsetBinDir("latest", "build")).toBe(path.join(bundleDir, "bin"))
    expect(vi.mocked(downloadBuilderToolset).mock.calls[0][0].filenameWithExt).toBe("rpm-6.1.0-darwin-arm64.7z")
  })

  test.each([["x64"], ["arm64"]])("Linux %s with glibc 2.27 fails before the download", async arch => {
    pinHost("linux", arch)
    vi.mocked(getGlibcRuntimeVersion).mockReturnValue("2.27")
    const error = await getRpmToolsetBinDir("1.0.0", "build").catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain('toolsets.rpm "1.0.0" selects the bundled rpmbuild (rpm@1.0.0), which requires glibc 2.28 or newer, but this host has glibc 2.27')
    expect(error.message).toContain('toolsets.rpm: "system"')
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test.each([["2.28"], ["2.28.9"], ["2.31"], ["2.100"], ["3.0"]])("Linux with glibc %s downloads the bundle", async glibc => {
    vi.mocked(getGlibcRuntimeVersion).mockReturnValue(glibc)
    expect(await getRpmToolsetBinDir("latest", "build")).toBe(path.join(bundleDir, "bin"))
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
  })

  test("Linux without glibc (musl) fails before the download, with the default-change wording when unset", async () => {
    vi.mocked(getGlibcRuntimeVersion).mockReturnValue(null)
    const error = await getRpmToolsetBinDir(undefined, "build").catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain(
      "toolsets.rpm defaults to the bundled rpmbuild (rpm@1.0.0) in v27, which requires glibc 2.28 or newer, but this host has no glibc (musl or another libc)"
    )
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test('"system" bypasses every floor check', async () => {
    vi.mocked(getGlibcRuntimeVersion).mockReturnValue(null)
    expect(await getRpmToolsetBinDir("system", "build")).toBeNull()
    pinHost("darwin", "arm64")
    vi.mocked(getDarwinRelease).mockReturnValue("23.0.0")
    expect(await getRpmToolsetBinDir("system", "build")).toBeNull()
    expect(getDarwinRelease).not.toHaveBeenCalled()
    expect(getGlibcRuntimeVersion).not.toHaveBeenCalled()
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test("getRpmBundleHostIssue is null on supported hosts and ignores platforms with no bundle", () => {
    expect(getRpmBundleHostIssue("linux")).toBeNull()
    expect(getRpmBundleHostIssue("darwin")).toBeNull()
    vi.mocked(getGlibcRuntimeVersion).mockReturnValue(null)
    expect(getRpmBundleHostIssue("win32")).toBeNull()
  })
})

describe("the bundle must provide bin/rpmbuild (no silent fallback to the host one)", () => {
  test("a custom directory without bin/rpmbuild fails with the expected layout", async context => {
    const dir = await createBundle(context.tmpDir, false)
    const error = await getRpmToolsetBinDir({ url: `file://${dir}` }, "build").catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain(`has no executable bin/rpmbuild (looked for ${path.join(dir, "bin", "rpmbuild")})`)
    expect(error.message).toContain("bin/rpmbuild at the root of the archive or directory")
    expect(error.message).toContain('toolsets.rpm: "system"')
  })

  test("a custom directory whose bin/rpmbuild is a directory fails", async context => {
    const dir = await createBundle(context.tmpDir, false)
    await mkdir(path.join(dir, "bin", "rpmbuild"))
    await expect(getRpmToolsetBinDir({ url: `file://${dir}` }, "build")).rejects.toBeInstanceOf(InvalidConfigurationError)
  })

  test.skipIf(process.platform === "win32")("a custom directory whose bin/rpmbuild is not executable fails", async context => {
    const dir = await createBundle(context.tmpDir)
    await chmod(path.join(dir, "bin", "rpmbuild"), 0o644)
    await expect(getRpmToolsetBinDir({ url: `file://${dir}` }, "build")).rejects.toThrow(/has no executable bin\/rpmbuild/)
  })

  test("a custom directory with bin/rpmbuild resolves to its bin directory", async context => {
    const dir = await createBundle(context.tmpDir)
    expect(await getRpmToolsetBinDir({ url: `file://${dir}` }, "build")).toBe(path.join(dir, "bin"))
  })

  test("a downloaded bundle without bin/rpmbuild fails instead of letting fpm use the host rpmbuild", async context => {
    const broken = await createBundle(context.tmpDir, false)
    vi.mocked(downloadBuilderToolset).mockResolvedValue(broken)
    const error = await getRpmToolsetBinDir("latest", "build").catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain("The downloaded rpm@1.0.0 bundle has no executable bin/rpmbuild")
    expect(error.message).toContain(`Delete ${broken} to download it again`)
    expect(error.message).toContain('toolsets.rpm: "system"')
  })

  test("FpmTarget does not run fpm when the bundle lacks bin/rpmbuild", async context => {
    vi.mocked(downloadBuilderToolset).mockResolvedValue(await createBundle(context.tmpDir, false))
    const fpm: any = Object.create(FpmTarget.prototype)
    fpm.packager = { config: { toolsets: {} }, buildResourcesDir: "build" }
    vi.mocked(exec).mockClear()
    await expect(fpm.executeFpm("rpm", { target: "rpm", args: [] }, { PATH: "/usr/bin" })).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(exec).not.toHaveBeenCalled()
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
    expect(env.PATH).toBe([path.join(bundleDir, "bin"), "/usr/bin", "/bin"].join(":"))
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

describe("host OS version detection (unmocked)", () => {
  test("glibc runtime version comes from the process report header, which is left as configured", async () => {
    const actual = await vi.importActual<typeof import("app-builder-lib/src/util/hostOsVersion")>("app-builder-lib/src/util/hostOsVersion")
    const report = process.report as NodeJS.ProcessReport & { excludeNetwork?: boolean }
    const excludeNetwork = report.excludeNetwork
    const version = actual.getGlibcRuntimeVersion()
    const expected = process.platform === "linux" ? ((report.getReport() as { header?: { glibcVersionRuntime?: string } }).header?.glibcVersionRuntime ?? null) : null
    expect(version).toBe(expected)
    if (version != null) {
      expect(version).toMatch(/^\d+\.\d+/)
    }
    expect(report.excludeNetwork).toBe(excludeNetwork)
    expect(actual.getDarwinRelease()).toMatch(/^\d+\./)
  })
})
