import { Arch, LinuxPackager, Packager, Platform, PlatformPackager, Target } from "app-builder-lib"
import { PublishManager } from "app-builder-lib/src/publish/PublishManager"
import { InvalidConfigurationError } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { outputFile, outputJson } from "fs-extra"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

// The update-manifest signing requirement must fail a publishing build before an artifact that produces update
// metadata is uploaded - writeUpdateInfoFiles only runs after every upload has been awaited, so failing there can
// leave installers (or a draft release) published without their manifest.

beforeEach(() => {
  // on pull_request CI runs, isPullRequest() would otherwise turn `publish: "always"` into a non-publishing build
  vi.stubEnv("PUBLISH_FOR_PULL_REQUEST", "true")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function createManager() {
  let onTargetsCreated: (plan: any) => Promise<void> = () => Promise.resolve()
  const packager = {
    projectDir: __dirname,
    config: {},
    onTargetsCreated: (handler: (plan: any) => Promise<void>) => {
      onTargetsCreated = handler
    },
    onAfterPack: () => {
      // ignore
    },
    onArtifactCreated: () => {
      // ignore
    },
  }
  const manager = new PublishManager(packager as any, { publish: "always" }, new CancellationToken())
  const scheduleUpload = vi.spyOn(manager, "scheduleUpload").mockResolvedValue()
  return { manager, scheduleUpload, targetsCreated: (plan: any) => onTargetsCreated(plan) }
}

function makePlatformPackager(publish: any, requireUpdateSigningKeys: (required: boolean) => Promise<Array<any>>) {
  return {
    platform: Platform.WINDOWS,
    platformOptions: {},
    config: { publish },
    appInfo: { version: "1.0.0", updaterCacheDirName: "test-app" },
    expandMacro: (value: string) => value,
    requireUpdateSigningKeys: vi.fn(requireUpdateSigningKeys),
  }
}

function makeEvent(packager: any, targetPublish?: any) {
  return {
    packager,
    target: { name: "nsis", options: targetPublish === undefined ? null : { publish: targetPublish }, outDir: __dirname },
    file: "/nonexistent/App Setup 1.0.0.exe",
    arch: Arch.x64,
    isWriteUpdateInfo: true,
  }
}

const missingKey = (required: boolean) => (required ? Promise.reject(new InvalidConfigurationError("auto-update manifests must be signed")) : Promise.resolve([]))

function artifactCreated(manager: PublishManager, event: any): Promise<void> {
  return (manager as any).artifactCreatedWithoutExplicitPublishConfig(event)
}

test("a missing signing key fails before the manifest-producing artifact is uploaded", async ({ expect }) => {
  const { manager, scheduleUpload } = createManager()
  const packager = makePlatformPackager({ provider: "generic", url: "https://example.com/updates" }, missingKey)
  await expect(artifactCreated(manager, makeEvent(packager))).rejects.toThrow(/must be signed/)
  expect(packager.requireUpdateSigningKeys).toHaveBeenCalledWith(true)
  expect(scheduleUpload).not.toHaveBeenCalled()
})

test("a target-level publish config that emits a manifest is enforced even when the platform-level one is waived", async ({ expect }) => {
  // onAfterPack resolves the platform-level config only, so this is the case it cannot catch
  const { manager, scheduleUpload } = createManager()
  const packager = makePlatformPackager({ provider: "generic", url: "https://example.com/updates", publishAutoUpdate: false }, missingKey)
  await expect(artifactCreated(manager, makeEvent(packager, { provider: "generic", url: "https://example.com/nsis" }))).rejects.toThrow(/must be signed/)
  expect(scheduleUpload).not.toHaveBeenCalled()
})

test("no preflight when no provider emits a manifest, or the artifact writes no update info", async ({ expect }) => {
  const { manager, scheduleUpload } = createManager()
  const waived = makePlatformPackager({ provider: "generic", url: "https://example.com/updates", publishAutoUpdate: false }, missingKey)
  await artifactCreated(manager, makeEvent(waived))
  expect(waived.requireUpdateSigningKeys).not.toHaveBeenCalled()
  expect(scheduleUpload).toHaveBeenCalledTimes(1)

  const portable = makePlatformPackager({ provider: "generic", url: "https://example.com/updates" }, missingKey)
  await artifactCreated(manager, { ...makeEvent(portable), isWriteUpdateInfo: false })
  expect(portable.requireUpdateSigningKeys).not.toHaveBeenCalled()
  expect(scheduleUpload).toHaveBeenCalledTimes(2)
})

function makeTarget(name: string, writesUpdateInfo: boolean, options: any = null) {
  return { name, options, writesUpdateInfo }
}

test("build-start preflight: enforced for every planned target that emits update info, before anything is packed", async ({ expect }) => {
  const { targetsCreated } = createManager()
  const updates = { provider: "generic", url: "https://example.com/updates" }

  // a portable exe, a waived platform and a target-level `publish: null` need no key
  const waived = makePlatformPackager({ ...updates, publishAutoUpdate: false }, missingKey)
  const optedOutTarget = makePlatformPackager(updates, missingKey)
  await targetsCreated([
    { packager: optedOutTarget, arch: Arch.x64, targets: [makeTarget("portable", false), makeTarget("nsis", true, { publish: null })] },
    { packager: waived, arch: Arch.x64, targets: [makeTarget("nsis", true)] },
  ])
  expect(optedOutTarget.requireUpdateSigningKeys).not.toHaveBeenCalled()
  expect(waived.requireUpdateSigningKeys).not.toHaveBeenCalled()

  // a later arch (or platform) whose installer emits a manifest fails the whole build up front
  const required = makePlatformPackager(updates, missingKey)
  await expect(
    targetsCreated([
      { packager: waived, arch: Arch.x64, targets: [makeTarget("nsis", true)] },
      { packager: required, arch: Arch.arm64, targets: [makeTarget("portable", false), makeTarget("nsis", true)] },
    ])
  ).rejects.toThrow(/must be signed/)
  expect(required.requireUpdateSigningKeys).toHaveBeenCalledWith(true)
})

// Emits one artifact per build, like a real target; `isWriteUpdateInfo` mirrors `writesUpdateInfo`.
class FakeTarget extends Target {
  readonly options = null

  constructor(
    name: string,
    readonly outDir: string,
    private readonly packager: PlatformPackager<any>,
    private readonly info: Packager,
    private readonly updateInfo: boolean
  ) {
    super(name)
  }

  get writesUpdateInfo(): boolean {
    return this.updateInfo
  }

  async build(_appOutDir: string, arch: Arch): Promise<any> {
    const file = path.join(this.outDir, `app-${this.name}-${Arch[arch]}.bin`)
    await outputFile(file, this.name)
    await this.info.emitArtifactBuildCompleted({ file, target: this, arch, packager: this.packager, isWriteUpdateInfo: this.updateInfo })
  }
}

class FakeLinuxPackager extends LinuxPackager {
  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
    for (const name of targets) {
      mapper(name, outDir => new FakeTarget(name, outDir, this, this.info, name === "appimage"))
    }
  }
}

test("a target without update info built before the manifest-producing one is not uploaded when the signing key is missing", async ({ expect, tmpDir }) => {
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY", "")
  vi.stubEnv("ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE", "")
  const projectDir = await tmpDir.getTempDir({ prefix: "project" })
  await outputJson(path.join(projectDir, "package.json"), { name: "preflight-app", version: "1.0.0", description: "test", author: "Foo Bar <foo@example.com>" })
  const prepackaged = await tmpDir.getTempDir({ prefix: "prepackaged" })
  await outputFile(path.join(prepackaged, "resources", "app.asar"), "")

  const packager = new Packager({
    projectDir,
    prepackaged,
    // the archive is listed (and, being async, built) before the AppImage, which is the only one to emit update info
    targets: Platform.LINUX.createTarget(["tar.gz", "appimage"], Arch.x64),
    config: {
      electronVersion: "38.0.0",
      publish: { provider: "generic", url: "https://example.com/updates" },
      directories: { output: path.join(projectDir, "dist") },
    },
    platformPackagerFactory: info => new FakeLinuxPackager(info),
  })
  const manager = new PublishManager(packager, { publish: "always" })
  const scheduleUpload = vi.spyOn(manager, "scheduleUpload").mockResolvedValue()

  // without the build-start preflight, packager.build() resolves, the tar.gz is scheduled for upload, and only the
  // AppImage's own artifact check (awaited in awaitTasks) fails
  await expect(packager.build().then(() => manager.awaitTasks())).rejects.toThrow(/must be signed/)
  expect(scheduleUpload).not.toHaveBeenCalled()
})
