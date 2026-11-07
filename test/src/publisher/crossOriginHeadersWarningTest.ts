import { Arch, Platform } from "app-builder-lib"
import { warnIfCrossOriginHeadersNotMentioned } from "app-builder-lib/src/publish/crossOriginHeadersCheck"
import { PublishManager } from "app-builder-lib/src/publish/PublishManager"
import { dynamicImport } from "app-builder-lib/src/util/dynamicImport"
import { log, TmpDir } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { outputFile, outputJson, pathExists, rename, symlink, writeFile } from "fs-extra"
import Module from "node:module"
import * as path from "path"
import { afterEach, beforeEach, describe, test, vi } from "vitest"

// electron-updater rejects every update check and download until the app sets autoUpdater.crossOriginHeaders, which a developer who
// never runs the updater before a release does not see: a build that writes app-update.yml warns when no app file mentions the property.

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

function spyWarnings() {
  const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined)
  warn.mockClear()
  return () => warn.mock.calls.filter(([, message]) => typeof message === "string" && message.includes("no mention of crossOriginHeaders in the app's files"))
}

async function warnings(project: Awaited<ReturnType<typeof createProject>>, resourcesDir: string) {
  const crossOriginWarnings = spyWarnings()
  await warnIfCrossOriginHeadersNotMentioned(project, resourcesDir)
  return crossOriginWarnings().length
}

describe("the scan of the packed app", () => {
  test("warns when no app file mentions crossOriginHeaders, naming the error, the fix and the migration guide", async ({ expect, tmpDir }) => {
    const crossOriginWarnings = spyWarnings()
    const resourcesDir = await createAppDir(tmpDir, { "main.js": 'const { autoUpdater } = require("electron-updater")\nautoUpdater.checkForUpdatesAndNotify()\n' })
    await warnIfCrossOriginHeadersNotMentioned(await createProject(tmpDir), resourcesDir)

    expect(crossOriginWarnings()).toHaveLength(1)
    const [fields, message] = crossOriginWarnings()[0] as unknown as [Record<string, string>, string]
    expect(message).toContain("found no mention of crossOriginHeaders in the app's files (outside node_modules)")
    expect(message).toContain("electron-updater rejects every update check and download of the installed app with ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED")
    expect(fields.solution).toContain("autoUpdater.crossOriginHeaders = () => []")
    expect(message.endsWith(` See ${docs}`)).toBe(true)
    // the rule itself names no version
    expect(`${message} ${fields.solution}`.replace(docs, "")).not.toMatch(/electron-updater \d|electron-builder \d|\bv\d\d|\b(now|no longer)\b/i)
  })

  test.for([
    ["an assignment", "main.js", assignment],
    ["a minified assignment", "dist/main.cjs", 'e.crossOriginHeaders=()=>[],e.checkForUpdates();var s="a/b"'],
    ["an ES module", "main.mjs", 'import { autoUpdater } from "electron-updater"\nautoUpdater.crossOriginHeaders = function () { return [] }'],
  ])("no warning for %s", async ([, file, code], { expect, tmpDir }) => {
    const resourcesDir = await createAppDir(tmpDir, { "package.json": "{}", [file]: code })
    expect(await warnings(await createProject(tmpDir), resourcesDir)).toBe(0)
  })

  test("no warning when the only mention is a bundled electron-updater (an app that bundles it is not checked)", async ({ expect, tmpDir }) => {
    const bundledElectronUpdater = "class AppUpdater {\n  constructor() {\n    this.crossOriginHeaders = null;\n  }\n}\n"
    const resourcesDir = await createAppDir(tmpDir, { "dist/main.js": bundledElectronUpdater })
    expect(await warnings(await createProject(tmpDir), resourcesDir)).toBe(0)
  })

  test("a mention inside node_modules or in a file over the size limit is not counted", async ({ expect, tmpDir }) => {
    const project = await createProject(tmpDir)
    expect(await warnings(project, await createAppDir(tmpDir, { "main.js": "", "node_modules/updater-wrapper/index.js": assignment }))).toBe(1)
    expect(await warnings(project, await createAppDir(tmpDir, { "main.js": "", "dist/data.js": assignment + " ".repeat(20 * 1024 * 1024) }))).toBe(1)
  })

  test("a symlink in the app directory is not followed", async ({ expect, tmpDir }) => {
    const outside = await tmpDir.getTempDir({ prefix: "cross-origin-headers-outside" })
    await outputFile(path.join(outside, "main.js"), assignment)
    const resourcesDir = await createAppDir(tmpDir, { "package.json": "{}" })
    await symlink(path.join(outside, "main.js"), path.join(resourcesDir, "app", "main.js"))
    expect(await warnings(await createProject(tmpDir), resourcesDir)).toBe(1)
  })

  test("reads app.asar, its unpacked files, but not its node_modules or files over the size limit", async ({ expect, tmpDir }) => {
    const project = await createProject(tmpDir)
    expect(await warnings(project, await createAsar(tmpDir, { "dist/main.js": assignment }))).toBe(0)
    expect(await warnings(project, await createAsar(tmpDir, { "main.js": "", "unpacked/main.js": assignment }, "**/unpacked/**"))).toBe(0)
    expect(await warnings(project, await createAsar(tmpDir, { "main.js": "", "node_modules/wrapper/index.js": assignment }))).toBe(1)
    expect(await warnings(project, await createAsar(tmpDir, { "main.js": "", "dist/data.js": assignment + " ".repeat(20 * 1024 * 1024) }))).toBe(1)
  })

  test("an unpacked file of app.asar that is a symlink is not followed", async ({ expect, tmpDir }) => {
    const outside = await tmpDir.getTempDir({ prefix: "cross-origin-headers-outside" })
    await outputFile(path.join(outside, "main.js"), assignment)
    const resourcesDir = await createAsar(tmpDir, { "main.js": "", "unpacked/main.js": "// placeholder\n" }, "**/unpacked/**")
    const unpacked = path.join(resourcesDir, "app.asar.unpacked", "unpacked", "main.js")
    await symlink(path.join(outside, "main.js"), `${unpacked}.link`)
    await rename(`${unpacked}.link`, unpacked)
    expect(await warnings(await createProject(tmpDir), resourcesDir)).toBe(1)
  })

  test("no warning when the resources hold no app to scan, or app.asar cannot be read (the build never fails on it)", async ({ expect, tmpDir }) => {
    const project = await createProject(tmpDir)
    const empty = path.join(await tmpDir.getTempDir({ prefix: "cross-origin-headers-empty" }), "resources")
    expect(await warnings(project, empty)).toBe(0)

    const corrupt = path.join(await tmpDir.getTempDir({ prefix: "cross-origin-headers-corrupt" }), "resources")
    await outputFile(path.join(corrupt, "app.asar"), "not an asar archive")
    expect(await warnings(project, corrupt)).toBe(0)
  })
})

describe("which apps are checked", () => {
  const noMention = { "main.js": 'require("electron-updater").autoUpdater.checkForUpdates()\n' }

  test("electron-updater in the app's dependencies is checked too", async ({ expect, tmpDir }) => {
    const project = await createProject(tmpDir, { dependencies: { "electron-updater": "^7.0.0" }, devDependencies: {} })
    expect(await warnings(project, await createAppDir(tmpDir, noMention))).toBe(1)
  })

  test("no warning for an app without electron-updater", async ({ expect, tmpDir }) => {
    const project = await createProject(tmpDir, { installed: null, devDependencies: { electron: "^30.0.0" } })
    expect(await warnings(project, await createAppDir(tmpDir, noMention))).toBe(0)
  })

  test("no warning for an electron-updater that predates the property", async ({ expect, tmpDir }) => {
    const resourcesDir = await createAppDir(tmpDir, noMention)
    expect(await warnings(await createProject(tmpDir, { installed: "6.8.11" }), resourcesDir)).toBe(0)
    expect(await warnings(await createProject(tmpDir, { installed: "7.0.0-alpha.13" }), resourcesDir)).toBe(0)
    // not installed: the declared range decides
    expect(await warnings(await createProject(tmpDir, { installed: null, devDependencies: { "electron-updater": "^6.8.0" } }), resourcesDir)).toBe(0)
    expect(await warnings(await createProject(tmpDir, { installed: "7.0.0-alpha.14" }), resourcesDir)).toBe(1)
  })

  test("an electron-updater whose version cannot be read may require it", async ({ expect, tmpDir }) => {
    const resourcesDir = await createAppDir(tmpDir, noMention)
    expect(await warnings(await createProject(tmpDir, { installed: null, devDependencies: { "electron-updater": "catalog:" } }), resourcesDir)).toBe(1)
    expect(await warnings(await createProject(tmpDir, { installed: null, devDependencies: { "electron-updater": "latest" } }), resourcesDir)).toBe(1)
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

  function makePlatformPackager(publish: any) {
    return {
      platform: Platform.LINUX,
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

  async function pack(tmpDir: TmpDir, afterPack: (event: any) => Promise<void>, packager: any, arch: Arch) {
    const appOutDir = path.dirname(await createAppDir(tmpDir, { "main.js": "autoUpdater.checkForUpdates()\n" }))
    await writeFile(path.join(appOutDir, "resources", "app", "package.json"), "{}")
    await afterPack({ packager, electronPlatformName: "linux", arch, appOutDir, outDir: appOutDir, targets: [{ name: "AppImage", options: null, writesUpdateInfo: true }] })
    return pathExists(path.join(appOutDir, "resources", "app-update.yml"))
  }

  test("warns once for a build that writes app-update.yml, however many archs and platforms it packs", async ({ expect, tmpDir }) => {
    const crossOriginWarnings = spyWarnings()
    const afterPack = createManager(await createProject(tmpDir))
    const packager = makePlatformPackager({ provider: "generic", url: "https://example.com/updates" })
    for (const arch of [Arch.x64, Arch.arm64, Arch.armv7l]) {
      expect(await pack(tmpDir, afterPack, packager, arch)).toBe(true)
    }
    expect(crossOriginWarnings()).toHaveLength(1)
  })

  test("no warning for a build that writes no app-update.yml", async ({ expect, tmpDir }) => {
    const crossOriginWarnings = spyWarnings()
    const afterPack = createManager(await createProject(tmpDir))
    expect(await pack(tmpDir, afterPack, makePlatformPackager(null), Arch.x64)).toBe(false)
    expect(crossOriginWarnings()).toHaveLength(0)
  })
})
