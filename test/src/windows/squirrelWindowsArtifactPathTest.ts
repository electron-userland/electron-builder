import { Arch, Configuration, getArchSuffix, WinPackager } from "app-builder-lib"
import SquirrelWindowsTarget from "electron-builder-squirrel-windows/src/SquirrelWindowsTarget"
import { createWindowsInstaller } from "electron-builder-squirrel-windows/src/windowsInstaller"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import { TmpDir } from "temp-file"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// `SquirrelWindowsTarget.build()` reports the `<id>-<version>-full.nupkg` / `-delta.nupkg` files that
// Squirrel's --releasify writes next to Setup.exe. Squirrel names them after the nuspec id, so the reported
// paths must be derived from the same id `computeEffectiveDistOptions` puts in the nuspec — including when
// `useAppIdAsId` swaps that id from the package name to the appId. Runs offline on every OS: the real
// `computeEffectiveDistOptions` is exercised (toolset provisioning stubbed), the Squirrel invocation is mocked.
vi.mock("electron-builder-squirrel-windows/src/windowsInstaller", async () => {
  const actual = await vi.importActual<typeof import("electron-builder-squirrel-windows/src/windowsInstaller")>("electron-builder-squirrel-windows/src/windowsInstaller")
  return { ...actual, createWindowsInstaller: vi.fn().mockResolvedValue(undefined) }
})

const ICON_URL = "https://raw.githubusercontent.com/szwacz/electron-boilerplate/master/resources/windows/icon.ico"

describe("SquirrelWindowsTarget.build nupkg artifact paths", () => {
  let projectDir: string
  let tempDirManager: TmpDir

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "eb-squirrel-artifact-path-test-"))
    tempDirManager = new TmpDir("squirrel-artifact-path-test")
    vi.mocked(createWindowsInstaller).mockClear()
  })

  afterEach(async () => {
    await tempDirManager.cleanup().catch(() => {})
    await rm(projectDir, { recursive: true, force: true }).catch(() => {})
  })

  async function build(squirrelWindows: Configuration["squirrelWindows"] = {}, arch = Arch.x64) {
    const buildResourcesDir = path.join(projectDir, "build")
    const vendorDir = path.join(projectDir, "vendor")
    await mkdir(buildResourcesDir, { recursive: true })
    await mkdir(vendorDir, { recursive: true })

    // mirrors test/fixtures/test-app-one/package.json
    const metadata = {
      name: "TestApp",
      productName: "Test App ßW",
      version: "1.1.0",
      description: "Test Application",
      author: { name: "Foo Bar", email: "foo@example.com" },
    }
    const config: Configuration = {
      appId: "org.electron-builder.testApp",
      squirrelWindows: { iconUrl: ICON_URL, ...squirrelWindows },
    }
    const packager = new WinPackager({
      config,
      metadata,
      devMetadata: null,
      options: {},
      projectDir,
      buildResourcesDir,
      relativeBuildResourcesDirname: "build",
      repositoryInfo: Promise.resolve(null),
      tempDirManager,
      framework: { defaultAppIdPrefix: "com.electron." },
    } as any)
    const target = new SquirrelWindowsTarget(packager, path.join(projectDir, "dist"))

    // toolset provisioning, stub generation and the post-build signing step all need the real vendor binaries
    ;(target as any).prepareSignedVendorDirectory = vi.fn().mockResolvedValue(vendorDir)
    ;(target as any).select7zipArch = vi.fn()
    ;(target as any).generateStubExecutableExe = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(packager, "signAndEditResources").mockResolvedValue(undefined as never)
    vi.spyOn(packager, "emitArtifactBuildStarted").mockResolvedValue(undefined)
    vi.spyOn(packager, "emitArtifactBuildCompleted").mockResolvedValue(undefined)
    const emitArtifactCreated = vi.spyOn(packager, "emitArtifactCreated").mockResolvedValue(undefined)

    await target.build(path.join(target.outDir, "win-unpacked"), arch)
    await target.buildQueueManager.awaitTasks()

    expect(createWindowsInstaller).toHaveBeenCalledTimes(1)
    const distOptions = vi.mocked(createWindowsInstaller).mock.calls[0][0]
    const installerOutDir = path.join(target.outDir, `squirrel-windows${getArchSuffix(arch)}`)
    const createdFiles = emitArtifactCreated.mock.calls.map(([event]) => event.file)
    return { distOptions, installerOutDir, createdFiles }
  }

  test("useAppIdAsId: true → the reported nupkg path uses the appId, matching the nuspec id", async () => {
    const { distOptions, installerOutDir, createdFiles } = await build({ useAppIdAsId: true })
    expect(distOptions.name).toBe("org.electron-builder.testApp")
    expect(createdFiles).toContain(path.join(installerOutDir, "org.electron-builder.testApp-1.1.0-full.nupkg"))
    expect(createdFiles).not.toContain(path.join(installerOutDir, "TestApp-1.1.0-full.nupkg"))
    expect(createdFiles).toContain(path.join(installerOutDir, "RELEASES"))
  })

  test("useAppIdAsId unset → the reported nupkg path uses the package name, matching the nuspec id", async () => {
    const { distOptions, installerOutDir, createdFiles } = await build()
    expect(distOptions.name).toBe("TestApp")
    expect(createdFiles).toContain(path.join(installerOutDir, "TestApp-1.1.0-full.nupkg"))
    expect(createdFiles).toContain(path.join(installerOutDir, "RELEASES"))
  })

  test("useAppIdAsId with remoteReleases → the delta nupkg path uses the appId too", async () => {
    const { distOptions, installerOutDir, createdFiles } = await build({ useAppIdAsId: true, remoteReleases: "https://github.com/some-user/some-project" }, Arch.arm64)
    expect(distOptions.name).toBe("org.electron-builder.testApp")
    expect(installerOutDir).toBe(path.join(projectDir, "dist", "squirrel-windows-arm64"))
    expect(createdFiles).toContain(path.join(installerOutDir, "org.electron-builder.testApp-1.1.0-full.nupkg"))
    expect(createdFiles).toContain(path.join(installerOutDir, "org.electron-builder.testApp-1.1.0-delta.nupkg"))
  })

  test("explicit squirrelWindows.name → the reported nupkg path uses that name", async () => {
    const { distOptions, installerOutDir, createdFiles } = await build({ name: "CustomName" })
    expect(distOptions.name).toBe("CustomName")
    expect(createdFiles).toContain(path.join(installerOutDir, "CustomName-1.1.0-full.nupkg"))
  })
})
