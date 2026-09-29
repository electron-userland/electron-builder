import { Arch, LinuxPackager, Packager, Platform, PlatformPackager, Target } from "app-builder-lib"
import { getAppUpdatePublishConfiguration, getPackAppUpdatePublishConfiguration, PublishManager } from "app-builder-lib/src/publish/PublishManager"
import { derivePublicKeyPem, generateUpdateSigningKeypair, InvalidConfigurationError, log, parsePrivateKey } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { outputFile, outputJson, pathExists, readFile } from "fs-extra"
import { load as yamlLoad } from "js-yaml"
import * as path from "path"
import { afterEach, beforeEach, vi } from "vitest"

// app-update.yml - the feed and trust list every install polls for its lifetime - is shared by all targets built from
// one packed app dir. It must come from the publish settings of the targets that actually emit the manifest, not only
// from the platform/root `publish`: otherwise `nsis.publish: {provider: s3}` alone ships either no app-update.yml
// (no feed, no trust key) or, with a GitHub `repository`, a GitHub feed that never receives a manifest.

beforeEach(() => {
  vi.stubEnv("PUBLISH_FOR_PULL_REQUEST", "true")
  // an ambient token would otherwise make an unconfigured publish resolve to that provider
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "GITLAB_TOKEN", "KEYGEN_TOKEN", "BITBUCKET_TOKEN"]) {
    vi.stubEnv(name, "")
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const signingKey = generateUpdateSigningKeypair()
const trustedKey = derivePublicKeyPem(parsePrivateKey(signingKey.privateKeyPem))

const s3 = { provider: "s3", bucket: "nsis-updates" }
const generic = { provider: "generic", url: "https://example.com/updates" }
const githubRepository = { type: "github", user: "acme", project: "app", source: "package.json" }

function createManagerHooks(publish: "always" | "never" = "always") {
  let onTargetsCreated: (plan: any) => Promise<void> = () => Promise.resolve()
  let onAfterPack: (event: any) => Promise<void> = () => Promise.resolve()
  const packager = {
    projectDir: __dirname,
    config: {},
    onTargetsCreated: (handler: (plan: any) => Promise<void>) => {
      onTargetsCreated = handler
    },
    onAfterPack: (handler: (event: any) => Promise<void>) => {
      onAfterPack = handler
    },
    onArtifactCreated: () => {
      // ignore
    },
  }
  new PublishManager(packager as any, { publish }, new CancellationToken())
  return { afterPack: (event: any) => onAfterPack(event), targetsCreated: (plan: any) => onTargetsCreated(plan) }
}

function createManager(publish: "always" | "never" = "always") {
  return createManagerHooks(publish).afterPack
}

interface StubOptions {
  platform?: Platform
  root?: any
  platformPublish?: any
  repositoryInfo?: any
}

function makePackager({ platform = Platform.WINDOWS, root, platformPublish, repositoryInfo = null }: StubOptions) {
  const keys = [parsePrivateKey(signingKey.privateKeyPem)]
  return {
    platform,
    platformOptions: platformPublish === undefined ? {} : { publish: platformPublish },
    config: root === undefined ? {} : { publish: root },
    appInfo: { version: "1.0.0", updaterCacheDirName: "test-app", channel: null },
    buildResourcesDir: __dirname,
    cancellationToken: new CancellationToken(),
    repositoryInfo: Promise.resolve(repositoryInfo),
    expandMacro: (value: string) => value,
    getResourcesDir: (dir: string) => path.join(dir, "resources"),
    requireUpdateSigningKeys: vi.fn(() => Promise.resolve(keys)),
    updateSigningKeys: { value: Promise.resolve(keys) },
  }
}

function target(name: string, options: any = null, writesUpdateInfo = true) {
  return { name, options, writesUpdateInfo }
}

const electronPlatformName = (platform: Platform) => (platform === Platform.WINDOWS ? "win32" : platform === Platform.MAC ? "darwin" : "linux")

async function afterPackAppUpdate(tmpDir: any, packager: ReturnType<typeof makePackager>, targets: Array<any>, publish: "always" | "never" = "always"): Promise<any> {
  const appOutDir = await tmpDir.getTempDir({ prefix: "unpacked" })
  await createManager(publish)({ packager, electronPlatformName: electronPlatformName(packager.platform), arch: Arch.x64, appOutDir, outDir: appOutDir, targets })
  const file = path.join(appOutDir, "resources", "app-update.yml")
  return (await pathExists(file)) ? yamlLoad(await readFile(file, "utf8")) : null
}

test("nsis.publish alone (no GitHub repository): app-update.yml carries the installer's feed and the trust key", async ({ expect, tmpDir }) => {
  const packager = makePackager({})
  const appUpdate = await afterPackAppUpdate(tmpDir, packager, [target("nsis", { publish: s3 })])
  // before, nothing was written: installs had no feed and, with setFeedURL, no updateManifestPublicKey
  expect(appUpdate).toMatchObject({ provider: "s3", bucket: "nsis-updates", updaterCacheDirName: "test-app" })
  expect(appUpdate.updateManifestPublicKey).toBe(trustedKey)
  expect(packager.requireUpdateSigningKeys).toHaveBeenCalledWith(true)
})

test("nsis.publish alone with a GitHub repository: the installer's feed, not the repository fallback", async ({ expect, tmpDir }) => {
  const packager = makePackager({ repositoryInfo: githubRepository })
  const appUpdate = await afterPackAppUpdate(tmpDir, packager, [target("nsis", { publish: s3 })])
  // before, app-update.yml pointed at GitHub while the manifest went to S3
  expect(appUpdate.provider).toBe("s3")
  expect(appUpdate.owner).toBeUndefined()
  expect(appUpdate.updateManifestPublicKey).toBe(trustedKey)
})

test("the GitHub repository fallback still applies when no level configures publish", async ({ expect, tmpDir }) => {
  const appUpdate = await afterPackAppUpdate(tmpDir, makePackager({ repositoryInfo: githubRepository }), [target("nsis")], "never")
  expect(appUpdate).toMatchObject({ provider: "github", owner: "acme", repo: "app" })
})

test("a target-level publish overrides the platform-level one", async ({ expect, tmpDir }) => {
  const appUpdate = await afterPackAppUpdate(tmpDir, makePackager({ platformPublish: generic }), [target("portable", null, false), target("nsis", { publish: s3 })])
  expect(appUpdate.provider).toBe("s3")
})

test("an installer that emits no manifest (publish: null, or waived) leaves app-update.yml to the platform/root settings", async ({ expect, tmpDir }) => {
  for (const nsisOptions of [{ publish: null }, { publish: { provider: "generic", url: "https://example.com/nsis", publishAutoUpdate: false } }]) {
    const packager = makePackager({ root: generic })
    const appUpdate = await afterPackAppUpdate(tmpDir, packager, [target("nsis", nsisOptions)])
    expect(appUpdate).toMatchObject(generic)
    // no manifest, so no signing requirement - the trust list is still embedded since a key is configured
    expect(packager.requireUpdateSigningKeys).not.toHaveBeenCalled()
    expect(appUpdate.updateManifestPublicKey).toBe(trustedKey)
  }
})

test("targets of one pack that resolve different feeds fail the build and write no app-update.yml", async ({ expect, tmpDir }) => {
  const appOutDir = await tmpDir.getTempDir({ prefix: "win-unpacked" })
  const packager = makePackager({ platformPublish: generic })
  const afterPack = createManager()
  // appx (electron-updater aware) inherits win.publish, nsis overrides it
  const targets = [target("nsis", { publish: s3 }), target("appx", { electronUpdaterAware: true })]
  const error = await afterPack({ packager, electronPlatformName: "win32", arch: Arch.x64, appOutDir, outDir: appOutDir, targets }).then(
    () => null,
    (e: Error) => e
  )
  expect(error).toBeInstanceOf(InvalidConfigurationError)
  expect(error!.message).toContain(`targets "nsis", "appx" are built from the same windows x64 app`)
  expect(error!.message).toContain("nsis -> s3, appx -> generic")
  expect(error!.message).toContain("win.publish")
  expect(await pathExists(path.join(appOutDir, "resources", "app-update.yml"))).toBe(false)
})

test("a non-publishing build only warns about conflicting feeds, once, says publishing fails, and writes no app-update.yml", async ({ expect, tmpDir }) => {
  const warn = vi.spyOn(log, "warn")
  const conflictWarnings = () => warn.mock.calls.filter(([, message]) => String(message).includes("different auto-update feeds"))
  try {
    const packager = makePackager({ platformPublish: generic })
    const targets = [target("nsis", { publish: s3 }), target("appx", { electronUpdaterAware: true })]
    for (const arch of [Arch.x64, Arch.arm64]) {
      const appOutDir = await tmpDir.getTempDir({ prefix: "win-unpacked" })
      await createManager("never")({ packager, electronPlatformName: "win32", arch, appOutDir, outDir: appOutDir, targets })
      expect(await pathExists(path.join(appOutDir, "resources", "app-update.yml"))).toBe(false)
    }
    // the targets that write the file themselves get no config either, and do not repeat the warning
    expect(await getPackAppUpdatePublishConfiguration(packager as any, targets as any, Arch.x64, false)).toBeNull()

    expect(conflictWarnings()).toHaveLength(1)
    const [fields, message] = conflictWarnings()[0]
    expect(message).toContain(`targets "nsis", "appx" are built from the same windows x64 app`)
    expect(message).toContain("No app-update.yml is written")
    expect(message).toContain("Publishing this configuration fails with an InvalidConfigurationError")
    expect((fields as any).solution).toContain("win.publish")
    // the manifests are still emitted, so the signing advisory applies
    expect(packager.requireUpdateSigningKeys).toHaveBeenCalledWith(false)
  } finally {
    warn.mockRestore()
  }
})

test("a publishing build fails on conflicting feeds at build start, before anything is packed", async ({ expect }) => {
  const { targetsCreated } = createManagerHooks("always")
  const packager = makePackager({ platform: Platform.LINUX, platformPublish: generic })
  // also covers a prepackaged app, where no afterPack runs and AppImage/deb would only resolve with isPublish=false
  await expect(targetsCreated([{ packager, arch: Arch.x64, targets: [target("appimage", { publish: s3 }), target("deb")] }])).rejects.toThrow(
    /different auto-update feeds \(appimage -> s3, deb -> generic.*To fix it, configure `publish` once at the platform level \(`linux.publish`\)/
  )
  expect(packager.requireUpdateSigningKeys).not.toHaveBeenCalled()

  const agreeing = makePackager({ platform: Platform.LINUX, platformPublish: generic })
  await targetsCreated([{ packager: agreeing, arch: Arch.x64, targets: [target("appimage", { publish: s3 }), target("deb", { publish: null })] }])
  expect(agreeing.requireUpdateSigningKeys).toHaveBeenCalledWith(true)
})

test("targets of one pack with the same feed (in any key order) are fine; later providers may differ", async ({ expect, tmpDir }) => {
  const targets = [target("nsis", { publish: [{ bucket: "nsis-updates", provider: "s3" }, "github"] }), target("nsis-web", { publish: s3 })]
  const appUpdate = await afterPackAppUpdate(tmpDir, makePackager({ repositoryInfo: githubRepository }), targets)
  expect(appUpdate).toMatchObject(s3)
})

test("the same feed with different upload-only options is fine", async ({ expect, tmpDir }) => {
  // nsis sets publishAutoUpdate/timeout explicitly, the updater-aware appx inherits the same generic url without them
  const nsis = { publish: { ...generic, publishAutoUpdate: true, timeout: 600000 } }
  const packager = makePackager({ platformPublish: generic })
  const appUpdate = await afterPackAppUpdate(tmpDir, packager, [target("nsis", nsis), target("appx", { electronUpdaterAware: true })])
  expect(appUpdate).toMatchObject(generic)
  expect(appUpdate.updateManifestPublicKey).toBe(trustedKey)

  const s3Upload = { publish: { ...s3, acl: "private", storageClass: "STANDARD_IA", encryption: "AES256", channel: null } }
  expect(await afterPackAppUpdate(tmpDir, makePackager({ platformPublish: s3 }), [target("nsis", s3Upload), target("nsis-web")])).toMatchObject(s3)
})

test("a different url, bucket, path or channel is a different feed", async ({ expect, tmpDir }) => {
  const conflicts: Array<[any, any]> = [
    [generic, { ...generic, url: "https://example.com/other" }],
    [s3, { ...s3, bucket: "other-bucket" }],
    [s3, { ...s3, path: "beta" }],
    [generic, { ...generic, channel: "beta" }],
    [
      { provider: "github", owner: "acme", repo: "app" },
      { provider: "github", owner: "acme", repo: "other" },
    ],
  ]
  for (const [nsis, appx] of conflicts) {
    const targets = [target("nsis", { publish: nsis }), target("appx", { electronUpdaterAware: true, publish: appx })]
    await expect(afterPackAppUpdate(tmpDir, makePackager({}), targets), JSON.stringify(appx)).rejects.toThrow(InvalidConfigurationError)
  }
})

test("a non-manifest target does not take part in the rule", async ({ expect, tmpDir }) => {
  // the portable exe's own publish differs, but it writes no update info and does not decide the feed
  const appUpdate = await afterPackAppUpdate(tmpDir, makePackager({}), [target("portable", { publish: generic }, false), target("nsis", { publish: s3 })])
  expect(appUpdate.provider).toBe("s3")
})

test("dmg and zip must agree on macOS", async ({ expect, tmpDir }) => {
  const packager = makePackager({ platform: Platform.MAC, platformPublish: generic })
  expect(await afterPackAppUpdate(tmpDir, packager, [target("dmg", { publish: s3 }), target("zip", { publish: s3 })])).toMatchObject(s3)
  await expect(afterPackAppUpdate(tmpDir, packager, [target("dmg", { publish: s3 }), target("zip")])).rejects.toThrow(/different auto-update feeds \(dmg -> s3, zip -> generic/)
})

test("Linux: AppImage and deb without overrides embed the platform feed, from afterPack and from the targets themselves", async ({ expect, tmpDir }) => {
  const packager = makePackager({ platform: Platform.LINUX, platformPublish: generic })
  const targets = [target("appimage"), target("deb"), target("snap", null, false)]
  expect(await afterPackAppUpdate(tmpDir, packager, targets)).toMatchObject(generic)
  const fromTarget = await getPackAppUpdatePublishConfiguration(packager as any, targets as any, Arch.x64, false)
  expect(fromTarget).toMatchObject(generic)
  expect(fromTarget!.updateManifestPublicKey).toBe(trustedKey)
})

test("Linux: a deb that opts out does not overwrite the AppImage's feed", async ({ expect, tmpDir }) => {
  // both targets rewrite the shared app-update.yml; each must write the pack's feed, or they would race
  const packager = makePackager({ platform: Platform.LINUX, platformPublish: generic })
  const targets = [target("appimage", { publish: s3 }), target("deb", { publish: null })]
  expect(await afterPackAppUpdate(tmpDir, packager, targets)).toMatchObject(s3)
  for (const self of targets) {
    expect(await getPackAppUpdatePublishConfiguration(packager as any, targets as any, Arch.x64, false), self.name).toMatchObject(s3)
  }
})

test("getAppUpdatePublishConfiguration honors the target-specific options it is given", async ({ expect }) => {
  const packager = makePackager({ platform: Platform.LINUX, platformPublish: generic }) as any
  expect(await getAppUpdatePublishConfiguration(packager, { publish: s3 } as any, Arch.x64, false)).toMatchObject(s3)
  expect(await getAppUpdatePublishConfiguration(packager, null, Arch.x64, false)).toMatchObject(generic)
  // a target that emits no manifest falls back to the platform feed
  expect(await getAppUpdatePublishConfiguration(packager, { publish: null } as any, Arch.x64, false)).toMatchObject(generic)
  expect(packager.requireUpdateSigningKeys).toHaveBeenCalledTimes(2)
})

// Records what an AppImage/deb build() sees: the targets packaged from its app dir for its arch.
class RecordingTarget extends Target {
  readonly options = null
  packTargets: ReadonlyArray<Target> | undefined
  arch: Arch | undefined

  constructor(
    name: string,
    readonly outDir: string,
    private readonly packager: PlatformPackager<any>
  ) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    this.arch = arch
    // look up only after the build has moved on: an AppImage/deb resolves its feed well after build() starts, when
    // the next arch may already have been packaged
    await new Promise(resolve => setTimeout(resolve, 100))
    this.packTargets = this.packager.getPackTargets(appOutDir, arch)
  }
}

async function buildPrepackagedLinux(tmpDir: any, targets: Map<Arch, Array<string>>): Promise<Array<RecordingTarget>> {
  const projectDir = await tmpDir.getTempDir({ prefix: "project" })
  await outputJson(path.join(projectDir, "package.json"), { name: "feed-app", version: "1.0.0", description: "test", author: "Foo Bar <foo@example.com>" })
  const prepackaged = await tmpDir.getTempDir({ prefix: "prepackaged" })
  await outputFile(path.join(prepackaged, "resources", "app.asar"), "")

  const created: Array<RecordingTarget> = []
  class RecordingLinuxPackager extends LinuxPackager {
    createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
      for (const name of targets) {
        mapper(name, outDir => {
          const it = new RecordingTarget(name, outDir, this)
          created.push(it)
          return it
        })
      }
    }
  }
  const packager = new Packager({
    projectDir,
    prepackaged,
    targets: new Map([[Platform.LINUX, targets]]),
    config: { electronVersion: "38.0.0", directories: { output: path.join(projectDir, "dist") } },
    platformPackagerFactory: info => new RecordingLinuxPackager(info),
  })
  await packager.build()
  return created
}

test("a target's build() can look up the other targets of its pack", async ({ expect, tmpDir }) => {
  const created = await buildPrepackagedLinux(tmpDir, new Map([[Arch.x64, ["appimage", "deb"]]]))
  expect(created.map(it => it.name)).toEqual(["appimage", "deb"])
  for (const it of created) {
    expect(it.packTargets).toEqual(created)
  }
})

test("prepackaged multi-arch: each arch's targets look up their own pack, although the app dir is the same", async ({ expect, tmpDir }) => {
  const created = await buildPrepackagedLinux(
    tmpDir,
    new Map([
      [Arch.x64, ["appimage", "deb"]],
      [Arch.arm64, ["snap"]],
    ])
  )
  expect(created.map(it => `${it.name}:${Arch[it.arch!]}`)).toEqual(["appimage:x64", "deb:x64", "snap:arm64"])
  for (const it of created) {
    expect(it.packTargets, it.name).toEqual(created.filter(other => other.arch === it.arch))
  }
})
