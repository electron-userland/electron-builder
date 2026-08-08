import { afterEach, describe, test, vi } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { collectNodeModulesWithLogging, PM } from "app-builder-lib/internal"
import { enforceFailOnMissingDependencies } from "app-builder-lib/src/util/appFileCopier"
import { LogMessageByKey, ModuleManager } from "app-builder-lib/src/node-module-collector/moduleManager"
import { NpmNodeModulesCollector } from "app-builder-lib/src/node-module-collector/npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "app-builder-lib/src/node-module-collector/pnpmNodeModulesCollector"
import type { NpmDependency, PnpmDependency } from "app-builder-lib/src/node-module-collector/types"
import { log, TmpDir } from "builder-util"

// Coverage for the opt-in `failOnMissingDependencies` configuration (issue #10058):
//   - `true` fails the build after collection completes, listing the COMPLETE set of missing
//     production dependencies (PKG_NOT_FOUND + PKG_NOT_ON_DISK) at once;
//   - `string[]` enables enforcement while exempting the listed dependency names (the ignore list
//     the issue asked for), matched against the package name of the `name@version` summary entries;
//   - `false`/omitted keeps today's warn-only behaviour;
//   - missing *optional* dependencies (PKG_OPTIONAL_NOT_INSTALLED and
//     PKG_OPTIONAL_PLATFORM_NOT_INSTALLED) never fail the build — including the pnpm collector's
//     declared-optional misses (fsevents on Linux/Windows), which are now classified as optional.

const projectTmpDir = new TmpDir("eb-fail-on-missing-deps-test")

const summaryOf = (entries: Partial<Record<LogMessageByKey, string[]>>) => entries as ModuleManager["logSummary"]

async function buildPackageTree(packages: Record<string, object>): Promise<string> {
  const root = await projectTmpDir.createTempDir()
  for (const [rel, json] of Object.entries(packages)) {
    const abs = path.join(root, rel)
    await fse.ensureDir(path.dirname(abs))
    await fse.writeJson(abs, json)
  }
  return root
}

describe("failOnMissingDependencies (enforcement semantics)", () => {
  const missingSummary = () =>
    summaryOf({
      [LogMessageByKey.PKG_NOT_FOUND]: ["never-found@2.0.0"],
      [LogMessageByKey.PKG_NOT_ON_DISK]: ["gone-from-disk@1.0.0", "@scope/native@3.1.0"],
    })

  test("off by default: undefined, null and false never throw", ({ expect }) => {
    expect(() => enforceFailOnMissingDependencies(undefined, missingSummary())).not.toThrow()
    expect(() => enforceFailOnMissingDependencies(null, missingSummary())).not.toThrow()
    expect(() => enforceFailOnMissingDependencies(false, missingSummary())).not.toThrow()
  })

  test("true fails with the complete list across PKG_NOT_FOUND and PKG_NOT_ON_DISK", ({ expect }) => {
    let error: Error | undefined
    try {
      enforceFailOnMissingDependencies(true, missingSummary())
    } catch (e: any) {
      error = e
    }
    expect(error).toBeDefined()
    expect((error as NodeJS.ErrnoException).code).toBe("ERR_ELECTRON_BUILDER_INVALID_CONFIGURATION")
    // Every missing dependency is reported at once, not just the first one encountered.
    expect(error!.message).toContain("never-found@2.0.0")
    expect(error!.message).toContain("gone-from-disk@1.0.0")
    expect(error!.message).toContain("@scope/native@3.1.0")
  })

  test("true with a clean summary (or optional-only misses) does not throw", ({ expect }) => {
    expect(() => enforceFailOnMissingDependencies(true, summaryOf({}))).not.toThrow()
    expect(() => enforceFailOnMissingDependencies(true, undefined)).not.toThrow()
    expect(() =>
      enforceFailOnMissingDependencies(
        true,
        summaryOf({
          [LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED]: ["fsevents@2.3.3"],
          [LogMessageByKey.PKG_OPTIONAL_PLATFORM_NOT_INSTALLED]: ["sass-embedded-linux-x64@1.79.0"],
        })
      )
    ).not.toThrow()
  })

  test("an empty ignore list enables enforcement without exempting anything", ({ expect }) => {
    expect(() => enforceFailOnMissingDependencies([], missingSummary())).toThrow(/never-found@2\.0\.0/)
  })

  test("ignore list exempts by package name, including scoped names", ({ expect }) => {
    // Fully covered -> passes.
    expect(() => enforceFailOnMissingDependencies(["never-found", "gone-from-disk", "@scope/native"], missingSummary())).not.toThrow()

    // Partially covered -> fails listing ONLY the non-exempted dependencies.
    let error: Error | undefined
    try {
      enforceFailOnMissingDependencies(["gone-from-disk", "@scope/native"], missingSummary())
    } catch (e: any) {
      error = e
    }
    expect(error).toBeDefined()
    expect(error!.message).toContain("never-found@2.0.0")
    expect(error!.message).not.toContain("gone-from-disk")
    expect(error!.message).not.toContain("@scope/native")
  })

  test("ignore list also accepts an exact name@version entry", ({ expect }) => {
    expect(() => enforceFailOnMissingDependencies(["never-found@2.0.0", "gone-from-disk@1.0.0", "@scope/native@3.1.0"], missingSummary())).not.toThrow()
  })

  test("does not treat a name-alike as covered (dedupes duplicate summary entries)", ({ expect }) => {
    const summary = summaryOf({
      [LogMessageByKey.PKG_NOT_ON_DISK]: ["left-pad@1.0.0", "left-pad@1.0.0", "left-pad-extra@1.0.0"],
    })
    let error: Error | undefined
    try {
      enforceFailOnMissingDependencies(["left-pad"], summary)
    } catch (e: any) {
      error = e
    }
    expect(error).toBeDefined()
    // `left-pad` is exempted; `left-pad-extra` is a different package and stays fatal (listed once).
    expect(error!.message).toContain("left-pad-extra@1.0.0")
    expect(error!.message.match(/left-pad-extra@1\.0\.0/g)).toHaveLength(1)
    expect(error!.message).not.toMatch(/left-pad@1\.0\.0/)
  })
})

// The real collectors report missing dependencies as `name@version` summary entries. Feed the
// enforcement the summary produced by an actual collector run (stubbed `npm list` tree) to pin the
// two ends of the contract together.
describe("failOnMissingDependencies (npm collector summary integration)", { sequential: true }, () => {
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

  async function collectWithMissingDeps() {
    root = await buildPackageTree({
      "node_modules/keep-me/package.json": { name: "keep-me", version: "1.0.0" },
    })
    const tree: NpmDependency = {
      name: "my-app",
      version: "1.0.0",
      path: root,
      _dependencies: { "keep-me": "^1.0.0", "gone-from-disk": "^1.0.0", "never-found": "^2.0.0" },
      dependencies: {
        "keep-me": { name: "keep-me", version: "1.0.0", path: path.join(root, "node_modules", "keep-me"), _dependencies: {} },
        // Path reported by `npm list` but the directory does not exist -> PKG_NOT_ON_DISK.
        "gone-from-disk": { name: "gone-from-disk", version: "1.0.0", path: path.join(root, "node_modules", "gone-from-disk"), _dependencies: {} },
        // No path resolvable at all -> PKG_NOT_FOUND.
        "never-found": { name: "never-found", version: "2.0.0", path: undefined as unknown as string, _dependencies: {} },
      },
    }
    const collector = new StubbedNpmNodeModulesCollector(root, projectTmpDir as unknown as TmpDir, tree)
    return collector.getNodeModules({ packageName: "my-app" })
  }

  test("missing production deps land in PKG_NOT_ON_DISK / PKG_NOT_FOUND and fail enforcement with the full list", async ({ expect }) => {
    const { nodeModules, logSummary } = await collectWithMissingDeps()
    expect(nodeModules.map(m => m.name)).toContain("keep-me")
    expect(logSummary[LogMessageByKey.PKG_NOT_ON_DISK] ?? []).toEqual(["gone-from-disk@1.0.0"])
    expect(logSummary[LogMessageByKey.PKG_NOT_FOUND] ?? []).toEqual(["never-found@2.0.0"])

    let error: Error | undefined
    try {
      enforceFailOnMissingDependencies(true, logSummary)
    } catch (e: any) {
      error = e
    }
    expect(error).toBeDefined()
    expect(error!.message).toContain("gone-from-disk@1.0.0")
    expect(error!.message).toContain("never-found@2.0.0")
  })

  test("warn-only without the flag; ignore list covering all missing deps passes", async ({ expect }) => {
    const { logSummary } = await collectWithMissingDeps()
    // Flag off -> today's behaviour: the summary carries warnings, nothing throws.
    expect(() => enforceFailOnMissingDependencies(undefined, logSummary)).not.toThrow()
    // Ignore list (the issue's `"ignoreMissingDependency": ["x"]` shape) -> exempted, passes.
    expect(() => enforceFailOnMissingDependencies(["gone-from-disk", "never-found"], logSummary)).not.toThrow()
  })
})

// The pnpm collector knows a dependency is declared in `optionalDependencies` when its existence
// check fails; the miss must be classified as optional (fsevents on Linux/Windows being the
// canonical case) and must therefore never trip `failOnMissingDependencies`.
describe("failOnMissingDependencies (pnpm declared-optional classification)", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
      root = ""
    }
  })

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

  test("declared-optional misses land in the optional buckets and never trip the flag", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { "keep-me": "^1.0.0" },
        optionalDependencies: { fsevents: "^2.3.0", "sass-embedded-linux-x64": "^1.79.0" },
      },
      "node_modules/keep-me/package.json": { name: "keep-me", version: "1.0.0" },
      // fsevents and sass-embedded-linux-x64 are intentionally NOT installed.
    })

    const dep = (name: string, version: string): PnpmDependency =>
      ({ from: name, name, version, path: path.join(root, "node_modules", name), dependencies: {}, optionalDependencies: {} }) as unknown as PnpmDependency
    const tree: PnpmDependency = {
      name: "my-app",
      from: "my-app",
      version: "1.0.0",
      path: root,
      dependencies: { "keep-me": dep("keep-me", "1.0.0") },
      optionalDependencies: {
        fsevents: dep("fsevents", "2.3.3"),
        "sass-embedded-linux-x64": dep("sass-embedded-linux-x64", "1.79.0"),
      },
    } as unknown as PnpmDependency

    const collector = new StubbedPnpmNodeModulesCollector(root, projectTmpDir as unknown as TmpDir, tree)
    const { nodeModules, logSummary } = await collector.getNodeModules({ packageName: "my-app" })

    expect(nodeModules.map(m => m.name)).toContain("keep-me")
    // Declared-optional miss -> optional bucket (previously mis-filed under PKG_NOT_ON_DISK)...
    expect(logSummary[LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED] ?? []).toEqual(["fsevents@2.3.3"])
    // ...while a platform-suffixed name keeps its dedicated platform-optional bucket.
    expect(logSummary[LogMessageByKey.PKG_OPTIONAL_PLATFORM_NOT_INSTALLED] ?? []).toEqual(["sass-embedded-linux-x64@1.79.0"])
    expect(logSummary[LogMessageByKey.PKG_NOT_ON_DISK] ?? []).toEqual([])
    expect(logSummary[LogMessageByKey.PKG_NOT_FOUND] ?? []).toEqual([])

    // Neither optional bucket trips the strictest form of the flag.
    expect(() => enforceFailOnMissingDependencies(true, logSummary)).not.toThrow()
  })
})

// Wiring through the app-side collection entry point: `collectNodeModulesWithLogging` reads the
// option from the effective configuration and enforces it after the summary is flushed to the log.
describe("failOnMissingDependencies (collectNodeModulesWithLogging wiring)", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
      root = ""
    }
  })

  async function collect(rootDir: string, dependencies: Record<string, string>, failOnMissingDependencies?: boolean | Array<string>) {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => log as any)
    const info = vi.spyOn(log, "info").mockImplementation(() => log as any)
    try {
      const platformPackager = {
        tempDirManager: projectTmpDir,
        appDir: rootDir,
        projectDir: rootDir,
        nodePackageName: "my-app",
        platform: { nodeName: "darwin" },
        originalMetadata: { dependencies },
        config: { failOnMissingDependencies },
        getWorkspaceRoot: async () => null,
        getPackageManager: async () => PM.TRAVERSAL,
      } as unknown as Parameters<typeof collectNodeModulesWithLogging>[0]
      return await collectNodeModulesWithLogging(platformPackager, null)
    } finally {
      warn.mockRestore()
      info.mockRestore()
    }
  }

  test("flag enabled with a complete dependency tree still succeeds", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": { name: "my-app", version: "1.0.0", dependencies: { "keep-me": "^1.0.0" } },
      "node_modules/keep-me/package.json": { name: "keep-me", version: "1.0.0" },
    })
    const nodeModules = await collect(root, { "keep-me": "^1.0.0" }, true)
    expect(nodeModules.map(m => m.name)).toContain("keep-me")
  })

  test("a missing optional dependency does not fail the build even with the flag enabled", async ({ expect }) => {
    root = await buildPackageTree({
      "package.json": {
        name: "my-app",
        version: "1.0.0",
        dependencies: { "keep-me": "^1.0.0" },
        optionalDependencies: { fsevents: "^2.3.0" },
      },
      "node_modules/keep-me/package.json": { name: "keep-me", version: "1.0.0" },
      // fsevents intentionally not installed -> PKG_OPTIONAL_NOT_INSTALLED, which never trips the flag.
    })
    const nodeModules = await collect(root, { "keep-me": "^1.0.0" }, true)
    expect(nodeModules.map(m => m.name)).toContain("keep-me")
    expect(nodeModules.map(m => m.name)).not.toContain("fsevents")
  })
})
