import { describe, test } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { PnpmNodeModulesCollector } from "app-builder-lib/internal"
import { LogMessageByKey } from "app-builder-lib/src/node-module-collector/moduleManager"
import type { NodeModuleInfo, PnpmDependency } from "app-builder-lib/src/node-module-collector/types"
import { TmpDir } from "temp-file"

// ---------------------------------------------------------------------------
// Regression (#10253): since pnpm 10.29.3 (pnpm/pnpm#10601) `pnpm list --prod --json` prints a
// repeated subtree once and every later occurrence is a childless `deduped` stub. pnpm shares that
// dedupe cache across the whole listing, so the single full print can land outside the tree the
// collector walks, leaving a package (and its whole closure) visible ONLY as stubs. Skipping stubs
// during collection meant such a package never reached allDependencies: it was logged as an
// unresolved duplicate reference, its path could not be found, and its dependencies (`wrappy`
// under `once`, `ms` under `debug`) were missing from the asar.
//
// The store is a real isolated `.pnpm` layout where each package's dependencies are SIBLINGS of it,
// reachable only from its real directory. There is deliberately no hidden `.pnpm/node_modules`
// hoist, so a dependency resolved through a symlink path cannot be found by accident.
// ---------------------------------------------------------------------------

describe("PnpmNodeModulesCollector deduped stubs (#10253)", () => {
  class StubbedPnpmNodeModulesCollector extends PnpmNodeModulesCollector {
    constructor(
      rootDir: string,
      tempDirManager: TmpDir,
      private readonly cannedTree: PnpmDependency
    ) {
      super(rootDir, tempDirManager)
    }

    protected override getDependenciesTree(): Promise<PnpmDependency> {
      // Mirror parseDependenciesTree's side effect without shelling out to `pnpm list`.
      ;(this as any)._allWorkspacePackages = [this.cannedTree]
      return Promise.resolve(this.cannedTree)
    }
  }

  function flatten(deps: NodeModuleInfo[], result = new Map<string, NodeModuleInfo>()): Map<string, NodeModuleInfo> {
    for (const d of deps) {
      result.set(d.name, d)
      flatten(d.dependencies ?? [], result)
    }
    return result
  }

  test("collects packages that pnpm list only prints as deduped stubs, with their transitive deps", async ({ expect, tmpDir }) => {
    const appDir = path.join(await fse.realpath(await tmpDir.createTempDir()), "app")
    const storeNm = (name: string, version: string) => path.join(appDir, "node_modules", ".pnpm", `${name}@${version}`, "node_modules")
    const storeDir = (name: string, version: string) => path.join(storeNm(name, version), name)

    const packages: Record<string, { version: string; dependencies?: Record<string, string> }> = {
      a: { version: "1.0.0", dependencies: { once: "^1.4.0" } },
      b: { version: "1.0.0", dependencies: { once: "^1.4.0", debug: "^4.4.0", "cross-spawn": "^7.0.0" } },
      once: { version: "1.4.0", dependencies: { wrappy: "1" } },
      wrappy: { version: "1.0.2" },
      debug: { version: "4.4.3", dependencies: { ms: "^2.1.3" } },
      ms: { version: "2.1.3" },
      // Three levels deep: `isexe` is reachable only from `which`'s real directory.
      "cross-spawn": { version: "7.0.6", dependencies: { which: "^2.0.1" } },
      which: { version: "2.0.2", dependencies: { isexe: "^2.0.0" } },
      isexe: { version: "2.0.0" },
    }

    await fse.outputJson(path.join(appDir, "package.json"), { name: "TestApp", version: "1.0.0", dependencies: { a: "1.0.0", b: "1.0.0" } })
    for (const [name, { version, dependencies }] of Object.entries(packages)) {
      await fse.outputJson(path.join(storeDir(name, version), "package.json"), { name, version, dependencies })
    }
    for (const [name, { version, dependencies }] of Object.entries(packages)) {
      for (const depName of Object.keys(dependencies ?? {})) {
        await fse.ensureSymlink(storeDir(depName, packages[depName].version), path.join(storeNm(name, version), depName), "junction")
      }
    }
    for (const name of ["a", "b"]) {
      await fse.ensureSymlink(storeDir(name, packages[name].version), path.join(appDir, "node_modules", name), "junction")
    }

    const node = (name: string, dependencies?: Record<string, unknown>) => ({
      from: name,
      version: packages[name].version,
      path: storeDir(name, packages[name].version),
      ...(dependencies && { dependencies }),
    })
    const stub = (name: string) => ({ ...node(name), deduped: true, dedupedDependenciesCount: Object.keys(packages[name].dependencies ?? {}).length })

    // `once`, `debug` and `cross-spawn` never appear with children anywhere in the listing.
    const tree = {
      name: "TestApp",
      from: "TestApp",
      version: "1.0.0",
      path: appDir,
      dependencies: {
        a: node("a", { once: stub("once") }),
        b: node("b", { once: stub("once"), debug: stub("debug"), "cross-spawn": stub("cross-spawn") }),
      },
    } as unknown as PnpmDependency

    const collector = new StubbedPnpmNodeModulesCollector(appDir, tmpDir, tree)
    const { nodeModules, logSummary } = await collector.getNodeModules({ packageName: "TestApp" })

    const collected = flatten(nodeModules)
    expect([...collected.keys()].sort()).toEqual(["a", "b", "cross-spawn", "debug", "isexe", "ms", "once", "which", "wrappy"])
    // ...each copied from its own store directory.
    expect(collected.get("wrappy")!.dir).toBe(await fse.realpath(storeDir("wrappy", "1.0.2")))
    expect(collected.get("isexe")!.dir).toBe(await fse.realpath(storeDir("isexe", "2.0.0")))

    expect(logSummary[LogMessageByKey.PKG_DUPLICATE_REF_UNRESOLVED] ?? []).toEqual([])
    expect(logSummary[LogMessageByKey.PKG_NOT_FOUND] ?? []).toEqual([])
    expect(logSummary[LogMessageByKey.PKG_NOT_ON_DISK] ?? []).toEqual([])
  })
})
