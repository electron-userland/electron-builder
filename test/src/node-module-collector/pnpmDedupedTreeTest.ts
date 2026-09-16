import { describe, test } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { PnpmNodeModulesCollector } from "app-builder-lib/src/node-module-collector/pnpmNodeModulesCollector"
import { LogMessageByKey } from "app-builder-lib/src/node-module-collector/moduleManager"
import type { NodeModuleInfo, PnpmDependency } from "app-builder-lib/src/node-module-collector/types"
import { TmpDir } from "builder-util"

// ---------------------------------------------------------------------------
// Regression for the `pnpm list --prod --json --depth Infinity` shape pnpm emits since 10.29.3
// (pnpm/pnpm#10601): a repeated subtree is printed in full once, and every other occurrence is a
// childless stub flagged `deduped: true` / `dedupedDependenciesCount`. When the stub is the first
// occurrence the collector meets, the package's dependencies have to be recovered from its
// package.json — and that recovery used to take the first collected version of each name.
//
// With two versions of one package installed that rewired the nested, version-conflicted copy to
// the hoisted one and dropped it from the asar: the app pins es5-ext@0.10.53, its transitive
// d@1.0.2 needs es5-ext ^0.10.64, and `d` ended up requiring 0.10.53 (issue #8493, resurfacing
// under pnpm 10.29.3+). The shape below is that graph reduced to its essentials.
// ---------------------------------------------------------------------------

describe("PnpmNodeModulesCollector deduped list output", () => {
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

  function findNode(deps: NodeModuleInfo[], name: string): NodeModuleInfo | undefined {
    for (const d of deps) {
      if (d.name === name) {
        return d
      }
      const found = findNode(d.dependencies ?? [], name)
      if (found) {
        return found
      }
    }
    return undefined
  }

  test("keeps the nested version-conflicted copy when its dependent is first met as a deduped stub", async ({ expect, tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const store = path.join(root, "node_modules", ".pnpm")
    // Isolated-store layout: `.pnpm/<name>@<ver>/node_modules/<name>` is the real directory and the
    // package's dependencies are symlinked next to it.
    const pkgDir = (name: string, version: string) => path.join(store, `${name}@${version}`, "node_modules", name)
    const link = (name: string, version: string, into: string) => fse.ensureSymlink(pkgDir(name, version), path.join(path.dirname(into), name), "junction")

    // app -> x@1; x@1 -> s, y; y -> s; s -> d; d -> x@2 (the copy that must stay nested under d)
    await fse.outputJson(path.join(root, "package.json"), { private: true, name: "TestApp", version: "1.0.0", dependencies: { x: "1.0.0" } })
    await fse.outputJson(path.join(pkgDir("x", "1.0.0"), "package.json"), { name: "x", version: "1.0.0", dependencies: { s: "^1.0.0", y: "^1.0.0" } })
    await fse.outputJson(path.join(pkgDir("y", "1.0.0"), "package.json"), { name: "y", version: "1.0.0", dependencies: { s: "^1.0.0" } })
    await fse.outputJson(path.join(pkgDir("s", "1.0.0"), "package.json"), { name: "s", version: "1.0.0", dependencies: { d: "^1.0.0" } })
    await fse.outputJson(path.join(pkgDir("d", "1.0.0"), "package.json"), { name: "d", version: "1.0.0", dependencies: { x: "^2.0.0" } })
    await fse.outputJson(path.join(pkgDir("x", "2.0.0"), "package.json"), { name: "x", version: "2.0.0" })

    await fse.ensureSymlink(pkgDir("x", "1.0.0"), path.join(root, "node_modules", "x"), "junction")
    await link("s", "1.0.0", pkgDir("x", "1.0.0"))
    await link("y", "1.0.0", pkgDir("x", "1.0.0"))
    await link("s", "1.0.0", pkgDir("y", "1.0.0"))
    await link("d", "1.0.0", pkgDir("s", "1.0.0"))
    await link("x", "2.0.0", pkgDir("d", "1.0.0"))

    const node = (name: string, version: string, dependencies: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
      from: name,
      name,
      version,
      path: pkgDir(name, version),
      dependencies,
      optionalDependencies: {},
      ...extra,
    })
    // pnpm 10.29.3+ prints `s` in full only under `y`; its first occurrence, under `x`, is a stub.
    const tree = {
      name: "TestApp",
      from: "TestApp",
      version: "1.0.0",
      path: root,
      dependencies: {
        x: node("x", "1.0.0", {
          s: node("s", "1.0.0", {}, { deduped: true, dedupedDependenciesCount: 1 }),
          y: node("y", "1.0.0", {
            s: node("s", "1.0.0", {
              d: node("d", "1.0.0", {
                x: node("x", "2.0.0"),
              }),
            }),
          }),
        }),
      },
      optionalDependencies: {},
    } as unknown as PnpmDependency

    const collector = new StubbedPnpmNodeModulesCollector(root, new TmpDir("eb-pnpm-deduped-test"), tree)
    const { nodeModules, logSummary } = await collector.getNodeModules({ packageName: "TestApp" })

    const hoistedX = nodeModules.find(it => it.name === "x")
    expect(hoistedX?.version).toBe("1.0.0")

    const d = findNode(nodeModules, "d")
    expect(d).toBeDefined()
    // `d` requires x ^2: the 2.0.0 copy has to ship nested under it, copied from its own store entry.
    const nestedX = d!.dependencies?.find(it => it.name === "x")
    expect(nestedX?.version).toBe("2.0.0")
    expect(nestedX?.dir).toBe(await fse.realpath(pkgDir("x", "2.0.0")))

    expect(logSummary[LogMessageByKey.PKG_NOT_ON_DISK] ?? []).toEqual([])
    expect(logSummary[LogMessageByKey.PKG_NOT_FOUND] ?? []).toEqual([])
  })
})
