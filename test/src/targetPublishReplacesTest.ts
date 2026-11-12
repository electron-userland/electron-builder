import { Configuration, LinuxPackager, WinPackager } from "app-builder-lib"
import { getPublishConfigs } from "app-builder-lib/src/publish/PublishManager"
import SnapTarget from "app-builder-lib/src/targets/linux/snap/SnapTarget"
import MsiTarget from "app-builder-lib/src/targets/win/MsiTarget"
import MsiWrappedTarget from "app-builder-lib/src/targets/win/MsiWrappedTarget"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { AppPackageHelper, CopyElevateHelper } from "app-builder-lib/src/targets/win/nsis/nsisUtil"
import { WebInstallerTarget } from "app-builder-lib/src/targets/win/nsis/WebInstallerTarget"
import { log } from "builder-util"
import { mkdir } from "fs/promises"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// Since v27 a target's `publish` replaces the one it inherits (its platform's, or nsis's for nsisWeb) instead of being merged with it,
// and the build warns once per target section where electron-builder 26 merged in more. Generic providers, so nothing needs repository info.

const DOCS = "v27-build-changes#target-publish-replaces-platform-publish"
const linuxFeed = { provider: "generic", url: "https://example.com/linux" }
const debFeed = { provider: "generic", url: "https://example.com/deb" }

beforeEach(() => {
  log.resetLimits()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function spyOnWarn() {
  return vi.spyOn(log, "warn").mockImplementation(() => undefined)
}

/** The warnings that announce a replaced publish, as [fields, message]. */
function replacedPublishWarnings(warn: ReturnType<typeof spyOnWarn>): Array<[any, string]> {
  return warn.mock.calls.filter(([, message]) => String(message).includes("instead of being merged with it")).map(([fields, message]) => [fields, String(message)])
}

function getOptionsForTarget(platformOptions: Record<string, any>, targetSections: Record<string, any>, key: string): any {
  return LinuxPackager.prototype.getOptionsForTarget.call({ platformSpecificBuildOptions: platformOptions, config: targetSections }, key)
}

describe("getOptionsForTarget", () => {
  test("a deb.publish list replaces linux.publish, warning once per target key", ({ expect }) => {
    const warn = spyOnWarn()
    const linux = { publish: [linuxFeed] }
    const sections = { deb: { publish: [debFeed] }, rpm: { publish: [debFeed] } }

    expect(getOptionsForTarget(linux, sections, "deb").publish).toEqual([debFeed])
    getOptionsForTarget(linux, sections, "deb")
    expect(replacedPublishWarnings(warn)).toHaveLength(1)
    getOptionsForTarget(linux, sections, "rpm")
    expect(replacedPublishWarnings(warn)).toHaveLength(2)

    const [fields, message] = replacedPublishWarnings(warn)[0]
    // provider names only: the options may hold credentials
    expect(fields).toEqual({ "deb.publish": ["generic"], "linux.publish": ["generic"] })
    expect(message).toContain("since v27, `deb.publish` replaces `linux.publish`")
    expect(message.endsWith(`https://www.electron.build/docs/migration/${DOCS}`)).toBe(true)
    expect(JSON.stringify(warn.mock.calls)).not.toContain("example.com")
  })

  test("two publish objects are not merged: the target's object is used as written", ({ expect }) => {
    const warn = spyOnWarn()
    const linux = { publish: { provider: "s3", bucket: "a", region: "eu-west-1" } }
    expect(getOptionsForTarget(linux, { appImage: { publish: { provider: "s3", bucket: "b" } } }, "appImage").publish).toEqual({ provider: "s3", bucket: "b" })
    expect(replacedPublishWarnings(warn).map(([fields]) => fields)).toEqual([{ "appImage.publish": ["s3"], "linux.publish": ["s3"] }])
  })

  test("a target without publish carries none and publishes with the platform's", async ({ expect }) => {
    const linux = { publish: [linuxFeed] }
    const options = getOptionsForTarget(linux, { deb: {} }, "deb")
    expect(options.publish).toBeUndefined()

    const packager = { platformOptions: linux, config: { linux }, appInfo: { channel: null }, expandMacro: (value: string) => value }
    expect(await getPublishConfigs(packager as any, options, null, false)).toEqual([linuxFeed])
  })

  test("a reordered list moves the update feed and warns", ({ expect }) => {
    const warn = spyOnWarn()
    expect(getOptionsForTarget({ publish: ["github"] }, { deb: { publish: ["s3", "github"] } }, "deb").publish).toEqual(["s3", "github"])
    expect(replacedPublishWarnings(warn)).toHaveLength(1)
  })

  test("a GitLab tagNamePrefix the target leaves out counts like any other option", ({ expect }) => {
    const warn = spyOnWarn()
    // migrate-schema writes tagNamePrefix: "" for v26 vPrefixedTagName: false, which v26 merged into deb's entry
    const gitlab = { provider: "gitlab", projectId: 1 }
    getOptionsForTarget({ publish: [{ ...gitlab, tagNamePrefix: "" }] }, { deb: { publish: [gitlab] } }, "deb")
    getOptionsForTarget({ publish: { ...gitlab, tagNamePrefix: "" } }, { rpm: { publish: gitlab } }, "rpm")
    expect(replacedPublishWarnings(warn).map(([fields]) => Object.keys(fields)[0])).toEqual(["deb.publish", "rpm.publish"])
  })

  test("a snapcraft.publish without a snapStore provider replaces linux.publish and warns", ({ expect }) => {
    const warn = spyOnWarn()
    expect(getOptionsForTarget({ publish: ["github", "s3"] }, { snapcraft: { publish: ["github"] } }, "snapcraft").publish).toEqual(["github"])
    expect(replacedPublishWarnings(warn).map(([fields]) => fields)).toEqual([{ "snapcraft.publish": ["github"], "linux.publish": ["github", "s3"] }])
  })

  test("a snapcraft.publish of null still sends the snap to the Snap Store, and [] sends it nowhere", async ({ expect }) => {
    spyOnWarn()
    const snap = Object.create(SnapTarget.prototype)
    const snapStore = { provider: "snapStore", repo: "app" }
    expect(snap.findSnapPublishConfig({ linux: { publish: [snapStore] }, snapcraft: { publish: null } })).toEqual(snapStore)
    expect(snap.findSnapPublishConfig({ publish: null, linux: { publish: null }, snapcraft: { publish: null } })).toEqual({ provider: "snapStore" })

    // no snapStore provider, so the snap is uploaded to the providers of its own publish: none
    const linux = { publish: [snapStore] }
    const config = { linux, snapcraft: { publish: [] } }
    expect(snap.findSnapPublishConfig(config)).toBeNull()
    const packager = { platformOptions: linux, config, appInfo: { channel: null }, expandMacro: (value: string) => value }
    expect(await getPublishConfigs(packager as any, getOptionsForTarget(linux, config, "snapcraft"), null, false)).toEqual([])
  })

  test("the snap goes only to the first snapStore provider it finds, not to the other providers of that publish", ({ expect }) => {
    const snap = Object.create(SnapTarget.prototype)
    const snapStore = { provider: "snapStore", repo: "app" }
    // a non-null publishConfig is the snap's only upload (PublishManager onArtifactCreated -> scheduleUpload)
    expect(snap.findSnapPublishConfig({ snapcraft: { publish: ["github", snapStore] } })).toEqual(snapStore)
    expect(snap.findSnapPublishConfig({ linux: { publish: ["github", snapStore] } })).toEqual(snapStore)
    expect(snap.findSnapPublishConfig({ publish: ["github"], linux: { publish: ["github"] } })).toEqual({ provider: "snapStore" })
  })

  test.for<[string, string, any, any]>([
    ["two strings, which were never merged", "deb", "github", "s3"],
    ["a list that keeps the inherited providers first", "deb", ["github"], ["github", "s3"]],
    ["an empty inherited list, which v26 merged into the target's own", "deb", [], ["s3"]],
    ["a string entry next to an equal object entry", "rpm", ["github"], [{ provider: "github" }, "s3"]],
    ["an undefined option, which the merge drops", "appImage", [linuxFeed], [{ ...linuxFeed, channel: undefined }]],
    ["an object that holds every inherited option", "appImage", { ...linuxFeed }, { ...debFeed, channel: "beta" }],
    ["a GitLab entry that keeps the tagNamePrefix", "pacman", [{ provider: "gitlab", projectId: 1, tagNamePrefix: "" }], [{ provider: "gitlab", projectId: 1, tagNamePrefix: "" }]],
    ["publish: null", "deb", ["github"], null],
    ["a list next to an object, which were never merged", "flatpak", ["github"], { provider: "s3", bucket: "b" }],
    ["pkg, whose publish always replaced mac's", "pkg", ["github"], ["s3"]],
    ["squirrelWindows, whose publish always replaced win's", "squirrelWindows", ["github"], ["s3"]],
    ["msix, a target v26 did not have", "msix", ["github"], ["s3"]],
    ["a snapcraft.publish naming a snapStore provider, which is the snap's only upload", "snapcraft", ["github"], [{ provider: "snapStore" }]],
  ])("%s: no warning", ([, key, inherited, own], { expect }) => {
    const warn = spyOnWarn()
    expect(getOptionsForTarget({ publish: inherited }, { [key]: { publish: own } }, key).publish).toEqual(own)
    expect(replacedPublishWarnings(warn)).toEqual([])
  })
})

describe("Windows targets", () => {
  const nsisFeed = { provider: "generic" as const, url: "https://example.com/nsis" }
  const webFeed = { provider: "generic" as const, url: "https://example.com/web" }
  const helper = () => new AppPackageHelper(new CopyElevateHelper())

  test("nsisWeb.publish replaces nsis.publish and warns; nsis keeps its own; portable and a publish-less nsisWeb do not warn", async ({ expect, tmpDir }) => {
    const warn = spyOnWarn()
    const packager = await createWinPackager(tmpDir, { nsis: { publish: [nsisFeed] }, nsisWeb: { publish: [webFeed] }, portable: { publish: [webFeed] } })

    expect(new WebInstallerTarget(packager, packager.projectDir, "nsis-web", helper()).options.publish).toEqual([webFeed])
    expect(replacedPublishWarnings(warn).map(([fields, message]) => [fields, message.includes("`nsisWeb.publish` replaces `nsis.publish`")])).toEqual([
      [{ "nsisWeb.publish": ["generic"], "nsis.publish": ["generic"] }, true],
    ])
    expect(new NsisTarget(packager, packager.projectDir, "nsis", helper()).options.publish).toEqual([nsisFeed])
    expect(new NsisTarget(packager, packager.projectDir, "portable", helper()).options.publish).toEqual([webFeed])
    expect(replacedPublishWarnings(warn)).toHaveLength(1)

    log.resetLimits()
    const inheriting = await createWinPackager(tmpDir, { nsis: { publish: [nsisFeed] }, nsisWeb: { oneClick: false } })
    expect(new WebInstallerTarget(inheriting, inheriting.projectDir, "nsis-web", helper()).options.publish).toEqual([nsisFeed])
    expect(replacedPublishWarnings(warn)).toHaveLength(1)
  })

  test("an msiWrapped target does not warn about the msi.publish it does not use", async ({ expect, tmpDir }) => {
    const warn = spyOnWarn()
    const packager = await createWinPackager(tmpDir, { win: { publish: ["github"] }, msi: { publish: ["s3"] } })
    expect(new MsiWrappedTarget(packager, packager.projectDir).options.publish).toBeUndefined()
    expect(replacedPublishWarnings(warn)).toEqual([])

    // the msi target itself still warns, and so does an msiWrapped.publish
    expect(new MsiTarget(packager, packager.projectDir).options.publish).toEqual(["s3"])
    const wrapped = await createWinPackager(tmpDir, { win: { publish: ["github"] }, msiWrapped: { publish: ["s3"] } })
    expect(new MsiWrappedTarget(wrapped, wrapped.projectDir).options.publish).toEqual(["s3"])
    expect(replacedPublishWarnings(warn).map(([fields]) => Object.keys(fields)[0])).toEqual(["msi.publish", "msiWrapped.publish"])
  })
})

async function createWinPackager(tmpDir: TmpDir, config: Configuration): Promise<WinPackager> {
  const projectDir = await tmpDir.getTempDir({ prefix: "target-publish-win" })
  await mkdir(projectDir, { recursive: true })
  const fakePackagerInfo = {
    config: { appId: "org.electron-builder.testApp", ...config },
    metadata: { name: "TestApp", productName: "Test App", version: "1.1.0", description: "Test Application", author: { name: "Foo Bar" } },
    devMetadata: null,
    options: {},
    projectDir,
    buildResourcesDir: path.join(projectDir, "build"),
    relativeBuildResourcesDirname: "build",
    repositoryInfo: Promise.resolve(null),
    tempDirManager: tmpDir,
    framework: { defaultAppIdPrefix: "com.electron." },
  }
  return new WinPackager(fakePackagerInfo as any)
}
