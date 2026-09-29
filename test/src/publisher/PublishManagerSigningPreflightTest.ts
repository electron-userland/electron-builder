import { Arch, Platform } from "app-builder-lib"
import { PublishManager } from "app-builder-lib/src/publish/PublishManager"
import { InvalidConfigurationError } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
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
  const packager = {
    projectDir: __dirname,
    config: {},
    onAfterPack: () => {
      // ignore
    },
    onArtifactCreated: () => {
      // ignore
    },
  }
  const manager = new PublishManager(packager as any, { publish: "always" }, new CancellationToken())
  const scheduleUpload = vi.spyOn(manager, "scheduleUpload").mockResolvedValue()
  return { manager, scheduleUpload }
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
