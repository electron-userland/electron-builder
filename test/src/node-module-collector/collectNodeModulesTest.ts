import { afterEach, describe, test, vi } from "vitest"
import { log } from "builder-util"
import { TmpDir } from "temp-file"
import * as fse from "fs-extra"
import * as path from "path"
import { collectionMatchesAppDependencies, collectNodeModulesWithLogging, resolveFirstMatchingCollection } from "app-builder-lib/src/util/appFileCopier"
import { PM } from "app-builder-lib/src/node-module-collector/packageManager"
import type { NodeModuleInfo } from "app-builder-lib/src/node-module-collector/types"
import { LogMessageByKey, type ModuleManager } from "app-builder-lib/src/node-module-collector/moduleManager"
import type { PlatformPackager } from "app-builder-lib"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeModule = (name: string): NodeModuleInfo => ({ name, version: "1.0.0", dir: `/virtual/${name}` })

const collection = (names: string[], logSummary: Partial<Record<LogMessageByKey, string[]>> = {}) => ({
  nodeModules: names.map(makeModule),
  logSummary: logSummary as ModuleManager["logSummary"],
})

const summary = (entries: Partial<Record<LogMessageByKey, string[]>>) => entries as ModuleManager["logSummary"]

// The dependency tree npm reports when it resolves to the wrong project root from inside a Yarn
// workspace sub-package: npm's own bundled internals rather than the app's production deps.
const NPM_INTERNALS = ["cacache", "node-gyp", "@npmcli/fs", "minipass", "minipass-fetch"]

// ---------------------------------------------------------------------------
// collectionMatchesAppDependencies
// ---------------------------------------------------------------------------

describe("collectionMatchesAppDependencies", () => {
  test("does not match when only some of the declared dependencies are present", ({ expect }) => {
    const deps = { minimist: "^1.2.8", "fs-extra": "^11.0.0" }
    expect(collectionMatchesAppDependencies([makeModule("minimist"), makeModule("transitive-dep")], deps)).toBe(false)
  })

  test("does not match the tree of a same-named dependency that shares one declared dependency (issue #10277)", ({ expect }) => {
    // App `debug` depends on `debug@4`, `lodash` and `ms`; the pnpm collector resolved the root to
    // the `debug@4` dependency and returned only its own dependency, `ms`.
    const deps = { debug: "4.4.1", lodash: "^4.17.21", ms: "^2.1.3" }
    expect(collectionMatchesAppDependencies([makeModule("ms")], deps, summary({}))).toBe(false)
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

  describe("declared dependencies the collector reports as legitimately absent", () => {
    const deps = { minimist: "^1.2.8", "fs-extra": "^11.0.0" }

    test("matches when an ignored dependency is reported as excluded instead of being kept in the tree", ({ expect }) => {
      const appDeps = { ...deps, electron: "^30.0.0" }
      const modules = [makeModule("minimist"), makeModule("fs-extra")]
      expect(collectionMatchesAppDependencies(modules, appDeps, summary({ [LogMessageByKey.PKG_EXCLUDED_IGNORED]: ["electron@30.0.0"] }))).toBe(true)
      expect(collectionMatchesAppDependencies(modules, appDeps, summary({}))).toBe(false)
    })

    test("matches when an ignored dependency is kept in the tree flagged `excluded`", ({ expect }) => {
      const modules = [makeModule("minimist"), makeModule("fs-extra"), { ...makeModule("electron"), excluded: true }]
      expect(collectionMatchesAppDependencies(modules, { ...deps, electron: "^30.0.0" }, summary({}))).toBe(true)
    })

    test("matches when a dependency was dropped by the arch/platform filter", ({ expect }) => {
      const appDeps = { ...deps, "@esbuild/darwin-arm64": "0.25.0" }
      const modules = [makeModule("minimist"), makeModule("fs-extra")]
      expect(collectionMatchesAppDependencies(modules, appDeps, summary({ [LogMessageByKey.PKG_INCOMPATIBLE_PLATFORM]: ["@esbuild/darwin-arm64@0.25.0"] }))).toBe(true)
      expect(collectionMatchesAppDependencies(modules, appDeps, summary({}))).toBe(false)
    })

    for (const key of [LogMessageByKey.PKG_NOT_FOUND, LogMessageByKey.PKG_NOT_ON_DISK]) {
      test(`matches when a missing dependency is reported (${key}) — allowMissingDependencies is enforced afterwards`, ({ expect }) => {
        expect(collectionMatchesAppDependencies([makeModule("minimist")], deps, summary({ [key]: ["fs-extra@11.2.0"] }))).toBe(true)
      })
    }

    for (const key of [LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED, LogMessageByKey.PKG_OPTIONAL_PLATFORM_NOT_INSTALLED, LogMessageByKey.PKG_SELF_REF]) {
      test(`matches when an absent dependency is reported as ${key}`, ({ expect }) => {
        expect(collectionMatchesAppDependencies([makeModule("minimist")], deps, summary({ [key]: ["fs-extra"] }))).toBe(true)
      })
    }

    test("parses scoped `name@version` summary entries", ({ expect }) => {
      const appDeps = { minimist: "^1.2.8", "@org/native": "^2.0.0" }
      expect(collectionMatchesAppDependencies([makeModule("minimist")], appDeps, summary({ [LogMessageByKey.PKG_NOT_ON_DISK]: ["@org/native@2.1.0"] }))).toBe(true)
    })

    test("does not count unrelated summary buckets as accounting for a missing dependency", ({ expect }) => {
      const logSummary = summary({ [LogMessageByKey.PKG_DUPLICATE_REF]: ["fs-extra@11.2.0"], [LogMessageByKey.PKG_VERSION_OVERRIDDEN]: ["fs-extra@11.2.0 (declared ^11.0.0)"] })
      expect(collectionMatchesAppDependencies([makeModule("minimist")], deps, logSummary)).toBe(false)
    })

    test("still requires at least one declared dependency to be present", ({ expect }) => {
      // A tree that contains none of the app's dependencies is a different package's tree, even if
      // its summary happens to mention every declared name.
      const logSummary = summary({ [LogMessageByKey.PKG_NOT_FOUND]: ["minimist@1.2.8", "fs-extra@11.2.0"] })
      expect(collectionMatchesAppDependencies(NPM_INTERNALS.map(makeModule), deps, logSummary)).toBe(false)
    })
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

  test("falls through to TRAVERSAL when the active manager's tree has only some of the app's dependencies (issue #10277)", async ({ expect }) => {
    const calls: Array<{ pm: PM; dir: string }> = []
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.PNPM, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: { debug: "4.4.1", lodash: "^4.17.21", ms: "^2.1.3" },
      run: (pm, dir) => {
        calls.push({ pm, dir })
        return Promise.resolve(pm === PM.TRAVERSAL ? collection(["debug", "lodash", "ms"]) : collection(["ms"]))
      },
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(["debug", "lodash", "ms"])
    expect(calls).toEqual([
      { pm: PM.PNPM, dir: "/app" },
      { pm: PM.TRAVERSAL, dir: "/app" },
    ])
  })

  test("rejects a workspace-root tree that contains only some of a sub-package's dependencies", async ({ expect }) => {
    // The root tree shares `minimist` with the sub-package but lacks its `fs-extra`; it must not win
    // over the traversal of the sub-package itself.
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.YARN_BERRY, PM.TRAVERSAL],
      searchDirectories: ["/app", "/workspace-root"],
      dependencies: appDeps,
      run: (pm, dir) => {
        if (pm === PM.TRAVERSAL) {
          return Promise.resolve(dir === "/app" ? collection(["fs-extra", "minimist"]) : collection([]))
        }
        return Promise.resolve(collection([...NPM_INTERNALS, "minimist"]))
      },
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(["fs-extra", "minimist"])
  })

  test("accepts the active manager's tree when absent dependencies are accounted for in its log summary", async ({ expect }) => {
    const calls: PM[] = []
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.PNPM, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: { ...appDeps, electron: "^30.0.0", "@esbuild/darwin-arm64": "0.25.0", "left-pad": "^1.3.0" },
      run: pm => {
        calls.push(pm)
        return Promise.resolve(
          collection(["minimist", "fs-extra"], {
            [LogMessageByKey.PKG_EXCLUDED_IGNORED]: ["electron@30.0.0"],
            [LogMessageByKey.PKG_INCOMPATIBLE_PLATFORM]: ["@esbuild/darwin-arm64@0.25.0"],
            [LogMessageByKey.PKG_NOT_ON_DISK]: ["left-pad@1.3.0"],
          })
        )
      },
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(["minimist", "fs-extra"])
    expect(calls).toEqual([PM.PNPM])
  })

  test("skips empty collections and advances to the next search directory", async ({ expect }) => {
    const calls: Array<{ pm: PM; dir: string }> = []
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.NPM, PM.TRAVERSAL],
      searchDirectories: ["/app", "/workspace-root"],
      dependencies: appDeps,
      run: (pm, dir) => {
        calls.push({ pm, dir })
        return Promise.resolve(dir === "/workspace-root" ? collection(["minimist", "fs-extra"]) : collection([]))
      },
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(["minimist", "fs-extra"])
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

  test("falls through to the next approach with a warning when a collector throws (issue #10208)", async ({ expect }) => {
    // npm exiting 1 with an empty stdout used to abort the build before TRAVERSAL ever ran.
    const warnSpy = vi.spyOn(log, "warn")
    const calls: Array<{ pm: PM; dir: string }> = []
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.NPM, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: appDeps,
      run: (pm, dir) => {
        calls.push({ pm, dir })
        return pm === PM.NPM ? Promise.reject(new Error("`npm list` exited with code 1 and produced no output on stdout")) : Promise.resolve(collection(["minimist", "fs-extra"]))
      },
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(["minimist", "fs-extra"])
    expect(calls).toEqual([
      { pm: PM.NPM, dir: "/app" },
      { pm: PM.TRAVERSAL, dir: "/app" },
    ])
    expect(warnSpy).toHaveBeenCalledWith(
      { pm: PM.NPM, searchDir: "/app", error: "`npm list` exited with code 1 and produced no output on stdout" },
      "node module collection failed, trying next search directory/approach"
    )
    warnSpy.mockRestore()
  })

  test("rethrows the first error when every approach throws", async ({ expect }) => {
    const warnSpy = vi.spyOn(log, "warn")
    const promise = resolveFirstMatchingCollection({
      pmApproaches: [PM.NPM, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: appDeps,
      run: pm => Promise.reject(new Error(`${pm} failed`)),
    })
    await expect(promise).rejects.toThrow("npm failed")
    expect(warnSpy).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })

  test("rethrows the collector error instead of silently reporting no node modules when the remaining approaches are empty", async ({ expect }) => {
    const warnSpy = vi.spyOn(log, "warn")
    const promise = resolveFirstMatchingCollection({
      pmApproaches: [PM.NPM, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: appDeps,
      run: pm => (pm === PM.NPM ? Promise.reject(new Error("npm failed")) : Promise.resolve(collection([]))),
    })
    await expect(promise).rejects.toThrow("npm failed")
    warnSpy.mockRestore()
  })

  test("still returns a mismatched fallback collection when an earlier approach threw", async ({ expect }) => {
    const warnSpy = vi.spyOn(log, "warn")
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.NPM, PM.TRAVERSAL],
      searchDirectories: ["/app"],
      dependencies: appDeps,
      run: pm => (pm === PM.NPM ? Promise.reject(new Error("npm failed")) : Promise.resolve(collection(NPM_INTERNALS))),
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(NPM_INTERNALS)
    warnSpy.mockRestore()
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

  test("a zero-dependency app skips its empty node_modules and vacuously accepts a workspace-root tree (issue #10033)", async ({ expect }) => {
    // Documents the interaction the zero-dependency guard in collectNodeModulesWithLogging exists
    // for: the app's own empty collection is skipped, the search climbs to the workspace root, and
    // the vacuous match accepts the entire hoisted workspace tree.
    const result = await resolveFirstMatchingCollection({
      pmApproaches: [PM.YARN_BERRY, PM.TRAVERSAL],
      searchDirectories: ["/app", "/workspace-root"],
      dependencies: {},
      run: (_pm, dir) => Promise.resolve(dir === "/workspace-root" ? collection(NPM_INTERNALS) : collection([])),
    })
    expect(result?.nodeModules.map(m => m.name)).toEqual(NPM_INTERNALS)
  })
})

// ---------------------------------------------------------------------------
// collectNodeModulesWithLogging — zero-dependency guard (issue #10033)
// ---------------------------------------------------------------------------

describe("collectNodeModulesWithLogging", () => {
  const ZERO_DEPS_MESSAGE = "app has no production dependencies, skipping node_modules bundling"
  const projectTmpDir = new TmpDir("eb-collect-nm-test")

  const makePackager = (options: { appDir: string; originalDependencies?: Record<string, string>; metadataDependencies?: Record<string, string> }) =>
    ({
      tempDirManager: { getTempFile: vi.fn(), getTempDir: vi.fn() },
      appDir: options.appDir,
      projectDir: options.appDir,
      getWorkspaceRoot: () => Promise.resolve(""),
      getPackageManager: () => Promise.resolve(PM.TRAVERSAL),
      config: {},
      originalMetadata: { dependencies: options.originalDependencies },
      metadata: { dependencies: options.metadataDependencies },
      nodePackageName: "test-app",
    }) as unknown as PlatformPackager<any>

  afterEach(async () => {
    vi.restoreAllMocks()
    await projectTmpDir.cleanup()
  })

  test("returns no modules without searching when the app declares no production dependencies", async ({ expect }) => {
    const infoSpy = vi.spyOn(log, "info")
    // Non-existent appDir: reaching any collector would throw, proving the guard short-circuits.
    const result = await collectNodeModulesWithLogging(makePackager({ appDir: "/virtual/does-not-exist" }), null)
    expect(result).toEqual([])
    expect(infoSpy).toHaveBeenCalledWith(null, ZERO_DEPS_MESSAGE)
  })

  test("searches for node modules when dependencies are declared only via extraMetadata", async ({ expect }) => {
    const appDir = await projectTmpDir.createTempDir()
    await fse.writeJson(path.join(appDir, "package.json"), { name: "test-app", version: "1.0.0" })
    const infoSpy = vi.spyOn(log, "info")
    // `metadata` reflects extraMetadata overrides; `originalMetadata` is the on-disk package.json.
    const result = await collectNodeModulesWithLogging(makePackager({ appDir, metadataDependencies: { minimist: "^1.2.8" } }), null)
    // Nothing is installed, so nothing is collected — but the search must have run.
    expect(result).toEqual([])
    expect(infoSpy.mock.calls.some(call => call[1] === ZERO_DEPS_MESSAGE)).toBe(false)
    expect(infoSpy.mock.calls.some(call => call[1] === "searching for node modules")).toBe(true)
  })

  test("searches for node modules when only originalMetadata declares dependencies", async ({ expect }) => {
    // e.g. extraMetadata cleared `dependencies` — the as-declared originalMetadata still counts.
    const appDir = await projectTmpDir.createTempDir()
    await fse.writeJson(path.join(appDir, "package.json"), { name: "test-app", version: "1.0.0" })
    const infoSpy = vi.spyOn(log, "info")
    const result = await collectNodeModulesWithLogging(makePackager({ appDir, originalDependencies: { minimist: "^1.2.8" } }), null)
    expect(result).toEqual([])
    expect(infoSpy.mock.calls.some(call => call[1] === ZERO_DEPS_MESSAGE)).toBe(false)
    expect(infoSpy.mock.calls.some(call => call[1] === "searching for node modules")).toBe(true)
  })
})
