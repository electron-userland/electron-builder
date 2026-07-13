import { afterEach, describe, test, vi } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { collectNodeModulesWithLogging, PM, readAsar, TraversalNodeModulesCollector } from "app-builder-lib/internal"
import { LogMessageByKey } from "app-builder-lib/src/node-module-collector/moduleManager"
import { NpmNodeModulesCollector } from "app-builder-lib/src/node-module-collector/npmNodeModulesCollector"
import type { NodeModuleInfo, NpmDependency } from "app-builder-lib/src/node-module-collector/types"
import { log, TmpDir } from "builder-util"
import { Platform } from "electron-builder"
import { app, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"

// Exercises the full collector pipeline (production graph -> exclusion marking -> hoist -> node module
// tree) on a synthetic, flattened node_modules layout. The key correctness properties: ignored
// production dependencies are *kept* in the collected tree (so they remain directory-validation
// markers) but flagged `excluded` for the file copier; only a *top-level* declared dependency and its
// *exclusively-owned* transitive subtree are flagged, while a transitive dependency also reachable
// from a legitimate production dependency (deduped/hoisted into a single entry) is left untouched; and
// the `logSummary` PKG_EXCLUDED_IGNORED bucket records only the top-level exclusions.

const projectTmpDir = new TmpDir("eb-ignored-prod-deps-test")

async function buildPackageTree(packages: Record<string, object>): Promise<string> {
  const root = await projectTmpDir.createTempDir()
  for (const [rel, json] of Object.entries(packages)) {
    const abs = path.join(root, rel)
    await fse.ensureDir(path.dirname(abs))
    await fse.writeJson(abs, json)
  }
  return root
}

async function runCollector(rootDir: string, packageName: string, ignoredDependencies?: ReadonlyArray<string>) {
  const collector = new TraversalNodeModulesCollector(rootDir, projectTmpDir as unknown as TmpDir)
  return collector.getNodeModules({ packageName, ignoredDependencies })
}

// The collected node module tree is nested (top-level array with `.dependencies`), and the hoister may
// place a package at the top level or nested under a dependent. Flatten it into a name -> node map so
// assertions do not depend on hoisting placement. Names are unique across a single collected tree.
function flattenByName(nodeModules: NodeModuleInfo[]): Map<string, NodeModuleInfo> {
  const byName = new Map<string, NodeModuleInfo>()
  const visit = (nodes: NodeModuleInfo[]) => {
    for (const node of nodes) {
      byName.set(node.name, node)
      if (node.dependencies != null) {
        visit(node.dependencies)
      }
    }
  }
  visit(nodeModules)
  return byName
}

// Runs the full app-side collection (collectNodeModulesWithLogging) against a synthetic project,
// capturing `log.warn`/`log.info` messages so the electron-builder tripwire and the exclusion
// summary line can be asserted.
async function collectWithWarnings(rootDir: string, packageName: string, dependencies: Record<string, string>, ignoredProductionDependencies?: Array<string> | null) {
  const warn = vi.spyOn(log, "warn").mockImplementation(() => log as any)
  const info = vi.spyOn(log, "info").mockImplementation(() => log as any)
  try {
    const platformPackager = {
      tempDirManager: projectTmpDir,
      appDir: rootDir,
      projectDir: rootDir,
      nodePackageName: packageName,
      platform: { nodeName: "darwin" },
      originalMetadata: { dependencies },
      config: { ignoredProductionDependencies },
      getWorkspaceRoot: async () => null,
      getPackageManager: async () => PM.TRAVERSAL,
    } as unknown as Parameters<typeof collectNodeModulesWithLogging>[0]
    const nodeModules = await collectNodeModulesWithLogging(platformPackager, null)
    const toEntries = (calls: Array<Array<any>>) => calls.map(args => ({ fields: args[0] as Record<string, any> | null, message: String(args[1] ?? "") }))
    return { nodeModules, warnings: toEntries(warn.mock.calls), infos: toEntries(info.mock.calls) }
  } finally {
    warn.mockRestore()
    info.mockRestore()
  }
}

describe("ignoredProductionDependencies (collector pruning)", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
      root = ""
    }
  })

  test("flags an ignored production dependency and its exclusively-owned transitive deps as excluded", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { electron: "^30.0.0", "keep-me": "^1.0.0" },
      },
      "node_modules/electron/package.json": {
        name: "electron",
        version: "30.0.0",
        dependencies: { "electron-only-dep": "^1.0.0" },
      },
      "node_modules/electron-only-dep/package.json": { name: "electron-only-dep", version: "1.0.0" },
      "node_modules/keep-me/package.json": { name: "keep-me", version: "1.0.0" },
    })

    const { nodeModules, logSummary } = await runCollector(root, "my-app", ["electron"])
    const byName = flattenByName(nodeModules)

    // Ignored deps stay in the tree (as directory-validation markers) but are flagged for the copier.
    expect(byName.get("electron")?.excluded).toBe(true)
    expect(byName.get("electron-only-dep")?.excluded).toBe(true)
    expect(byName.get("keep-me")?.excluded).toBeFalsy()
    // Only the top-level exclusion is surfaced to the user; the transitive subtree is not logged.
    expect(logSummary[LogMessageByKey.PKG_EXCLUDED_IGNORED] ?? []).toEqual(["electron"])
  })

  test("keeps a transitive dependency that is also required by a non-ignored production dependency", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { electron: "^30.0.0", "keep-me": "^1.0.0" },
      },
      "node_modules/electron/package.json": {
        name: "electron",
        version: "30.0.0",
        dependencies: { "shared-dep": "^1.0.0" },
      },
      "node_modules/keep-me/package.json": {
        name: "keep-me",
        version: "1.0.0",
        dependencies: { "shared-dep": "^1.0.0" },
      },
      // npm/pnpm dedupe `shared-dep` into a single hoisted entry used by both electron and keep-me.
      "node_modules/shared-dep/package.json": { name: "shared-dep", version: "1.0.0" },
    })

    const { nodeModules, logSummary } = await runCollector(root, "my-app", ["electron"])
    const byName = flattenByName(nodeModules)

    expect(byName.get("keep-me")?.excluded).toBeFalsy()
    // Shared with a kept dependency -> must not be flagged for exclusion.
    expect(byName.get("shared-dep")?.excluded).toBeFalsy()
    expect(byName.get("electron")?.excluded).toBe(true)
    expect(logSummary[LogMessageByKey.PKG_EXCLUDED_IGNORED] ?? []).toEqual(["electron"])
  })

  test("does not exclude a package that is only a transitive dependency of a non-ignored prod dep", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { "keep-me": "^1.0.0" },
      },
      "node_modules/keep-me/package.json": {
        name: "keep-me",
        version: "1.0.0",
        dependencies: { "transitive-dep": "^1.0.0" },
      },
      "node_modules/transitive-dep/package.json": { name: "transitive-dep", version: "1.0.0" },
    })

    // `transitive-dep` is ignored by name but is NOT a top-level dependency, so it must be left alone.
    const { nodeModules, logSummary } = await runCollector(root, "my-app", ["transitive-dep"])
    const byName = flattenByName(nodeModules)

    expect(byName.get("keep-me")?.excluded).toBeFalsy()
    expect(byName.get("transitive-dep")?.excluded).toBeFalsy()
    expect(logSummary[LogMessageByKey.PKG_EXCLUDED_IGNORED] ?? []).toEqual([])
  })

  test("does not exclude a top-level ignored dep that is also required by a non-ignored prod dep", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { electron: "^30.0.0", "keep-me": "^1.0.0" },
      },
      "node_modules/electron/package.json": { name: "electron", version: "30.0.0" },
      "node_modules/keep-me/package.json": {
        name: "keep-me",
        version: "1.0.0",
        dependencies: { electron: "^30.0.0" },
      },
    })

    // `electron` is a declared, ignored top-level dep, but `keep-me` also needs it, so it stays.
    const { nodeModules, logSummary } = await runCollector(root, "my-app", ["electron"])
    const byName = flattenByName(nodeModules)

    expect(byName.get("electron")?.excluded).toBeFalsy()
    expect(byName.get("keep-me")?.excluded).toBeFalsy()
    expect(logSummary[LogMessageByKey.PKG_EXCLUDED_IGNORED] ?? []).toEqual([])
  })

  test("leaves the tree unchanged when no ignore list is supplied", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { electron: "^30.0.0" },
      },
      "node_modules/electron/package.json": { name: "electron", version: "30.0.0" },
    })

    const { nodeModules, logSummary } = await runCollector(root, "my-app")
    const electron = flattenByName(nodeModules).get("electron")

    expect(electron).toBeDefined()
    expect(electron?.excluded).toBeFalsy()
    expect(logSummary[LogMessageByKey.PKG_EXCLUDED_IGNORED] ?? []).toEqual([])
  })

  test("warns when default-ignored build-time deps are bundled because they were removed from the ignore list", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { electron: "^30.0.0", "electron-builder": "^26.0.0", "keep-me": "^1.0.0" },
      },
      "node_modules/electron/package.json": { name: "electron", version: "30.0.0" },
      "node_modules/electron-builder/package.json": { name: "electron-builder", version: "26.0.0" },
      "node_modules/keep-me/package.json": { name: "keep-me", version: "1.0.0" },
    })

    // User has cleared ignoredProductionDependencies, so the build-time packages survive collection.
    const { nodeModules, warnings } = await collectWithWarnings(root, "my-app", { electron: "^30.0.0", "electron-builder": "^26.0.0", "keep-me": "^1.0.0" }, [])
    expect(nodeModules.map(m => m.name)).toEqual(expect.arrayContaining(["electron", "electron-builder"]))

    const tripwire = warnings.find(w => w.message.includes("copied dependencies that shouldn't be needed"))
    expect(tripwire).toBeDefined()
    expect(tripwire!.fields?.dependencies).toContain("electron")
    expect(tripwire!.fields?.dependencies).toContain("electron-builder")
  })

  test("does not warn when build-time deps are excluded by default", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { electron: "^30.0.0", "electron-builder": "^26.0.0", "keep-me": "^1.0.0" },
      },
      "node_modules/electron/package.json": { name: "electron", version: "30.0.0" },
      "node_modules/electron-builder/package.json": { name: "electron-builder", version: "26.0.0" },
      "node_modules/keep-me/package.json": { name: "keep-me", version: "1.0.0" },
    })

    const { nodeModules, warnings } = await collectWithWarnings(root, "my-app", { electron: "^30.0.0", "electron-builder": "^26.0.0", "keep-me": "^1.0.0" }, [
      "electron",
      "electron-builder",
    ])
    const byName = flattenByName(nodeModules)
    // The build-time deps remain in the tree (as markers) but are flagged so the copier omits them.
    expect(byName.get("electron")?.excluded).toBe(true)
    expect(byName.get("electron-builder")?.excluded).toBe(true)
    expect(byName.get("keep-me")?.excluded).toBeFalsy()
    expect(warnings.some(w => w.message.includes("copied dependencies that shouldn't be needed"))).toBe(false)
  })
})

// Exclusion must not defeat the collection validation introduced for issue #9945: ignored dependencies
// stay in the collected tree (flagged `excluded`) so a correct collection is still recognized as
// matching the app's declared dependencies, and a tree whose every dependency is ignored still counts
// as a successful (effectively empty) collection rather than triggering the wrong-root fallback or the
// "no node modules returned" warning.
describe("ignoredProductionDependencies (exclusion-aware collection validation)", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
      root = ""
    }
  })

  test("collects successfully when every external production dependency is ignored", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { electron: "^30.0.0" },
      },
      "node_modules/electron/package.json": { name: "electron", version: "30.0.0" },
    })

    // No explicit config -> the default ignore list applies, so ALL declared external deps are ignored.
    const { nodeModules, warnings, infos } = await collectWithWarnings(root, "my-app", { electron: "^30.0.0" })
    const byName = flattenByName(nodeModules)

    // The ignored dependency stays in the collection as a validation marker, flagged for the copier...
    expect(byName.get("electron")?.excluded).toBe(true)
    // ...so the collection is accepted as-is: no spurious "empty collection" warning on a correct build...
    expect(warnings.some(w => w.message.includes("no node modules returned"))).toBe(false)
    // ...and the exclusion summary line still reaches the user.
    expect(infos.some(i => i.message.includes("excluded production dependencies"))).toBe(true)
  })

  test("accepts a correct collection when the remaining declared deps are workspace-local (monorepo)", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { electron: "^30.0.0", "@org/shared": "workspace:*" },
      },
      "node_modules/electron/package.json": { name: "electron", version: "30.0.0" },
      "node_modules/@org/shared/package.json": { name: "@org/shared", version: "1.0.0" },
    })

    // `workspace:` specs cannot validate a collection (they are symlinked, not hoisted), so `electron`
    // is the only validation marker left — and it is ignored. Keeping it in the tree (flagged) is what
    // lets the correct collection match instead of losing out to a wrong-root fallback tree.
    const { nodeModules, warnings, infos } = await collectWithWarnings(root, "my-app", { electron: "^30.0.0", "@org/shared": "workspace:*" })
    const byName = flattenByName(nodeModules)

    expect(byName.get("electron")?.excluded).toBe(true)
    expect(byName.get("@org/shared")?.excluded).toBeFalsy()
    expect(warnings.some(w => w.message.includes("no node modules returned"))).toBe(false)
    expect(infos.some(i => i.message.includes("collected node modules do not match"))).toBe(false)
  })
})

// The npm collector builds its production graph from `npm list --json` output, whose graph ids are
// keyed by the *dependency key* (the name the app declares), not the resolved package name. This suite
// feeds the collector canned `npm list` trees to pin down how exclusion matching interacts with that id
// format — most notably npm aliases (`"custom-electron": "npm:electron@^30.0.0"`), which are matched by
// their alias key, never by the underlying package name.
describe("ignoredProductionDependencies (npm collector graph ids)", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
      root = ""
    }
  })

  class StubbedNpmNodeModulesCollector extends NpmNodeModulesCollector {
    constructor(
      rootDir: string,
      tempDirManager: TmpDir,
      private readonly cannedTree: NpmDependency
    ) {
      super(rootDir, tempDirManager)
    }

    protected override getDependenciesTree(): Promise<NpmDependency> {
      return Promise.resolve(this.cannedTree)
    }
  }

  const runNpmCollector = (rootDir: string, tree: NpmDependency, ignoredDependencies?: ReadonlyArray<string>) =>
    new StubbedNpmNodeModulesCollector(rootDir, projectTmpDir as unknown as TmpDir, tree).getNodeModules({ packageName: "my-app", ignoredDependencies })

  test("marks an ignored dependency excluded through the npm list graph", async ({ expect }) => {
    root = await buildPackageTree({
      "node_modules/electron/package.json": { name: "electron", version: "30.0.0" },
      "node_modules/keep-me/package.json": { name: "keep-me", version: "1.0.0" },
    })
    const tree: NpmDependency = {
      name: "my-app",
      version: "1.0.0",
      path: root,
      _dependencies: { electron: "^30.0.0", "keep-me": "^1.0.0" },
      dependencies: {
        electron: { name: "electron", version: "30.0.0", path: path.join(root, "node_modules", "electron"), _dependencies: {} },
        "keep-me": { name: "keep-me", version: "1.0.0", path: path.join(root, "node_modules", "keep-me"), _dependencies: {} },
      },
    }

    const { nodeModules, logSummary } = await runNpmCollector(root, tree, ["electron"])
    const byName = flattenByName(nodeModules)

    expect(byName.get("electron")?.excluded).toBe(true)
    expect(byName.get("keep-me")?.excluded).toBeFalsy()
    expect(logSummary[LogMessageByKey.PKG_EXCLUDED_IGNORED] ?? []).toEqual(["electron"])
  })

  test("matches npm aliases by their alias key, not the underlying package name", async ({ expect }) => {
    root = await buildPackageTree({
      "node_modules/custom-electron/package.json": { name: "electron", version: "30.0.0" },
    })
    // `npm list --json` reports the alias key as the dependency key and the real package name inside.
    const makeTree = (): NpmDependency => ({
      name: "my-app",
      version: "1.0.0",
      path: root,
      _dependencies: { "custom-electron": "npm:electron@^30.0.0" },
      dependencies: {
        "custom-electron": { name: "electron", version: "30.0.0", path: path.join(root, "node_modules", "custom-electron"), _dependencies: {} },
      },
    })

    // Matching happens on the declared (alias) name, so the real package name does NOT match...
    const byRealName = await runNpmCollector(root, makeTree(), ["electron"])
    expect(flattenByName(byRealName.nodeModules).get("custom-electron")?.excluded).toBeFalsy()
    expect(byRealName.logSummary[LogMessageByKey.PKG_EXCLUDED_IGNORED] ?? []).toEqual([])

    // ...while the alias key itself does.
    const byAliasName = await runNpmCollector(root, makeTree(), ["custom-electron"])
    expect(flattenByName(byAliasName.nodeModules).get("custom-electron")?.excluded).toBe(true)
    expect(byAliasName.logSummary[LogMessageByKey.PKG_EXCLUDED_IGNORED] ?? []).toEqual(["custom-electron"])
  })
})

describe("ignoredProductionDependencies (pack-level)", () => {
  test("packed app omits ignored production dependencies from node_modules", ({ expect }) =>
    app(
      expect,
      { targets: linuxDirTarget },
      {
        projectDirCreated: (projectDir, _tmpDir, testEnv) => {
          // electron's postinstall would download the full runtime binary; the packaged app never uses
          // that copy (the dependency is excluded), so skip the download to keep the test lean.
          testEnv.ELECTRON_SKIP_BINARY_DOWNLOAD = "1"
          return modifyPackageJson(projectDir, data => {
            data.dependencies = {
              electron: ELECTRON_VERSION, // in the default ignore list -> must NOT be copied
              ms: "2.1.3", // kept -> proves node_modules copying itself ran
            }
          })
        },
        packed: async context => {
          const asarFs = await readAsar(path.join(context.getResources(Platform.LINUX), "app.asar"))
          const nodeModules = asarFs.header.files?.["node_modules"]?.files
          // The kept dependency is bundled, while the ignored production dependency is excluded.
          expect(Object.keys(nodeModules ?? {})).toContain("ms")
          expect(nodeModules?.["electron"]).toBeUndefined()
        },
      }
    ))
})
