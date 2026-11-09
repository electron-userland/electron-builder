import { Arch, Platform } from "app-builder-lib"
import { findUpdaterSettingsMentions, UpdaterSettingsMentions, warnAboutUpdaterSettings } from "app-builder-lib/src/publish/updaterSettingsCheck"
import { PublishManager } from "app-builder-lib/src/publish/PublishManager"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import { mayRequireCrossOriginHeaders, maySupportAllowUnverifiedLinuxPackages } from "app-builder-lib/src/util/electronUpdaterCompatibility"
import { findAppElectronUpdater } from "app-builder-lib/src/util/packageMetadata"
import { log, TmpDir } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { outputFile, outputJson, pathExists, rename, symlink, writeFile } from "fs-extra"
import Module from "node:module"
import * as path from "path"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// electron-updater rejects every update check and download until the app sets autoUpdater.crossOriginHeaders, which a developer who
// never runs the updater before a release does not see: a build that writes app-update.yml warns when no app file mentions the property.
// With autoUpdater.allowUnverifiedLinuxPackages = false, an unsigned rpm update fails to install: a build with an rpm target that writes
// update info warns when an app file sets it. One scan of the app files looks for both.

const docs = "https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-headers"
const assignment = "autoUpdater.crossOriginHeaders = () => []\n"

beforeEach(() => {
  log.resetLimits()
  vi.stubEnv("PUBLISH_FOR_PULL_REQUEST", "true")
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "GITLAB_TOKEN", "KEYGEN_TOKEN", "BITBUCKET_TOKEN"]) {
    vi.stubEnv(name, "")
  }
  // pnpm's bin shims set NODE_PATH to the repo's virtual store, which makes the workspace electron-updater resolvable from any directory
  vi.stubEnv("NODE_PATH", undefined)
  ;(Module as any)._initPaths()
})

afterEach(() => {
  vi.unstubAllEnvs()
  ;(Module as any)._initPaths()
  vi.restoreAllMocks()
})

interface ProjectOptions {
  /** the installed electron-updater version, or null for none */
  installed?: string | null
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/** A project dir and the Packager fields the check reads. */
async function createProject(tmpDir: TmpDir, { installed = "7.0.0", dependencies = {}, devDependencies = { "electron-updater": "^7.0.0" } }: ProjectOptions = {}) {
  const projectDir = await tmpDir.getTempDir({ prefix: "cross-origin-headers-project" })
  if (installed != null) {
    await outputJson(path.join(projectDir, "node_modules", "electron-updater", "package.json"), { name: "electron-updater", version: installed })
  }
  const metadata = { name: "test-app", version: "1.0.0", dependencies, devDependencies }
  return { projectDir, metadata, devMetadata: metadata, config: {} }
}

/** A resources dir whose app directory (`resources/app`) holds `files` (relative path to content). */
async function createAppDir(tmpDir: TmpDir, files: Record<string, string>): Promise<string> {
  const resourcesDir = path.join(await tmpDir.getTempDir({ prefix: "cross-origin-headers-app" }), "resources")
  for (const [file, content] of Object.entries(files)) {
    await outputFile(path.join(resourcesDir, "app", file), content)
  }
  return resourcesDir
}

/** A resources dir whose app.asar holds `files`, with the ones matching `unpack` in app.asar.unpacked. */
async function createAsar(tmpDir: TmpDir, files: Record<string, string>, unpack?: string): Promise<string> {
  const dir = await tmpDir.getTempDir({ prefix: "cross-origin-headers-asar" })
  for (const [file, content] of Object.entries(files)) {
    await outputFile(path.join(dir, "src", file), content)
  }
  const resourcesDir = path.join(dir, "resources")
  const { createPackageWithOptions } = await dynamicImport<any>("@electron/asar")
  await createPackageWithOptions(path.join(dir, "src"), path.join(resourcesDir, "app.asar"), unpack == null ? {} : { unpack })
  return resourcesDir
}

/** The check with the scan of `resourcesDir`, as a build runs it. */
function warn(project: Parameters<typeof warnAboutUpdaterSettings>[0], resourcesDir: string, packsRpmUpdate = false) {
  return warnAboutUpdaterSettings(project, packsRpmUpdate, () => findUpdaterSettingsMentions(resourcesDir))
}

async function findCrossOriginHeadersMention(resourcesDir: string) {
  return (await findUpdaterSettingsMentions(resourcesDir))?.crossOriginHeaders ?? null
}

function spyWarnings() {
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  warn.mockClear()
  return () => warn.mock.calls.filter(([, message]) => typeof message === "string" && message.includes("no mention of crossOriginHeaders in the app's files"))
}

function spyLinuxPackagesWarnings() {
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  warn.mockClear()
  return () => warn.mock.calls.filter(([, message]) => typeof message === "string" && message.includes("allowUnverifiedLinuxPackages = false"))
}

const noMention = { "main.js": 'require("electron-updater").autoUpdater.checkForUpdates()\n' }

describe("the warning", () => {
  test("names the error, the fix and the migration guide", async ({ expect, tmpDir }) => {
    const crossOriginWarnings = spyWarnings()
    await warn(await createProject(tmpDir), await createAppDir(tmpDir, noMention))

    expect(crossOriginWarnings()).toHaveLength(1)
    const [fields, message] = crossOriginWarnings()[0] as unknown as [Record<string, string>, string]
    expect(message).toContain("found no mention of crossOriginHeaders in the app's files (outside node_modules)")
    expect(message).toContain("electron-updater rejects every update check and download of the installed app with ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED")
    expect(fields.solution).toContain("autoUpdater.crossOriginHeaders = () => []")
    expect(message.endsWith(` See ${docs}`)).toBe(true)
    // the rule itself names no version
    expect(`${message} ${fields.solution}`.replace(docs, "")).not.toMatch(/electron-updater \d|electron-builder \d|\bv\d\d|\b(now|no longer)\b/i)
  })

  test("only for an app whose electron-updater may require the property", async ({ expect, tmpDir }) => {
    const crossOriginWarnings = spyWarnings()
    const resourcesDir = await createAppDir(tmpDir, noMention)
    await warn(await createProject(tmpDir, { installed: null, devDependencies: { electron: "^30.0.0" } }), resourcesDir)
    await warn(await createProject(tmpDir, { installed: "6.8.11" }), resourcesDir)
    expect(crossOriginWarnings()).toHaveLength(0)
    await warn(await createProject(tmpDir, { installed: "7.0.0-alpha.14" }), resourcesDir)
    expect(crossOriginWarnings()).toHaveLength(1)
  })

  test("after the warning, a later build in the process reads neither the project nor the app", async ({ expect, tmpDir }) => {
    spyWarnings()
    await warn(await createProject(tmpDir), await createAppDir(tmpDir, noMention))
    const unreadable = {
      get metadata(): any {
        throw new Error("the project was read")
      },
      devMetadata: null,
      projectDir: "/nonexistent",
    }
    const scan = vi.fn(() => Promise.reject(new Error("the app was read")))
    await expect(warnAboutUpdaterSettings(unreadable, false, scan)).resolves.toBeUndefined()
    expect(scan).not.toHaveBeenCalled()
  })

  test("an app.asar that cannot be read does not fail the build", async ({ expect, tmpDir }) => {
    const corrupt = path.join(await tmpDir.getTempDir({ prefix: "cross-origin-headers-corrupt" }), "resources")
    await outputFile(path.join(corrupt, "app.asar"), "not an asar archive")
    await expect(warn(await createProject(tmpDir), corrupt)).resolves.toBeUndefined()
  })
})

describe("the scan of the packed app", () => {
  test.for([
    ["an assignment", "main.js", assignment],
    ["a minified assignment", "dist/main.cjs", 'e.crossOriginHeaders=()=>[],e.checkForUpdates();var s="a/b"'],
    ["an ES module", "main.mjs", 'import { autoUpdater } from "electron-updater"\nautoUpdater.crossOriginHeaders = function () { return [] }'],
    // an app that bundles electron-updater is not checked: its code mentions the property
    ["a bundled electron-updater", "dist/main.js", "class AppUpdater {\n  constructor() {\n    this.crossOriginHeaders = null;\n  }\n}\n"],
  ])("finds %s in the app directory", async ([, file, code], { expect, tmpDir }) => {
    expect(await findCrossOriginHeadersMention(await createAppDir(tmpDir, { "package.json": "{}", [file]: code }))).toBe(true)
  })

  test("finds no mention in an app directory without one, inside node_modules or in a file over the size limit", async ({ expect, tmpDir }) => {
    expect(await findCrossOriginHeadersMention(await createAppDir(tmpDir, noMention))).toBe(false)
    expect(await findCrossOriginHeadersMention(await createAppDir(tmpDir, { "main.js": "", "node_modules/updater-wrapper/index.js": assignment }))).toBe(false)
    expect(await findCrossOriginHeadersMention(await createAppDir(tmpDir, { "main.js": "", "dist/data.js": assignment + " ".repeat(20 * 1024 * 1024) }))).toBe(false)
    // under the limit, the same file counts
    expect(await findCrossOriginHeadersMention(await createAppDir(tmpDir, { "main.js": "", "dist/data.js": assignment + " ".repeat(1024) }))).toBe(true)
  })

  test("does not follow a symlink in the app directory", async ({ expect, tmpDir }) => {
    const outside = await tmpDir.getTempDir({ prefix: "cross-origin-headers-outside" })
    await outputFile(path.join(outside, "main.js"), assignment)
    const resourcesDir = await createAppDir(tmpDir, { "package.json": "{}" })
    await symlink(path.join(outside, "main.js"), path.join(resourcesDir, "app", "main.js"))
    expect(await findCrossOriginHeadersMention(resourcesDir)).toBe(false)
  })

  test("reads app.asar and its unpacked files, but not its node_modules or files over the size limit", async ({ expect, tmpDir }) => {
    expect(await findCrossOriginHeadersMention(await createAsar(tmpDir, { "dist/main.js": assignment }))).toBe(true)
    expect(await findCrossOriginHeadersMention(await createAsar(tmpDir, { "main.js": "", "unpacked/main.js": assignment }, "**/unpacked/**"))).toBe(true)
    expect(await findCrossOriginHeadersMention(await createAsar(tmpDir, noMention))).toBe(false)
    expect(await findCrossOriginHeadersMention(await createAsar(tmpDir, { "main.js": "", "node_modules/wrapper/index.js": assignment }))).toBe(false)
    expect(await findCrossOriginHeadersMention(await createAsar(tmpDir, { "main.js": "", "dist/data.js": assignment + " ".repeat(20 * 1024 * 1024) }))).toBe(false)
  })

  test("does not follow an unpacked file of app.asar that is a symlink", async ({ expect, tmpDir }) => {
    const outside = await tmpDir.getTempDir({ prefix: "cross-origin-headers-outside" })
    await outputFile(path.join(outside, "main.js"), assignment)
    const resourcesDir = await createAsar(tmpDir, { "main.js": "", "unpacked/main.js": "// placeholder\n" }, "**/unpacked/**")
    const unpacked = path.join(resourcesDir, "app.asar.unpacked", "unpacked", "main.js")
    await symlink(path.join(outside, "main.js"), `${unpacked}.link`)
    await rename(`${unpacked}.link`, unpacked)
    expect(await findCrossOriginHeadersMention(resourcesDir)).toBe(false)
  })

  test("null when the resources hold no app to scan; rejects when app.asar cannot be read", async ({ expect, tmpDir }) => {
    expect(await findCrossOriginHeadersMention(path.join(await tmpDir.getTempDir({ prefix: "cross-origin-headers-empty" }), "resources"))).toBeNull()

    const corrupt = path.join(await tmpDir.getTempDir({ prefix: "cross-origin-headers-corrupt" }), "resources")
    await outputFile(path.join(corrupt, "app.asar"), "not an asar archive")
    await expect(findCrossOriginHeadersMention(corrupt)).rejects.toThrow()
  })
})

describe("which apps are checked", () => {
  async function mayRequire(tmpDir: TmpDir, options: ProjectOptions) {
    const { metadata, devMetadata, projectDir } = await createProject(tmpDir, options)
    const updater = findAppElectronUpdater(metadata, devMetadata, projectDir)
    return updater == null ? null : mayRequireCrossOriginHeaders(updater)
  }

  test("an electron-updater in the app's dependencies or devDependencies; not an app without one", async ({ expect, tmpDir }) => {
    expect(await mayRequire(tmpDir, {})).toBe(true)
    expect(await mayRequire(tmpDir, { dependencies: { "electron-updater": "^7.0.0" }, devDependencies: {} })).toBe(true)
    expect(await mayRequire(tmpDir, { installed: null, devDependencies: { electron: "^30.0.0" } })).toBeNull()
  })

  test("not an electron-updater that predates the property", async ({ expect, tmpDir }) => {
    expect(await mayRequire(tmpDir, { installed: "6.8.11" })).toBe(false)
    expect(await mayRequire(tmpDir, { installed: "7.0.0-alpha.13" })).toBe(false)
    expect(await mayRequire(tmpDir, { installed: "7.0.0-alpha.14" })).toBe(true)
    // not installed: the declared range decides
    expect(await mayRequire(tmpDir, { installed: null, devDependencies: { "electron-updater": "^6.8.0" } })).toBe(false)
    expect(await mayRequire(tmpDir, { installed: null, devDependencies: { "electron-updater": ">=6.8.0" } })).toBe(true)
  })

  test("an electron-updater whose version cannot be read may require it", async ({ expect, tmpDir }) => {
    expect(await mayRequire(tmpDir, { installed: null, devDependencies: { "electron-updater": "catalog:" } })).toBe(true)
    expect(await mayRequire(tmpDir, { installed: null, devDependencies: { "electron-updater": "latest" } })).toBe(true)
  })
})

describe("during the build", () => {
  function createManager(project: Awaited<ReturnType<typeof createProject>>, publish: "always" | "never" = "never") {
    let onAfterPack: (event: any) => Promise<void> = () => Promise.resolve()
    const packager = {
      ...project,
      onTargetsCreated: () => undefined,
      onAfterPack: (handler: (event: any) => Promise<void>) => {
        onAfterPack = handler
      },
      onArtifactCreated: () => undefined,
    }
    new PublishManager(packager as any, { publish }, new CancellationToken())
    return (event: any) => onAfterPack(event)
  }

  function makePlatformPackager(publish: any, platform = Platform.LINUX) {
    return {
      platform,
      platformOptions: {},
      config: publish === undefined ? {} : { publish },
      appInfo: { version: "1.0.0", updaterCacheDirName: "test-app", channel: null },
      buildResourcesDir: __dirname,
      cancellationToken: new CancellationToken(),
      repositoryInfo: Promise.resolve(null),
      expandMacro: (value: string) => value,
      getResourcesDir: (dir: string) => path.join(dir, "resources"),
      requireUpdateSigningKeys: () => Promise.resolve([]),
      updateSigningKeys: { value: Promise.resolve([]) },
    }
  }

  async function pack(
    tmpDir: TmpDir,
    afterPack: (event: any) => Promise<void>,
    packager: any,
    arch: Arch,
    mainJs = "autoUpdater.checkForUpdates()\n",
    targets: Array<{ name: string; options: any }> = [{ name: "AppImage", options: null }]
  ) {
    const appOutDir = path.dirname(await createAppDir(tmpDir, { "main.js": mainJs }))
    await writeFile(path.join(appOutDir, "resources", "app", "package.json"), "{}")
    await afterPack({
      packager,
      electronPlatformName: packager.platform.nodeName,
      arch,
      appOutDir,
      outDir: appOutDir,
      targets: targets.map(it => ({ ...it, writesUpdateInfo: true })),
    })
    return pathExists(path.join(appOutDir, "resources", "app-update.yml"))
  }

  test("warns once per process, however many builds and archs it packs", async ({ expect, tmpDir }) => {
    const crossOriginWarnings = spyWarnings()
    const packager = makePlatformPackager({ provider: "generic", url: "https://example.com/updates" })
    for (let build = 0; build < 2; build++) {
      const afterPack = createManager(await createProject(tmpDir))
      for (const arch of [Arch.x64, Arch.arm64, Arch.armv7l]) {
        expect(await pack(tmpDir, afterPack, packager, arch)).toBe(true)
      }
    }
    expect(crossOriginWarnings()).toHaveLength(1)
  })

  test("scans only the first pack of a platform: every arch ships the same app code", async ({ expect, tmpDir }) => {
    const crossOriginWarnings = spyWarnings()
    const afterPack = createManager(await createProject(tmpDir))
    const packager = makePlatformPackager({ provider: "generic", url: "https://example.com/updates" })
    expect(await pack(tmpDir, afterPack, packager, Arch.x64, assignment)).toBe(true)
    expect(await pack(tmpDir, afterPack, packager, Arch.arm64)).toBe(true)
    expect(crossOriginWarnings()).toHaveLength(0)
  })

  test("no warning for a build that writes no app-update.yml", async ({ expect, tmpDir }) => {
    const crossOriginWarnings = spyWarnings()
    const afterPack = createManager(await createProject(tmpDir))
    expect(await pack(tmpDir, afterPack, makePlatformPackager(null), Arch.x64)).toBe(false)
    expect(crossOriginWarnings()).toHaveLength(0)
  })

  test("warns about allowUnverifiedLinuxPackages = false only for a pack with an rpm target that writes update info", async ({ expect, tmpDir }) => {
    const linuxPackagesWarnings = spyLinuxPackagesWarnings()
    const packager = makePlatformPackager({ provider: "generic", url: "https://example.com/updates" })
    const project = await createProject(tmpDir, { installed: "7.0.0-alpha.5" })
    const disallowed = "autoUpdater.allowUnverifiedLinuxPackages = false\n"
    expect(await pack(tmpDir, createManager(project), packager, Arch.x64, disallowed)).toBe(true)
    // an rpm target whose own publish is null writes no update info, though the AppImage of the pack does
    const rpmWithoutUpdateInfo = [
      { name: "AppImage", options: null },
      { name: "rpm", options: { publish: null } },
    ]
    expect(await pack(tmpDir, createManager(project), packager, Arch.x64, disallowed, rpmWithoutUpdateInfo)).toBe(true)
    expect(linuxPackagesWarnings()).toHaveLength(0)
    // a later rpm pack of a build is checked, though its first pack was not
    const afterPack = createManager(project)
    expect(await pack(tmpDir, afterPack, packager, Arch.x64, disallowed)).toBe(true)
    expect(await pack(tmpDir, afterPack, packager, Arch.arm64, disallowed, [{ name: "rpm", options: null }])).toBe(true)
    expect(linuxPackagesWarnings()).toHaveLength(1)
  })

  test("scans each platform's own files: an rpm pack does not reuse the scan of the build's mac pack", async ({ expect, tmpDir }) => {
    const linuxPackagesWarnings = spyLinuxPackagesWarnings()
    const publish = { provider: "generic", url: "https://example.com/updates" }
    const afterPack = createManager(await createProject(tmpDir))
    // only the Linux files (e.g. linux.files) set it
    expect(await pack(tmpDir, afterPack, makePlatformPackager(publish, Platform.MAC), Arch.arm64, assignment, [{ name: "zip", options: null }])).toBe(true)
    expect(linuxPackagesWarnings()).toHaveLength(0)
    const disallowed = assignment + "autoUpdater.allowUnverifiedLinuxPackages = false\n"
    expect(await pack(tmpDir, afterPack, makePlatformPackager(publish), Arch.x64, disallowed, [{ name: "rpm", options: null }])).toBe(true)
    expect(linuxPackagesWarnings()).toHaveLength(1)
  })
})

describe("allowUnverifiedLinuxPackages = false", () => {
  const disallowed = "autoUpdater.allowUnverifiedLinuxPackages = false\n"
  const mentions = (disallowsUnverifiedLinuxPackages: boolean): UpdaterSettingsMentions => ({ crossOriginHeaders: true, disallowsUnverifiedLinuxPackages })

  test.for([
    ["a formatted assignment", "main.js", disallowed, true],
    ["a minified assignment", "dist/main.cjs", "e.allowUnverifiedLinuxPackages=!1,e.checkForUpdates()", true],
    // electron-updater's own log messages, in an app that bundles it
    ["a bundled electron-updater", "dist/main.js", 'this.allowUnverifiedLinuxPackages = true;\nlog.info("verification enforced (allowUnverifiedLinuxPackages=false).")', false],
    ["no assignment", "main.js", assignment, false],
  ] as const)("the scan finds %s: %s", async ([, file, code, found], { expect, tmpDir }) => {
    expect((await findUpdaterSettingsMentions(await createAppDir(tmpDir, { [file]: code })))?.disallowsUnverifiedLinuxPackages).toBe(found)
  })

  test("the scan looks for both settings in one pass, in app.asar and the app directory, not in node_modules", async ({ expect, tmpDir }) => {
    const both = { crossOriginHeaders: true, disallowsUnverifiedLinuxPackages: true }
    // found in separate files, in either order: the scan does not stop at the first setting it finds
    expect(await findUpdaterSettingsMentions(await createAsar(tmpDir, { "a.js": assignment, "b.js": disallowed }))).toEqual(both)
    expect(await findUpdaterSettingsMentions(await createAsar(tmpDir, { "a.js": disallowed, "b.js": assignment }))).toEqual(both)
    expect(await findUpdaterSettingsMentions(await createAppDir(tmpDir, { "a.js": assignment, "dist/b.js": disallowed }))).toEqual(both)
    expect(await findUpdaterSettingsMentions(await createAppDir(tmpDir, { "a.js": disallowed, "dist/b.js": assignment }))).toEqual(both)
    expect(await findUpdaterSettingsMentions(await createAsar(tmpDir, { "main.js": assignment, "node_modules/wrapper/index.js": disallowed }))).toEqual({
      crossOriginHeaders: true,
      disallowsUnverifiedLinuxPackages: false,
    })
  })

  test("an electron-updater that has the property, or whose version cannot be read, may honor it", async ({ expect, tmpDir }) => {
    async function maySupport(options: ProjectOptions) {
      const { metadata, devMetadata, projectDir } = await createProject(tmpDir, options)
      const updater = findAppElectronUpdater(metadata, devMetadata, projectDir)
      return updater == null ? null : maySupportAllowUnverifiedLinuxPackages(updater)
    }
    expect(await maySupport({ installed: "6.8.11" })).toBe(false)
    expect(await maySupport({ installed: "7.0.0-alpha.4" })).toBe(false)
    expect(await maySupport({ installed: "7.0.0-alpha.5" })).toBe(true)
    expect(await maySupport({ installed: "7.0.0" })).toBe(true)
    expect(await maySupport({ installed: null, devDependencies: { "electron-updater": "^6.8.0" } })).toBe(false)
    expect(await maySupport({ installed: null, devDependencies: { "electron-updater": "catalog:" } })).toBe(true)
  })

  test("the app is scanned for it only for a pack with an rpm update and an electron-updater that may honor it", async ({ expect, tmpDir }) => {
    // electron-updater 7.0.0-alpha.5 predates crossOriginHeaders, so only this setting is checked
    const project = await createProject(tmpDir, { installed: "7.0.0-alpha.5" })
    const scan = vi.fn(() => Promise.resolve(mentions(false)))
    await warnAboutUpdaterSettings(project, false, scan)
    expect(scan).toHaveBeenCalledTimes(0)
    await warnAboutUpdaterSettings(await createProject(tmpDir, { installed: "7.0.0-alpha.4" }), true, scan)
    expect(scan).toHaveBeenCalledTimes(0)
    await warnAboutUpdaterSettings(project, true, scan)
    expect(scan).toHaveBeenCalledTimes(1)
  })

  test("warns once per process when the app sets it, so later packs are not scanned again", async ({ expect, tmpDir }) => {
    spyLinuxPackagesWarnings()
    const project = await createProject(tmpDir, { installed: "7.0.0-alpha.5" })
    const scan = vi.fn(() => Promise.resolve(mentions(false)))
    // not set: no warning, so the next rpm pack is scanned again
    await warnAboutUpdaterSettings(project, true, scan)
    await warnAboutUpdaterSettings(project, true, scan)
    expect(scan).toHaveBeenCalledTimes(2)
    scan.mockImplementation(() => Promise.resolve(mentions(true)))
    await warnAboutUpdaterSettings(project, true, scan)
    await warnAboutUpdaterSettings(project, true, scan)
    expect(scan).toHaveBeenCalledTimes(3)
  })

  test("a pack without an rpm update does not give the warning, though the scan for crossOriginHeaders finds the assignment", async ({ expect, tmpDir }) => {
    spyWarnings()
    const scan = vi.fn(() => Promise.resolve(mentions(true)))
    await warnAboutUpdaterSettings(await createProject(tmpDir), false, scan)
    expect(scan).toHaveBeenCalledTimes(1)
    // the warning was not given, so a later rpm pack is checked (7.0.0-alpha.5 predates crossOriginHeaders: only this setting is)
    await warnAboutUpdaterSettings(await createProject(tmpDir, { installed: "7.0.0-alpha.5" }), true, scan)
    expect(scan).toHaveBeenCalledTimes(2)
  })

  test("the warning says how to sign the packages and the manifest, and links the docs", async ({ expect, tmpDir }) => {
    const linuxPackagesWarnings = spyLinuxPackagesWarnings()
    await warn(await createProject(tmpDir), await createAppDir(tmpDir, { "main.js": assignment + disallowed }), true)
    expect(linuxPackagesWarnings()).toHaveLength(1)
    const [fields, message] = linuxPackagesWarnings()[0] as unknown as [Record<string, string>, string]
    const linuxDocs = "https://www.electron.build/docs/features/auto-update#allowunverifiedlinuxpackages"
    expect(message).toContain("the app sets autoUpdater.allowUnverifiedLinuxPackages = false")
    expect(message).toContain("electron-builder does not sign Linux packages")
    expect(fields.solution).toContain("sign the .rpm files separately after the build")
    expect(fields.solution).toContain("regenerate the sha512 and size of each signed file in the Linux update manifest (latest-linux*.yml) and sign the manifest again")
    expect(fields.solution).toContain("electron-builder sign-update-manifest --rehash")
    expect(fields.solution).toContain("https://www.electron.build/docs/features/signed-update-manifests#re-signing-after-a-file-changed")
    expect(fields.solution).toContain("electron-builder verify")
    expect(message.endsWith(` See ${linuxDocs}`)).toBe(true)
    expect(`${message} ${fields.solution}`.replace(linuxDocs, "")).not.toMatch(/electron-updater \d|electron-builder \d|\bv\d\d|\b(now|no longer)\b/i)
  })
})
