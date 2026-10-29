import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Toolset resolution must never reach the network in a unit test: intercept the shared toolset downloader and assert the
// release descriptor it is asked for. Everything else in electronGet stays real (the ToolsetCustom `file://` path relies on it).
vi.mock("app-builder-lib/src/util/electronGet", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/electronGet")>()
  return { ...actual, downloadBuilderToolset: vi.fn() }
})
// Neither fpm nor the bundle's `rpmbuild --version` probe is run (unless a test delegates to the real exec): capture the command
// lines and environments they would get. The probe succeeds by default.
vi.mock("builder-util", async importOriginal => {
  const actual = await importOriginal<typeof import("builder-util")>()
  return { ...actual, exec: vi.fn(async () => "") }
})
vi.mock("app-builder-lib/src/toolsets/fpm", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/toolsets/fpm")>()
  return { ...actual, getFpmPath: async () => "fpm" }
})

import FpmTarget from "app-builder-lib/src/targets/linux/FpmTarget"
import { getRpmBundleFilename, getRpmToolsetBinDir, RPM_PROBE_TIMEOUT_MS, RPM_TOOLSET_MIGRATION_URL, rpmChecksums } from "app-builder-lib/src/toolsets/rpm"
import { downloadBuilderToolset } from "app-builder-lib/src/util/electronGet"
import { exec, ExecError, InvalidConfigurationError, log } from "builder-util"
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
async function createBundle(tmpDir: TmpDir, withRpmbuild = true, script = "#!/bin/sh\n"): Promise<string> {
  const dir = await tmpDir.createTempDir({ prefix: "eb-rpm-bundle" })
  await mkdir(path.join(dir, "bin"))
  if (withRpmbuild) {
    const rpmbuild = path.join(dir, "bin", "rpmbuild")
    await writeFile(rpmbuild, script)
    await chmod(rpmbuild, 0o755)
  }
  return dir
}

/** The `rpmbuild --version` probe calls made through the mocked exec. */
function probeCalls() {
  return vi.mocked(exec).mock.calls.filter(([file, args]) => path.basename(file) === "rpmbuild" && args?.[0] === "--version")
}

/** What builder-util's exec rejects with when a process fails: an ExecError whose cause is Node's execFile error. */
function execFailure(file: string, cause: { message: string; code?: number | string; signal?: NodeJS.Signals | null; killed?: boolean }): ExecError {
  const nodeError = Object.assign(new Error(cause.message), { code: cause.code, signal: cause.signal ?? null, killed: cause.killed ?? false })
  return new ExecError(file, typeof cause.code === "number" ? cause.code : -1, cause.message, "", `${cause.code}`, { cause: nodeError })
}

const DYLD_ERROR = [
  "dyld[4242]: Library not loaded: @loader_path/../lib/librpmbuild.10.dylib",
  "  Referenced from: <1A2B> /cache/rpm@1.0.0/libexec/rpmbuild (built for macOS 15.0 which is newer than running OS)",
  "  Reason: tried: '/cache/rpm@1.0.0/lib/librpmbuild.10.dylib' (no such file)",
].join("\n")

// the "downloaded" bundle every default/"latest"/version resolution gets from the mocked downloader
let bundleDir: string

beforeEach(async context => {
  bundleDir = await createBundle(context.tmpDir)
  vi.mocked(downloadBuilderToolset).mockReset()
  vi.mocked(downloadBuilderToolset).mockResolvedValue(bundleDir)
  vi.mocked(exec).mockReset().mockResolvedValue("")
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
    expect(exec).not.toHaveBeenCalled()
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
})

describe("the bundled rpmbuild is probed once before use", () => {
  const env = { PATH: "/usr/bin:/bin", HOME: "/home/u" }

  test("a probe that runs resolves to the bin directory; it gets the given env with the bundle first on PATH", async () => {
    const binDir = path.join(bundleDir, "bin")
    expect(await getRpmToolsetBinDir("latest", "build", env)).toBe(binDir)
    expect(probeCalls()).toHaveLength(1)
    const [file, args, options] = probeCalls()[0]
    expect(file).toBe(path.join(binDir, "rpmbuild"))
    expect(args).toEqual(["--version"])
    expect(options).toEqual({ env: { PATH: [binDir, "/usr/bin", "/bin"].join(":"), HOME: "/home/u" }, timeout: RPM_PROBE_TIMEOUT_MS })
  })

  test.each([
    [undefined, "toolsets.rpm defaults to the bundled rpmbuild (rpm@1.0.0) in v27, which cannot run on this host"],
    ["latest" as const, 'toolsets.rpm "latest" selects the bundled rpmbuild (rpm@1.0.0), which cannot run on this host'],
    ["1.0.0" as const, 'toolsets.rpm "1.0.0" selects the bundled rpmbuild (rpm@1.0.0), which cannot run on this host'],
  ])('a failing probe (%s) is a configuration error quoting the loader output, with the "system" hint', async (toolset, wording) => {
    pinHost("darwin", "arm64")
    const rpmbuild = path.join(bundleDir, "bin", "rpmbuild")
    vi.mocked(exec).mockRejectedValue(execFailure(rpmbuild, { message: `Command failed: ${rpmbuild} --version\n${DYLD_ERROR}\n`, signal: "SIGABRT" }))
    const error = await getRpmToolsetBinDir(toolset, "build", env).catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain(`${wording}: ${rpmbuild} --version was killed by SIGABRT:\n  dyld[4242]: Library not loaded`)
    expect(error.message).toContain("(built for macOS 15.0 which is newer than running OS)")
    expect(error.message).not.toContain("Command failed:")
    expect(error.message).toContain("glibc 2.28 or newer on Linux (not musl) and macOS 15 or newer on Apple silicon")
    expect(error.message).toContain('Set toolsets.rpm: "system" to build the rpm target with the rpmbuild installed on this machine.')
    expect(error.message).toContain(RPM_TOOLSET_MIGRATION_URL)
  })

  test("a glibc mismatch (non-zero exit) names the exit code and the loader line", async () => {
    const rpmbuild = path.join(bundleDir, "bin", "rpmbuild")
    const glibc = `${rpmbuild}: /lib64/libc.so.6: version \`GLIBC_2.28' not found (required by ${rpmbuild})`
    vi.mocked(exec).mockRejectedValue(execFailure(rpmbuild, { message: `Command failed: ${rpmbuild} --version\n${glibc}`, code: 1 }))
    const error = await getRpmToolsetBinDir("latest", "build", env).catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain(`--version exited with code 1:\n  ${glibc}`)
  })

  test("a probe that cannot be started (e.g. a missing ELF interpreter) or times out is a configuration error", async context => {
    const rpmbuild = path.join(bundleDir, "bin", "rpmbuild")
    vi.mocked(exec).mockRejectedValueOnce(execFailure(rpmbuild, { message: `spawn ${rpmbuild} ENOENT`, code: "ENOENT" }))
    await expect(getRpmToolsetBinDir("latest", "build", env)).rejects.toThrow(`--version could not be started (ENOENT):\n  spawn ${rpmbuild} ENOENT`)

    const other = await createBundle(context.tmpDir)
    vi.mocked(downloadBuilderToolset).mockResolvedValue(other)
    const otherRpmbuild = path.join(other, "bin", "rpmbuild")
    vi.mocked(exec).mockRejectedValueOnce(execFailure(otherRpmbuild, { message: `Command failed: ${otherRpmbuild} --version\n`, signal: "SIGTERM", killed: true }))
    const error = await getRpmToolsetBinDir("latest", "build", env).catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain(`--version did not finish within ${RPM_PROBE_TIMEOUT_MS / 1000}s\n`)
  })

  test("a long stderr is cut to its first lines", async () => {
    const rpmbuild = path.join(bundleDir, "bin", "rpmbuild")
    const lines = Array.from({ length: 9 }, (_, i) => `line ${i + 1}`)
    vi.mocked(exec).mockRejectedValue(execFailure(rpmbuild, { message: `Command failed: ${rpmbuild} --version\n${lines.join("\n")}`, code: 2 }))
    const error = await getRpmToolsetBinDir("latest", "build", env).catch(e => e)
    expect(error.message).toContain("  line 5\n  … (4 more lines)")
    expect(error.message).not.toContain("line 6")
  })

  test("the probe runs once per bundle per process, also when it fails", async context => {
    await getRpmToolsetBinDir("latest", "build", env)
    await getRpmToolsetBinDir(undefined, "build", env)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(2)
    expect(probeCalls()).toHaveLength(1)

    const broken = await createBundle(context.tmpDir)
    vi.mocked(downloadBuilderToolset).mockResolvedValue(broken)
    vi.mocked(exec).mockRejectedValue(execFailure(path.join(broken, "bin", "rpmbuild"), { message: "Command failed: x\nboom", code: 1 }))
    await expect(getRpmToolsetBinDir("latest", "build", env)).rejects.toThrow(/boom/)
    await expect(getRpmToolsetBinDir("latest", "build", env)).rejects.toThrow(/boom/)
    expect(probeCalls()).toHaveLength(2)
  })

  test('"system" never probes', async () => {
    expect(await getRpmToolsetBinDir("system", "build", env)).toBeNull()
    expect(exec).not.toHaveBeenCalled()
  })

  test("a host with no published bundle fails before any probe", async () => {
    pinHost("darwin", "x64")
    await expect(getRpmToolsetBinDir("latest", "build", env)).rejects.toBeInstanceOf(InvalidConfigurationError)
    expect(exec).not.toHaveBeenCalled()
  })

  test("a custom bundle is probed too, and a failure names its url", async context => {
    const dir = await createBundle(context.tmpDir)
    const rpmbuild = path.join(dir, "bin", "rpmbuild")
    expect(await getRpmToolsetBinDir({ url: `file://${dir}` }, "build", env)).toBe(path.join(dir, "bin"))
    expect(probeCalls().map(([file]) => file)).toEqual([rpmbuild])

    const failing = await createBundle(context.tmpDir)
    vi.mocked(exec).mockRejectedValue(execFailure(path.join(failing, "bin", "rpmbuild"), { message: "Command failed: x\nError loading shared library librpm.so.10", code: 127 }))
    const error = await getRpmToolsetBinDir({ url: `file://${failing}` }, "build", env).catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain(`The custom toolsets.rpm bundle (file://${failing}) cannot run on this host:`)
    expect(error.message).toContain("exited with code 127:\n  Error loading shared library librpm.so.10")
    expect(error.message).toContain('toolsets.rpm: "system"')
  })

  test("a bundle without bin/rpmbuild fails on its layout, without a probe", async context => {
    vi.mocked(downloadBuilderToolset).mockResolvedValue(await createBundle(context.tmpDir, false))
    await expect(getRpmToolsetBinDir("latest", "build", env)).rejects.toThrow(/has no executable bin\/rpmbuild/)
    expect(exec).not.toHaveBeenCalled()
  })
})

describe.skipIf(process.platform === "win32")("the probe against a real executable", () => {
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import("builder-util")>("builder-util")
    vi.mocked(exec).mockImplementation(actual.exec)
  })

  test("an rpmbuild that exits 0 resolves", async context => {
    const dir = await createBundle(context.tmpDir, true, '#!/bin/sh\necho "RPM version 6.1.0"\n')
    vi.mocked(downloadBuilderToolset).mockResolvedValue(dir)
    expect(await getRpmToolsetBinDir("latest", "build")).toBe(path.join(dir, "bin"))
  })

  test("an rpmbuild that exits 127 with a loader error fails with that error and the hint", async context => {
    const loader = "rpmbuild: error while loading shared libraries: librpmbuild.so.10: cannot open shared object file: No such file or directory"
    const dir = await createBundle(context.tmpDir, true, `#!/bin/sh\necho "${loader}" >&2\nexit 127\n`)
    vi.mocked(downloadBuilderToolset).mockResolvedValue(dir)
    const error = await getRpmToolsetBinDir(undefined, "build").catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain(
      `toolsets.rpm defaults to the bundled rpmbuild (rpm@1.0.0) in v27, which cannot run on this host: ${path.join(dir, "bin", "rpmbuild")} --version exited with code 127:\n  ${loader}\n`
    )
    expect(error.message).toContain('Set toolsets.rpm: "system"')
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
    const fpmCalls = vi.mocked(exec).mock.calls.filter(([file]) => file === "fpm")
    expect(fpmCalls).toHaveLength(1)
    return (fpmCalls[0][2] as any).env
  }

  test("rpm with the default toolset: the bundle's bin directory comes first", async () => {
    const env = await fpmEnvFor("rpm", {})
    expect(env.PATH).toBe([path.join(bundleDir, "bin"), "/usr/bin", "/bin"].join(":"))
    expect(env.HOME).toBe("/home/u")
    // the probe ran first, with the environment fpm then gets
    expect(vi.mocked(exec).mock.calls.map(([file]) => path.basename(file))).toEqual(["rpmbuild", "fpm"])
    expect((probeCalls()[0][2] as any).env).toEqual(env)
  })

  test("rpm: a bundle that cannot run fails before fpm runs", async () => {
    vi.mocked(exec).mockImplementation(async file => {
      if (path.basename(file) === "rpmbuild") {
        throw execFailure(file, { message: `Command failed: ${file} --version\n${DYLD_ERROR}`, code: 134 })
      }
      return ""
    })
    const fpm: any = Object.create(FpmTarget.prototype)
    fpm.packager = { config: { toolsets: {} }, buildResourcesDir: "build" }
    await expect(fpm.executeFpm("rpm", { target: "rpm", args: [] }, { PATH: "/usr/bin" })).rejects.toThrow(/cannot run on this host/)
    expect(vi.mocked(exec).mock.calls.filter(([file]) => file === "fpm")).toHaveLength(0)
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
    expect(probeCalls()).toHaveLength(0)
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
