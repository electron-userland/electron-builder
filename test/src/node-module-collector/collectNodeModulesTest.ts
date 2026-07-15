import { describe, test } from "vitest"
import { collectionMatchesAppDependencies, resolveFirstMatchingCollection } from "app-builder-lib/src/util/appFileCopier"
import { PM } from "app-builder-lib/src/node-module-collector/packageManager"
import type { NodeModuleInfo } from "app-builder-lib/src/node-module-collector/types"
import type { ModuleManager } from "app-builder-lib/src/node-module-collector/moduleManager"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeModule = (name: string): NodeModuleInfo => ({ name, version: "1.0.0", dir: `/virtual/${name}` })

const collection = (names: string[]) => ({
  nodeModules: names.map(makeModule),
  logSummary: {} as ModuleManager["logSummary"],
})

// The dependency tree npm reports when it resolves to the wrong project root from inside a Yarn
// workspace sub-package: npm's own bundled internals rather than the app's production deps.
const NPM_INTERNALS = ["cacache", "node-gyp", "@npmcli/fs", "minipass", "minipass-fetch"]

// ---------------------------------------------------------------------------
// collectionMatchesAppDependencies
// ---------------------------------------------------------------------------

describe("collectionMatchesAppDependencies", () => {
  test("matches when a declared production dependency is present at the top level", ({ expect }) => {
    const deps = { minimist: "^1.2.8", "fs-extra": "^11.0.0" }
    expect(collectionMatchesAppDependencies([makeModule("minimist"), makeModule("transitive-dep")], deps)).toBe(true)
  })

  test("matches when every declared dependency is present", ({ expect }) => {
    const deps = { minimist: "^1.2.8", "fs-extra": "^11.0.0" }
    expect(collectionMatchesAppDependencies([makeModule("minimist"), makeModule("fs-extra")], deps)).toBe(true)
  })

  test("does not match when none of the declared dependencies are present (issue #9945)", ({ expect }) => {
    // The app depends on `minimist` (and others) but the collected tree is npm's own internals.
    const deps = { minimist: "^1.2.8", "fs-extra": "^11.0.0", chalk: "^5.0.0" }
    expect(collectionMatchesAppDependencies(NPM_INTERNALS.map(makeModule), deps)).toBe(false)
  })

  test("accepts any non-empty collection when the package declares no production dependencies", ({ expect }) => {
    expect(collectionMatchesAppDependencies([makeModule("anything")], undefined)).toBe(true)
    expect(collectionMatchesAppDependencies([makeModule("anything")], {})).toBe(true)
  })

  test("counts a collected module flagged `excluded` (ignoredProductionDependencies) as accounting for its declared dependency", ({ expect }) => {
    // Ignored dependencies stay in the collected tree as validation markers (flagged for the file
    // copier). A correct collection whose only declared external dep is ignored must still match —
    // otherwise a wrong-root fallback tree could win (see issue #9945).
    const excludedElectron: NodeModuleInfo = { ...makeModule("electron"), excluded: true }
    expect(collectionMatchesAppDependencies([excludedElectron], { electron: "^30.0.0" })).toBe(true)
  })

  describe("local-protocol dependency specs", () => {
    for (const spec of ["workspace:*", "workspace:^1.0.0", "file:../shared", "link:../shared", "portal:../shared"]) {
      test(`ignores ${spec} specs (cannot be used to validate a hoisted collection)`, ({ expect }) => {
        // `@org/shared` is symlinked, not hoisted, so its absence must not reject the collection;
        // the real external dep `minimist` is what makes this a match.
        const deps = { "@org/shared": spec, minimist: "^1.2.8" }
        expect(collectionMatchesAppDependencies([makeModule("minimist")], deps)).toBe(true)
      })
    }

    test("accepts collection when only local-protocol dependencies are declared", ({ expect }) => {
      // Nothing external to validate against -> any non-empty collection is acceptable.
      const deps = { "@org/shared": "workspace:*", "@org/utils": "file:../utils" }
      expect(collectionMatchesAppDependencies([makeModule("@org/shared")], deps)).toBe(true)
    })

    test("does not match when the only external dep is missing among local-protocol deps", ({ expect }) => {
      const deps = { "@org/shared": "workspace:*", minimist: "^1.2.8" }
      expect(collectionMatchesAppDependencies(NPM_INTERNALS.map(makeModule), deps)).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// resolveFirstMatchingCollection
// ---------------------------------------------------------------------------

describe("resolveFirstMatchingCollection", () => {
  const appDeps = { minimist: "^1.2.8", "fs-extra": "^11.0.0" }

  test("returns the first matching collection from the active package manager", async ({ expect }) => {
    const calls: Array<{ pm: PM; dir: string }> = []
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.YARN_BERRY, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: appDeps,
      run: (pm, dir) => {
        calls.push({ pm, dir })
        return Promise.resolve(collection(["minimist", "fs-extra"]))
      },
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(["minimist", "fs-extra"])
    // TRAVERSAL must not run once the active package manager already produced a matching result.
    expect(calls).toEqual([{ pm: PM.YARN_BERRY, dir: "/app" }])
  })

  test("falls through to TRAVERSAL when the active manager returns a mismatched tree (issue #9945)", async ({ expect }) => {
    const calls: Array<{ pm: PM; dir: string }> = []
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.YARN_BERRY, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: appDeps,
      run: (pm, dir) => {
        calls.push({ pm, dir })
        // Yarn Berry delegates to npm, which resolves to the workspace root and returns npm
        // internals; only the manual traversal resolves the sub-package's real dependencies.
        return Promise.resolve(pm === PM.TRAVERSAL ? collection(["minimist", "fs-extra"]) : collection(NPM_INTERNALS))
      },
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(["minimist", "fs-extra"])
    expect(calls).toEqual([
      { pm: PM.YARN_BERRY, dir: "/app" },
      { pm: PM.TRAVERSAL, dir: "/app" },
    ])
  })

  test("skips empty collections and advances to the next search directory", async ({ expect }) => {
    const calls: Array<{ pm: PM; dir: string }> = []
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.NPM, PM.TRAVERSAL],
      searchDirectories: ["/app", "/workspace-root"],
      dependencies: appDeps,
      run: (pm, dir) => {
        calls.push({ pm, dir })
        return Promise.resolve(dir === "/workspace-root" ? collection(["minimist"]) : collection([]))
      },
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(["minimist"])
    expect(calls).toEqual([
      { pm: PM.NPM, dir: "/app" },
      { pm: PM.NPM, dir: "/workspace-root" },
    ])
  })

  test("retains a mismatched collection as a last resort when nothing matches", async ({ expect }) => {
    // If even TRAVERSAL cannot produce a matching tree we must not regress to an empty asar;
    // the first non-empty (mismatched) collection is returned rather than undefined.
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.YARN_BERRY, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: appDeps,
      run: () => Promise.resolve(collection(NPM_INTERNALS)),
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(NPM_INTERNALS)
  })

  test("returns undefined when every approach yields an empty collection", async ({ expect }) => {
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.NPM, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: appDeps,
      run: () => Promise.resolve(collection([])),
    })
    expect(result).toBeUndefined()
  })

  test("prefers a matching collection over an earlier mismatched fallback across directories", async ({ expect }) => {
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.YARN_BERRY, PM.TRAVERSAL],
      searchDirectories: ["/app", "/workspace-root"],
      dependencies: appDeps,
      run: pm => Promise.resolve(pm === PM.TRAVERSAL ? collection(["minimist", "fs-extra"]) : collection(NPM_INTERNALS)),
    })
    // The mismatched YARN_BERRY result (tried first across both dirs) must not win.
    expect(result?.nodeModules.map(m => m.name)).toEqual(["minimist", "fs-extra"])
  })
})
