import { describe, test } from "vitest"
import * as fse from "fs-extra"
import * as os from "os"
import * as path from "path"
import { spawn } from "builder-util"
import { PnpmNodeModulesCollector } from "app-builder-lib/internal"
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

describe("PnpmNodeModulesCollector link: dependency bundling", () => {
  let root = ""

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

  test("bundles a link: package and its transitive deps, resolved to the real source dir", async ({ expect, tmpDir }) => {
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
  }, 120000)
})
