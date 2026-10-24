import { Arch, Platform } from "app-builder-lib"
import { createSignManager } from "app-builder-lib/src/codeSign/win/signManager"
import { getAppUpdatePublishConfiguration, PublishManager } from "app-builder-lib/src/publish/PublishManager"
import { InvalidConfigurationError } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { pathExists, readFile } from "fs-extra"
import { load as yamlLoad } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { afterEach, beforeEach, describe, vi } from "vitest"

// electron-updater 7 rejects an NSIS update whose app-update.yml has no publisherName, so since electron-builder v27 a Windows build that
// writes app-update.yml (any provider, any target-level publish) fails unless a publisherName resolves or win.verifyUpdateCodeSignature
// is false - which writes the explicit `verifyUpdateCodeSignature: false` marker instead. These drive PublishManager's afterPack handler
// with the real sign managers on a stub Windows packager, so no Electron download or signing tool is needed.

const MISSING_DOCS = "https://www.electron.build/docs/migration/v27-build-changes#missing-publishername-fails-update-verification"

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

const generic = { provider: "generic", url: "https://example.com/updates" }

function createAfterPack(publish: "always" | "never" = "never") {
  let onAfterPack: (event: any) => Promise<void> = () => Promise.resolve()
  const packager = {
    projectDir: __dirname,
    config: {},
    onTargetsCreated: () => {
      // ignore
    },
    onAfterPack: (handler: (event: any) => Promise<void>) => {
      onAfterPack = handler
    },
    onArtifactCreated: () => {
      // ignore
    },
  }
  new PublishManager(packager as any, { publish }, new CancellationToken())
  return (event: any) => onAfterPack(event)
}

/** A Windows packager stub with the real sign manager for `win` (the platform options: sign, verifyUpdateCodeSignature, publish). */
function makeWinPackager(win: Record<string, any>) {
  const packager: any = {
    platform: Platform.WINDOWS,
    platformOptions: win,
    platformSpecificBuildOptions: win,
    config: {},
    projectDir: __dirname,
    appInfo: { version: "1.0.0", updaterCacheDirName: "test-app", channel: null },
    buildResourcesDir: __dirname,
    cancellationToken: new CancellationToken(),
    repositoryInfo: Promise.resolve(null),
    expandMacro: (value: string) => value,
    getResourcesDir: (dir: string) => path.join(dir, "resources"),
    requireUpdateSigningKeys: vi.fn(() => Promise.resolve([])),
    updateSigningKeys: { value: Promise.resolve([]) },
    // stand-ins for WIN_CSC_LINK / CSC_LINK, so a certificate link in the environment of the test run is not picked up
    getCscLink: () => null,
    getCscPassword: () => null,
    get isForceCodeSigningVerification() {
      return win.verifyUpdateCodeSignature !== false
    },
  }
  packager.signingManager = new Lazy(() => Promise.resolve(createSignManager(packager)))
  return packager
}

function target(name: string, options: any = null, writesUpdateInfo = true) {
  return { name, options, writesUpdateInfo }
}

async function afterPack(tmpDir: any, win: Record<string, any>, targets: Array<any> = [target("nsis")]): Promise<{ appUpdate: any; error: Error | null }> {
  const appOutDir = await tmpDir.getTempDir({ prefix: "win-unpacked" })
  const error = await createAfterPack()({ packager: makeWinPackager(win), electronPlatformName: "win32", arch: Arch.x64, appOutDir, outDir: appOutDir, targets }).then(
    () => null,
    (e: Error) => e
  )
  const file = path.join(appOutDir, "resources", "app-update.yml")
  return { appUpdate: (await pathExists(file)) ? yamlLoad(await readFile(file, "utf8")) : null, error }
}

describe("a Windows build that writes app-update.yml without publisherName fails", () => {
  test.for<[string, Record<string, any>, string]>([
    ["win.sign: false", { sign: false }, "win.sign is false (signing disabled)"],
    ["win.sign: null", { sign: null }, "win.sign is null (signing disabled)"],
    ["no certificate (win.sign unset)", {}, "no code signing certificate is configured"],
    ["no certificate (a signtool object without one)", { sign: { type: "signtool" } }, "no code signing certificate is configured"],
    ["win.sign.publisherName: null", { sign: { type: "signtool", publisherName: null } }, "win.sign.publisherName is null, which no longer opts out"],
    ["an empty publisherName list", { sign: { type: "signtool", publisherName: [] } }, "no code signing certificate is configured"],
    ["verifyUpdateCodeSignature: true", { sign: false, verifyUpdateCodeSignature: true }, "win.sign is false"],
  ])("%s", async ([, win, reason], { expect, tmpDir }) => {
    const { appUpdate, error } = await afterPack(tmpDir, { ...win, publish: generic })
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toContain(`Cannot write app-update.yml without publisherName: ${reason}`)
    expect(error!.message).toContain("Since electron-builder v27, electron-updater 7 rejects every update")
    expect(error!.message).toContain("Sign the build with a code signing certificate")
    expect(error!.message).toContain('win.sign: { type: "signtool", publisherName: ["CN=My Company, O=My Company, C=US"] }')
    expect(error!.message).toContain("or set win.verifyUpdateCodeSignature: false to opt out")
    expect(error!.message.endsWith(MISSING_DOCS)).toBe(true)
    expect(appUpdate).toBeNull()
  })

  test("Azure Trusted Signing without publisherName", async ({ expect, tmpDir }) => {
    const sign = { type: "azure", endpoint: "https://e/", codeSigningAccountName: "a", certificateProfileName: "p" }
    const { appUpdate, error } = await afterPack(tmpDir, { sign, publish: generic })
    expect(error?.message).toContain("Azure Trusted Signing requires 'publisherName'")
    expect(appUpdate).toBeNull()
  })

  test("a custom sign hook without publisherName", async ({ expect, tmpDir }) => {
    const { appUpdate, error } = await afterPack(tmpDir, { sign: { type: "signtool", sign: "./sign.js" }, publish: generic })
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toContain("A custom Windows signing hook (`win.sign.sign`) is configured without `win.sign.publisherName`")
    expect(appUpdate).toBeNull()
  })

  // the feed decides nothing: every provider's app-update.yml needs the publisherName
  test.for<[string, Record<string, any>]>([
    ["github", { provider: "github", owner: "acme", repo: "app" }],
    ["s3", { provider: "s3", bucket: "updates" }],
    ["spaces", { provider: "spaces", name: "updates", region: "nyc3" }],
    ["generic", generic],
    ["gitlab", { provider: "gitlab", projectId: 123 }],
    ["bitbucket", { provider: "bitbucket", owner: "acme", slug: "app" }],
    ["keygen", { provider: "keygen", account: "acme", product: "app" }],
  ])("for the %s provider", async ([, publish], { expect, tmpDir }) => {
    const { error } = await afterPack(tmpDir, { sign: false, publish })
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toContain("Cannot write app-update.yml without publisherName")
  })

  test.for([["nsis"], ["nsis-web"]])("for a target-level %s publish", async ([name], { expect, tmpDir }) => {
    const { error } = await afterPack(tmpDir, { sign: false }, [target(name, { publish: { provider: "s3", bucket: "updates" } })])
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toContain("win.sign is false")
  })

  test("for an electronUpdaterAware appx", async ({ expect, tmpDir }) => {
    const { error } = await afterPack(tmpDir, { sign: false, publish: generic }, [target("appx", { electronUpdaterAware: true })])
    expect(error).toBeInstanceOf(InvalidConfigurationError)
  })

  test("for the config of a single target (getAppUpdatePublishConfiguration)", async ({ expect }) => {
    await expect(getAppUpdatePublishConfiguration(makeWinPackager({ sign: false, publish: generic }), { publish: generic } as any, Arch.x64, false)).rejects.toThrow(
      /Cannot write app-update\.yml without publisherName: win\.sign is false/
    )
  })
})

describe("what app-update.yml carries when the build passes", () => {
  test("win.verifyUpdateCodeSignature: false writes the opt-out marker and no publisherName", async ({ expect, tmpDir }) => {
    for (const win of [
      { sign: false, verifyUpdateCodeSignature: false },
      { sign: { type: "signtool", publisherName: null }, verifyUpdateCodeSignature: false },
      { verifyUpdateCodeSignature: false },
      // not even a publish-level or an explicit one: the opt-out wins, and electron-updater would verify against any publisherName
      { sign: { type: "signtool", publisherName: ["CN=Acme"] }, verifyUpdateCodeSignature: false, publish: { ...generic, publisherName: ["CN=Acme"] } },
    ]) {
      const { appUpdate, error } = await afterPack(tmpDir, { publish: generic, ...win })
      expect(error).toBeNull()
      expect(appUpdate).toEqual({ ...generic, updaterCacheDirName: "test-app", verifyUpdateCodeSignature: false })
    }
  })

  test("a sign object with publisherName and no certificate (signed outside electron-builder) writes that publisherName", async ({ expect, tmpDir }) => {
    const { appUpdate, error } = await afterPack(tmpDir, { sign: { type: "signtool", publisherName: ["CN=Acme Corp, O=Acme Corp, C=US", "CN=Old Corp"] }, publish: generic })
    expect(error).toBeNull()
    expect(appUpdate.publisherName).toEqual(["CN=Acme Corp, O=Acme Corp, C=US", "CN=Old Corp"])
    expect(appUpdate).not.toHaveProperty("verifyUpdateCodeSignature")
  })

  test("a publish-level publisherName is written once it is a distinguished name", async ({ expect, tmpDir }) => {
    const { appUpdate, error } = await afterPack(tmpDir, { sign: false, publish: { ...generic, publisherName: ["CN=Acme Corp"] } })
    expect(error).toBeNull()
    expect(appUpdate.publisherName).toEqual(["CN=Acme Corp"])

    const invalid = await afterPack(tmpDir, { sign: false, publish: { ...generic, publisherName: ["Acme Corp"] } })
    expect(invalid.error).toBeInstanceOf(InvalidConfigurationError)
    expect(invalid.error!.message).toContain('publish.publisherName "Acme Corp" is not a distinguished name')
    expect(invalid.appUpdate).toBeNull()
  })

  test("the opt-out marker is managed by electron-builder and must not be set in the publish configuration", async ({ expect, tmpDir }) => {
    for (const win of [{ sign: false }, { sign: false, verifyUpdateCodeSignature: false }]) {
      const { appUpdate, error } = await afterPack(tmpDir, { ...win, publish: { ...generic, verifyUpdateCodeSignature: false } })
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect(error!.message).toContain("publish.verifyUpdateCodeSignature is managed by electron-builder and must not be set; configure win.verifyUpdateCodeSignature instead")
      expect(appUpdate).toBeNull()
    }
  })

  test("a Windows pack without an nsis, nsis-web or electronUpdaterAware appx target writes no app-update.yml and is not affected", async ({ expect, tmpDir }) => {
    const { appUpdate, error } = await afterPack(tmpDir, { sign: false, publish: generic }, [
      target("portable", null, false),
      target("zip", null, false),
      target("msi", null, false),
    ])
    expect(error).toBeNull()
    expect(appUpdate).toBeNull()
  })

  test("an nsis pack without any publish configuration writes no app-update.yml and is not affected", async ({ expect, tmpDir }) => {
    const { appUpdate, error } = await afterPack(tmpDir, { sign: false, publish: null })
    expect(error).toBeNull()
    expect(appUpdate).toBeNull()
  })
})
