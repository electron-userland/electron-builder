import { afterEach, beforeEach, describe, test, expect, vi } from "vitest"
import { Arch, exec, Executables, InvalidConfigurationError, spawn } from "builder-util"
import { buildSnap, snapArchStringToArch } from "app-builder-lib/src/targets/linux/snap/snapcraftBuilder"
import type { LinuxPackager } from "app-builder-lib/src/linuxPackager"
import type { RemoteBuildOptions, SnapOptions24 } from "app-builder-lib/src/options/SnapOptions"
import type { SnapcraftYAML } from "app-builder-lib/src/targets/linux/snap/snapcraft"
import { mkdir, writeFile } from "fs/promises"
import * as path from "path"
import type { TmpDir } from "temp-file"

vi.mock("builder-util", async () => {
  const actual = await vi.importActual<typeof import("builder-util")>("builder-util")
  return { ...actual, exec: vi.fn(), spawn: vi.fn() }
})

// the delay before a remote build is retried
vi.mock("builder-util-runtime", async () => {
  const actual = await vi.importActual<typeof import("builder-util-runtime")>("builder-util-runtime")
  return { ...actual, sleep: vi.fn(async () => {}) }
})

describe("snapArchStringToArch", () => {
  test.each([
    ["amd64", Arch.x64],
    ["arm64", Arch.arm64],
    ["armhf", Arch.armv7l],
    ["i386", Arch.ia32],
    ["i686", Arch.ia32],
  ])("%s → Arch.%s", (snapArch, expected) => {
    expect(snapArchStringToArch(snapArch)).toBe(expected)
  })

  test("unknown arch defaults to x64", () => {
    expect(snapArchStringToArch("riscv64")).toBe(Arch.x64)
  })
})

describe("buildSnap — snapcraft.core24.buildEnvironment", { concurrent: false }, () => {
  const SNAP: SnapcraftYAML = { name: "app", base: "core24", confinement: "strict", parts: { app: { plugin: "dump" } }, apps: { app: { command: "app" } } }
  const originalPlatform = process.platform
  const setPlatform = (platform: NodeJS.Platform) => Object.defineProperty(process, "platform", { value: platform, configurable: true })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Executables, "resolve").mockReturnValue("/snap/bin/snapcraft")
    vi.mocked(exec).mockResolvedValue("snapcraft 8.4.0")
    // writes the snap a build leaves in its working directory: the --output file, or one named by snapcraft (prime packs nothing)
    vi.mocked(spawn).mockImplementation(async (_command, args, options) => {
      const argv = args ?? []
      if (argv[0] !== "prime") {
        const output = argv.indexOf("--output")
        await writeFile(path.join(String(options?.cwd), output === -1 ? "app_1.0.0_amd64.snap" : argv[output + 1]), "snap")
      }
    })
    vi.stubEnv("SNAP_CSC_LINK", "")
    vi.stubEnv("SNAPCRAFT_STORE_CREDENTIALS", "")
    vi.stubEnv("SNAPCRAFT_BUILD_ENVIRONMENT", undefined)
    setPlatform("linux")
  })

  afterEach(() => {
    setPlatform(originalPlatform)
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  /** A stage directory with the app in it, and a build of it into an artifact path in another directory. */
  async function stage(tmpDir: TmpDir) {
    const stageDir = await tmpDir.createTempDir({ prefix: "snap-stage" })
    await mkdir(path.join(stageDir, "app"))
    const artifactPath = path.join(await tmpDir.createTempDir({ prefix: "snap-out" }), "app_1.0.0_amd64.snap")
    const build = (buildEnvironment: SnapOptions24["buildEnvironment"], remoteBuild?: RemoteBuildOptions) =>
      buildSnap({ snapcraftConfig: SNAP, stageDir, artifactPath, packager: { buildResourcesDir: stageDir } as LinuxPackager, buildEnvironment, remoteBuild })
    return { stageDir, artifactPath, build }
  }

  /** The snapcraft runs: the arguments (without the --verbose of debug logging) and the variables that select the build or its credentials. */
  function snapcraftRuns() {
    return vi.mocked(spawn).mock.calls.map(([, args, options]) => ({
      args: (args ?? []).filter(it => it !== "--verbose"),
      buildEnvironment: options?.env?.SNAPCRAFT_BUILD_ENVIRONMENT,
      credentials: options?.env?.SNAPCRAFT_STORE_CREDENTIALS,
    }))
  }

  test.for([
    ["lxd", ["pack", "--use-lxd"], undefined],
    ["multipass", ["pack"], "multipass"],
  ] as const)('"%s" runs snapcraft pack in its provider', async ([buildEnvironment, args, variable], { expect, tmpDir }) => {
    const { artifactPath, build } = await stage(tmpDir)
    await expect(build(buildEnvironment)).resolves.toEqual([artifactPath])
    expect(snapcraftRuns()).toEqual([{ args, buildEnvironment: variable, credentials: undefined }])
  })

  test('"host" primes in destructive mode, then packs the prime directory', async ({ expect, tmpDir }) => {
    const { stageDir, artifactPath, build } = await stage(tmpDir)
    await expect(build("host")).resolves.toEqual([artifactPath])
    expect(snapcraftRuns()).toEqual([
      { args: ["prime", "--destructive-mode"], buildEnvironment: "host", credentials: undefined },
      { args: ["pack", "--output", expect.stringMatching(/^eb-snap-\w+\.snap$/), path.join(stageDir, "prime")], buildEnvironment: "host", credentials: undefined },
    ])
  })

  test("unset, snapcraft packs with its default provider", async ({ expect, tmpDir }) => {
    const { artifactPath, build } = await stage(tmpDir)
    await expect(build(undefined)).resolves.toEqual([artifactPath])
    expect(snapcraftRuns()).toEqual([{ args: ["pack", "--output", expect.stringMatching(/^eb-snap-\w+\.snap$/)], buildEnvironment: undefined, credentials: undefined }])
  })

  test('"remote" runs remote-build with the remoteBuild options and the store credentials', async ({ expect, tmpDir }) => {
    vi.stubEnv("SNAPCRAFT_STORE_CREDENTIALS", "creds")
    const { stageDir, artifactPath, build } = await stage(tmpDir)
    await expect(build("remote", { buildFor: ["amd64", "arm64"], acceptPublicUpload: true })).resolves.toEqual([artifactPath])
    expect(snapcraftRuns()).toEqual([
      { args: ["remote-build", "--launchpad-accept-public-upload", "--build-for", "amd64,arm64", "--output-dir", stageDir], buildEnvironment: undefined, credentials: "creds" },
    ])
  })

  test('"remote" without remoteBuild options still builds on Launchpad', async ({ expect, tmpDir }) => {
    vi.stubEnv("SNAPCRAFT_STORE_CREDENTIALS", "creds")
    const { stageDir, build } = await stage(tmpDir)
    await build("remote")
    expect(snapcraftRuns().map(it => it.args)).toEqual([["remote-build", "--output-dir", stageDir]])
  })

  test("only a remote build requires Snap Store credentials", async ({ expect, tmpDir }) => {
    const { build } = await stage(tmpDir)
    await expect(build("remote")).rejects.toThrow(/Snapcraft authentication required/)
    expect(spawn).not.toHaveBeenCalled()
    await expect(build("lxd")).resolves.toHaveLength(1)
  })

  test.for([
    ["remote", true, 2],
    ["lxd", false, 1],
  ] as const)('a network timeout is retried for "%s": %s', async ([buildEnvironment, resolves, runs], { expect, tmpDir }) => {
    vi.stubEnv("SNAPCRAFT_STORE_CREDENTIALS", "creds")
    vi.mocked(spawn).mockRejectedValueOnce(new Error("network timeout"))
    const { build } = await stage(tmpDir)
    const result = build(buildEnvironment)
    await (resolves ? expect(result).resolves.toHaveLength(1) : expect(result).rejects.toThrow("network timeout"))
    expect(spawn).toHaveBeenCalledTimes(runs)
  })

  test.for(["lxd", "host"] as const)('"%s" builds only on Linux', async (buildEnvironment, { expect, tmpDir }) => {
    setPlatform("darwin")
    const { build } = await stage(tmpDir)
    const error = await build(buildEnvironment).catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain(`snapcraft.core24.buildEnvironment "${buildEnvironment}" builds only on Linux`)
    expect(error.message).toContain('On darwin, set it to "multipass" or "remote"')
    expect(spawn).not.toHaveBeenCalled()
  })

  test('on macOS an unset environment names "multipass" and "remote", and "multipass" builds', async ({ expect, tmpDir }) => {
    setPlatform("darwin")
    const { artifactPath, build } = await stage(tmpDir)
    const error = await build(undefined).catch(e => e)
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error.message).toContain('No snap build environment is set for darwin: set snapcraft.core24.buildEnvironment to "multipass" or "remote"')
    expect(spawn).not.toHaveBeenCalled()
    await expect(build("multipass")).resolves.toEqual([artifactPath])
  })
})
