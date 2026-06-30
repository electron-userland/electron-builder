import { afterEach, describe, test, vi } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { collectNodeModulesWithLogging, PM, TraversalNodeModulesCollector } from "app-builder-lib/internal"
import { log, TmpDir } from "builder-util"

// Exercises the full collector pipeline (production graph -> ignore-pruning -> hoist -> node module
// tree) on a synthetic, flattened node_modules layout. The key correctness property: an ignored
// package's *exclusively-owned* transitive dependencies are dropped too, while a transitive
// dependency that is also reachable from a legitimate production dependency (deduped/hoisted by the
// package manager into a single entry) is kept.

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

  test("excludes an ignored production dependency and its exclusively-owned transitive deps", async ({ expect }) => {
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

    const { nodeModules, excludedDependencies } = await runCollector(root, "my-app", ["electron"])
    const names = nodeModules.map(m => m.name)

    expect(names).toContain("keep-me")
    expect(names).not.toContain("electron")
    expect(names).not.toContain("electron-only-dep")
    expect(excludedDependencies).toEqual(["electron", "electron-only-dep"])
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

    const { nodeModules, excludedDependencies } = await runCollector(root, "my-app", ["electron"])
    const names = nodeModules.map(m => m.name)

    expect(names).toContain("keep-me")
    expect(names).toContain("shared-dep")
    expect(names).not.toContain("electron")
    expect(excludedDependencies).toEqual(["electron"])
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

    const { nodeModules, excludedDependencies } = await runCollector(root, "my-app")
    const names = nodeModules.map(m => m.name)

    expect(names).toContain("electron")
    expect(excludedDependencies).toEqual([])
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

    const tripwire = warnings.find(w => w.message.includes("electron-builder normally provides itself"))
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
    const names = nodeModules.map(m => m.name)
    expect(names).not.toContain("electron")
    expect(names).not.toContain("electron-builder")
    expect(warnings.some(w => w.message.includes("electron-builder normally provides itself"))).toBe(false)
  })
})
