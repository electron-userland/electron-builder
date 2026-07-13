import { afterEach, describe, test, vi } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { collectNodeModulesWithLogging, PM, TraversalNodeModulesCollector } from "app-builder-lib/internal"
import { LogMessageByKey } from "app-builder-lib/src/node-module-collector/moduleManager"
import type { NodeModuleInfo } from "app-builder-lib/src/node-module-collector/types"
import { log, TmpDir } from "builder-util"

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
// capturing any `log.warn` messages so the electron-builder tripwire can be asserted.
async function collectWithWarnings(rootDir: string, packageName: string, dependencies: Record<string, string>, ignoredProductionDependencies?: Array<string> | null) {
  const warn = vi.spyOn(log, "warn").mockImplementation(() => log as any)
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
    const warnings = warn.mock.calls.map(args => ({ fields: args[0] as Record<string, any> | null, message: String(args[1] ?? "") }))
    return { nodeModules, warnings }
  } finally {
    warn.mockRestore()
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
