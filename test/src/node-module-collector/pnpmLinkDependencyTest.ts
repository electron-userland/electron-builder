import { describe, test } from "vitest"
import * as fse from "fs-extra"
import * as os from "os"
import * as path from "path"
import { spawn } from "builder-util"
import { PnpmNodeModulesCollector } from "app-builder-lib/internal"
import { LogMessageByKey } from "app-builder-lib/src/node-module-collector/moduleManager"
import type { PnpmDependency } from "app-builder-lib/src/node-module-collector/types"
import { TmpDir } from "temp-file"

const REPO_ROOT = path.resolve(__dirname, "../../..")

const makeCollector = (rootDir: string): any => new (PnpmNodeModulesCollector as any)(rootDir, new TmpDir("link-test"))

// ---------------------------------------------------------------------------
// Unit: resolveLinkTarget resolves link: deps to their real source dir, never
// the node_modules junction. The absolute-spec branch is the CI cross-drive case
// (repo on D:, app on C:) where pnpm cannot express the link relative.
// ---------------------------------------------------------------------------

describe("PnpmNodeModulesCollector.resolveLinkTarget", () => {
  const rootDir = path.join(os.tmpdir(), "eb-link-root")
  const collector = makeCollector(rootDir)

  test("returns null for a normal (non-link) version", ({ expect }) => {
    expect(collector.resolveLinkTarget({ version: "1.2.3" })).toBeNull()
    expect(collector.resolveLinkTarget({ version: "^1.0.0", path: path.join(rootDir, "node_modules", "x") })).toBeNull()
    expect(collector.resolveLinkTarget({ version: undefined })).toBeNull()
  })

  test("uses the absolute link: spec directly (CI cross-drive case)", ({ expect }) => {
    // pnpm cannot relativize a cross-drive link, so it reports an absolute spec; the collector
    // must use it as-is rather than re-resolving through the (unreadable) node_modules junction.
    const absTarget = path.resolve(os.tmpdir(), "some", "linked-package")
    const result = collector.resolveLinkTarget({ version: `link:${absTarget}`, path: path.join(rootDir, "node_modules", "linked-package") })
    expect(result).toBe(path.normalize(absTarget))
  })

  test("prefers pnpm's resolved absolute path for a relative link: spec", ({ expect }) => {
    const resolvedSource = path.resolve(os.tmpdir(), "workspace", "packages", "foo")
    const result = collector.resolveLinkTarget({ version: "link:../packages/foo", path: resolvedSource })
    expect(result).toBe(path.normalize(resolvedSource))
  })

  test("resolves a relative link: spec against the workspace root when no path is given", ({ expect }) => {
    const result = collector.resolveLinkTarget({ version: "link:../packages/foo" })
    expect(result).toBe(path.resolve(rootDir, "../packages/foo"))
  })
})

// ---------------------------------------------------------------------------
// Integration: a real pnpm hoisted install of an app that depends on a local
// package via link:. The collector must bundle the link: package (and its
// transitive deps) and resolve it to its real source dir, NOT the node_modules
// junction — the junction is unreadable across drives in CI, which previously
// dropped electron-updater from the asar (MODULE_NOT_FOUND at runtime).
// ---------------------------------------------------------------------------

function flattenNames(deps: any[]): string[] {
  const names = new Set<string>()
  const visit = (d: any) => {
    if (!d) {
      return
    }
    names.add(d.name)
    for (const c of d.dependencies || []) {
      visit(c)
    }
  }
  deps.forEach(visit)
  return [...names].sort()
}

describe("PnpmNodeModulesCollector link: dependency bundling", () => {
  let root = ""

  test("bundles a link: package and its transitive deps, resolved to the real source dir", { timeout: 120_000 }, async ({ expect, tmpDir }) => {
    root = await tmpDir.createTempDir()
    const appDir = path.join(root, "app")
    await fse.ensureDir(appDir)

    // Mirror the blackbox updater app: electron-updater + builder-util-runtime linked from the
    // repo, with their declared deps spread in (so they install as hoisted top-level packages).
    const updaterPath = path.join(REPO_ROOT, "packages", "electron-updater")
    const utilPath = path.join(REPO_ROOT, "packages", "builder-util-runtime")
    const updaterPkg = await fse.readJson(path.join(updaterPath, "package.json"))
    const utilPkg = await fse.readJson(path.join(utilPath, "package.json"))
    const dependencies: Record<string, string> = {
      "electron-updater": `link:${updaterPath}`,
      ...updaterPkg.dependencies,
      "builder-util-runtime": `link:${utilPath}`,
      ...utilPkg.dependencies,
    }
    for (const [k, v] of Object.entries(dependencies)) {
      if (v.startsWith("workspace:")) {
        delete dependencies[k]
      } // won't resolve outside the monorepo; link: above replaces it
    }
    await fse.writeJson(path.join(appDir, "package.json"), { private: true, name: "TestApp", version: "1.1.0", dependencies }, { spaces: 2 })
    await fse.writeFile(path.join(appDir, ".npmrc"), "node-linker=hoisted")
    await spawn("pnpm", ["install", "--config.node-linker=hoisted"], { cwd: appDir })

    const collector = makeCollector(appDir)
    const { nodeModules } = await collector.getNodeModules({ packageName: "TestApp" })

    const names = flattenNames(nodeModules)
    const required = [
      "electron-updater",
      "builder-util-runtime",
      "fs-extra",
      "js-yaml",
      "semver",
      "debug",
      "sax",
      "lazy-val",
      "tiny-typed-emitter",
      "lodash.escaperegexp",
      "lodash.isequal",
    ]
    expect(required.filter(r => !names.includes(r))).toEqual([])

    // The link: entries must resolve to their real source dirs, not the app's node_modules
    // junction (which is unreadable across drives on CI).
    const allDeps: Map<string, any> = collector.allDependencies
    const updaterEntry = [...allDeps.entries()].find(([id]) => id.startsWith("electron-updater@link:"))
    const utilEntry = [...allDeps.entries()].find(([id]) => id.startsWith("builder-util-runtime@link:"))
    expect(updaterEntry?.[1]?.path).toBe(updaterPath)
    expect(utilEntry?.[1]?.path).toBe(utilPath)
    const nmJunction = path.join(appDir, "node_modules")
    expect(updaterEntry![1].path.startsWith(nmJunction)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Regression: a link:ed package whose own dependencies live in an ISOLATED pnpm
// store. There, `node_modules/<name>` is a link into `.pnpm/<name>@<ver>/node_modules/<name>`
// and that package's dependencies sit as SIBLINGS next to it — reachable only from the link
// target. Resolving a dependency to the link path instead searched upward through the *linking*
// project and found nothing, so the whole sub-closure was dropped from the asar and the packaged
// app died with `Cannot find module 'universalify'` (fs-extra's dep, via electron-updater linked
// from a local electron-builder checkout).
//
// The integration test above cannot catch this: it spreads the linked packages' dependencies into
// the test app's own `dependencies` and installs hoisted, so every transitive dep is also a
// top-level package of the app and the root-dir fallback finds it regardless.
// ---------------------------------------------------------------------------

describe("PnpmNodeModulesCollector isolated-store transitive deps", () => {
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

  function findNode(deps: any[], name: string): any {
    for (const d of deps) {
      if (d?.name === name) {
        return d
      }
      const found = findNode(d?.dependencies || [], name)
      if (found) {
        return found
      }
    }
    return undefined
  }

  test("bundles a link: package's deps that live as siblings in the .pnpm store", async ({ expect, tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const appDir = path.join(root, "app")
    const libDir = path.join(root, "lib")
    // The store belongs to the *linked checkout*, outside the app entirely.
    const storeNm = path.join(root, "checkout", "node_modules", ".pnpm", "outer@1.0.0", "node_modules")

    // A workspace sibling of the linked package, reached by a plain (non-link:) version — the
    // `builder-util-runtime` shape. Its own deps live in its own node_modules.
    const siblingDir = path.join(root, "sibling")

    await fse.outputJson(path.join(appDir, "package.json"), { private: true, name: "TestApp", version: "1.0.0", dependencies: { "linked-lib": "link:../lib" } })
    await fse.outputJson(path.join(libDir, "package.json"), { name: "linked-lib", version: "1.0.0", dependencies: { outer: "^1.0.0", "sibling-lib": "workspace:*" } })
    await fse.outputJson(path.join(storeNm, "outer", "package.json"), { name: "outer", version: "1.0.0", dependencies: { inner: "^1.0.0" } })
    // `inner` is a SIBLING of `outer`, not nested under it — the shape that only the real path reaches.
    await fse.outputJson(path.join(storeNm, "inner", "package.json"), { name: "inner", version: "1.0.0" })
    await fse.outputJson(path.join(siblingDir, "package.json"), { name: "sibling-lib", version: "2.0.0", dependencies: { "sib-dep": "^1.0.0" } })
    await fse.outputJson(path.join(siblingDir, "node_modules", "sib-dep", "package.json"), { name: "sib-dep", version: "1.0.0" })

    await fse.ensureSymlink(libDir, path.join(appDir, "node_modules", "linked-lib"), "junction")
    await fse.ensureSymlink(path.join(storeNm, "outer"), path.join(libDir, "node_modules", "outer"), "junction")
    await fse.ensureSymlink(siblingDir, path.join(libDir, "node_modules", "sibling-lib"), "junction")

    // What `pnpm list --prod --json` actually emits for a link: dep: a `link:` version, the resolved
    // source path, and NO nested dependency tree — which is what forces the on-disk fallback.
    const tree = {
      name: "TestApp",
      from: "TestApp",
      version: "1.0.0",
      path: appDir,
      dependencies: { "linked-lib": { from: "linked-lib", name: "linked-lib", version: "link:../lib", path: libDir } },
      optionalDependencies: {},
    } as unknown as PnpmDependency

    const collector = new StubbedPnpmNodeModulesCollector(appDir, new TmpDir("eb-pnpm-store-test"), tree)
    const { nodeModules, logSummary } = await collector.getNodeModules({ packageName: "TestApp" })

    const names = flattenNames(nodeModules)
    expect(names).toContain("linked-lib")
    expect(names).toContain("outer")
    // `inner` was the one silently dropped: reachable only from `outer`'s real directory.
    expect(names).toContain("inner")
    // A workspace package's real directory is not inside any `node_modules/<name>`, so it cannot
    // locate itself by name; its dependencies must still be discovered by reading its package.json
    // at that directory, or the whole sub-closure disappears.
    expect(names).toContain("sibling-lib")
    expect(names).toContain("sib-dep")

    // ...and it must be copied from the store, not from some same-named package elsewhere.
    expect(findNode(nodeModules, "inner").dir).toBe(await fse.realpath(path.join(storeNm, "inner")))

    expect(logSummary[LogMessageByKey.PKG_NOT_ON_DISK] ?? []).toEqual([])
    expect(logSummary[LogMessageByKey.PKG_NOT_FOUND] ?? []).toEqual([])
  })
})
