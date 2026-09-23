import * as fs from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { LogMessageByKey, type Package } from "./moduleManager"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { getPackageManagerCommand, PM } from "./packageManager"
import { PnpmDependency } from "./types"
import { isValidKey } from "builder-util"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  public readonly installOptions = {
    manager: PM.PNPM,
    lockfile: "pnpm-lock.yaml",
  }

  // Raw backing field — all entries from `pnpm list --json`
  private _allWorkspacePackages: PnpmDependency[] = []
  // Cached after parseDependenciesTree resolves the Lazy; 0 = safe default (treated as < v11)
  private _pnpmMajorVersion = 0
  // Runs `pnpm --version` once and caches the major version number
  private readonly pnpmVersion = new Lazy<number>(async () => {
    const result = await this.asyncExec(getPackageManagerCommand(PM.PNPM), ["--version"])
    const major = parseInt((result.stdout ?? "0").split(".")[0], 10)
    return isNaN(major) ? 0 : major
  })

  /**
   * Detect pnpm's installed layout from the on-disk structure rather than `pnpm config list`.
   * pnpm 11 no longer echoes `node-linker` (from `.npmrc`) in `config list`, so the base-class
   * config-parsing detection silently reports "not hoisted" for a hoisted install, which would
   * disable the downward search needed to find version-conflicted nested deps.
   *
   * In the default isolated store every regular top-level package resolves — through a symlink
   * on POSIX, a junction on Windows — into `node_modules/.pnpm/<name>@<ver>/node_modules/<name>`.
   * In a hoisted layout the same package is a real directory directly under `node_modules`.
   * `realpath` transparently follows both symlinks and junctions, so a layout is isolated iff
   * *any* top-level package's real path routes through `.pnpm`. We scan rather than sample the
   * first entry because `link:` packages resolve to their source (never under `.pnpm`) and could
   * otherwise mask an isolated store.
   */
  protected override isHoisted = new Lazy<boolean>(async () => {
    const nmDir = path.join(this.rootDir, "node_modules")
    const entries = await fs.readdir(nmDir).catch(() => [] as string[])
    let sawPackage = false
    for (const name of entries) {
      if (name.startsWith(".")) {
        continue // .pnpm, .bin, .modules.yaml
      }
      const entryPath = path.join(nmDir, name)
      // A scoped dir (@scope) is not a package itself; descend to its packages.
      const candidates = name.startsWith("@") ? (await fs.readdir(entryPath).catch(() => [] as string[])).map(s => path.join(entryPath, s)) : [entryPath]
      for (const candidate of candidates) {
        const real = await fs.realpath(candidate).catch(() => null)
        if (real == null) {
          continue
        }
        sawPackage = true
        if (real.split(path.sep).includes(".pnpm")) {
          return false // isolated store: a package routes through the virtual store
        }
      }
    }
    // Packages exist and none route through `.pnpm` → hoisted. No packages → flat default.
    return sawPackage
  })

  /**
   * Memo for `locateFromDepOrRoot`, keyed by `name@version`. pnpm's content-addressed virtual
   * store guarantees that any given `name@version` resolves to a single location on disk, so
   * once we've resolved a package we can short-circuit every subsequent lookup. This is the
   * dominant speedup for large workspaces where the `pnpm list --json` tree contains the same
   * `name@version` thousands of times (one entry per dependent).
   */
  private readonly locateMemo: Map<string, Promise<Package | null>> = new Map()

  /**
   * Visited set for `collectDepsRecursively`, keyed by `name@version`. Without this we re-walk
   * every shared subtree of the pnpm list output, exploding work in deep workspaces.
   */
  private readonly collectedDeps: Set<string> = new Set()

  /** Reverse index of `allDependencies` keyed by package name (without version). Built once on
   *  first access inside `extractProductionDependencyGraph`, after `allDependencies` is settled. */
  private _allDepsByName: Map<string, PnpmDependency> | null = null

  /**
   * Returns the workspace packages to iterate over, gated by detected pnpm version:
   * - pnpm v11+: multi-entry workspace output → return the full parsed array
   * - pnpm < v11 / non-workspace / detection failure: single-tree behavior → return only [0]
   */
  private get allWorkspacePackages(): PnpmDependency[] {
    if (this._pnpmMajorVersion >= 11) {
      return this._allWorkspacePackages
    }
    return this._allWorkspacePackages.slice(0, 1)
  }

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity", "--silent", "--loglevel=error"]
  }

  private getAllDepsByName(): Map<string, PnpmDependency> {
    if (!this._allDepsByName) {
      this._allDepsByName = new Map()
      for (const [id, dep] of this.allDependencies.entries()) {
        const { name } = this.parseNameVersion(id)
        if (!this._allDepsByName.has(name)) {
          this._allDepsByName.set(name, dep)
        }
      }
    }
    return this._allDepsByName
  }

  /**
   * Locate a package version, preferring the dep's own reported path before falling back to rootDir.
   * This is critical for pnpm non-hoisted (virtual store) setups where each package has its own
   * nested node_modules. Searching only from rootDir can resolve the wrong version when multiple
   * versions of a dep exist in the workspace.
   */
  private async locateFromDepOrRoot(pkgName: string, parentPath: string | undefined, requiredRange?: string) {
    // pnpm's virtual store is content-addressed: every `name@version` lookup is deterministic,
    // so memoize on the exact version. `requiredRange` is normally an exact version coming from
    // the pnpm list output (e.g. `value.version`), which makes this cache hit on duplicates.
    // Only memoize when we have a concrete version — semver ranges could resolve differently
    // depending on what's installed at `parentPath` vs root, so skip the cache for those.
    const memoKey = requiredRange && /^\d/.test(requiredRange) ? `${pkgName}@${requiredRange}` : null
    if (memoKey != null) {
      const cached = this.locateMemo.get(memoKey)
      if (cached != null) {
        return cached
      }
    }

    // pnpm's default `.pnpm` virtual store is flat, so `downwardSearch` would burn thousands
    // of `readdir`/`lstat` calls finding nothing. With `nodeLinker: hoisted`, however, the
    // layout is a traditional nested `node_modules` tree where version-conflicted packages
    // land at `<root>/node_modules/A/node_modules/B` — downward BFS is needed to find them.
    const skipDownwardSearch = !(await this.isHoisted.value)
    const promise = (async (): Promise<Package | null> => {
      // Phase 1: find a version that SATISFIES requiredRange, trying the dep's own location
      // first, then the workspace root. Crucially, neither pass accepts an out-of-range override
      // here — so a wrong-version copy reachable via upward search from `parentPath` (e.g. a
      // hoisted top-level dep) can't shadow the correct nested copy under root. With
      // `nodeLinker: hoisted`, pnpm still reports virtual-store `path`s that don't exist on disk;
      // an upward walk from one meets the root copy, which previously got accepted as an
      // "override" before the root search (whose downward BFS finds the nested copy) ever ran.
      const satisfying =
        (parentPath ? await this.cache.locatePackageVersion({ pkgName, parentDir: parentPath, requiredRange, skipDownwardSearch, skipOverrideFallback: true }) : null) ??
        (await this.cache.locatePackageVersion({ pkgName, parentDir: this.rootDir, requiredRange, skipDownwardSearch, skipOverrideFallback: true }))
      if (satisfying) {
        return satisfying
      }
      // Phase 2: no version satisfies requiredRange (package-manager override, or no range
      // given). Fall back to the original dep-then-root order, now allowing override versions.
      const fromDep = parentPath ? await this.cache.locatePackageVersion({ pkgName, parentDir: parentPath, requiredRange, skipDownwardSearch }) : null
      if (fromDep) {
        return fromDep
      }
      return this.cache.locatePackageVersion({ pkgName, parentDir: this.rootDir, requiredRange, skipDownwardSearch })
    })()

    if (memoKey != null) {
      this.locateMemo.set(memoKey, promise)
    }
    return promise
  }

  // pnpm 10+ does not automatically preserve transitive optional platform-specific
  // packages (e.g. sass-embedded-linux-x64) across lock file regeneration. Users
  // must list them as direct optionalDependencies. Missing ones are emitted as
  // PKG_OPTIONAL_PLATFORM_NOT_INSTALLED warnings in the log summary.
  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }
    this.productionGraph[dependencyId] = { dependencies: [] }

    if ((tree.dedupedDependenciesCount ?? 0) > 0) {
      const realDep = this.allDependencies.get(dependencyId)
      if (realDep) {
        this.cache.logSummary[LogMessageByKey.PKG_DUPLICATE_REF].push(dependencyId)
        tree = realDep
      } else {
        this.cache.logSummary[LogMessageByKey.PKG_DUPLICATE_REF_UNRESOLVED].push(dependencyId)
        return
      }
    }

    const packageName = tree.name || tree.from
    const { packageJson } = (await this.locateFromDepOrRoot(packageName, tree.path, tree.version)) || {}

    const all = packageJson ? { ...packageJson.dependencies, ...packageJson.optionalDependencies } : { ...tree.dependencies, ...tree.optionalDependencies }
    const optional = packageJson ? { ...packageJson.optionalDependencies } : {}

    const deps: Record<string, PnpmDependency> = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }

    // pnpm --prod omits sub-deps for link: packages (and synthetic entries derived from them), and pnpm
    // 10.29.3+ prints a repeated subtree only once, so every later occurrence is a childless `deduped`
    // stub (which is what `tree` is when the stub was the first occurrence collected). For any dep
    // declared in the package.json (all) that pnpm left out of the tree, recover the resolved entry
    // from allDependencies so it lands in the production graph.
    for (const [depName, declaredRange] of Object.entries(all)) {
      if (!deps[depName]) {
        const dep = await this.resolveOmittedDependency(depName, declaredRange, tree.path)
        if (dep && isValidKey(depName)) {
          deps[depName] = dep
        }
      }
    }

    this.productionGraph[dependencyId] = { dependencies: [] }
    const depPromises = Object.entries(deps).map(async ([packageName, dependency]) => {
      // First check if it's in production dependencies
      if (!all[packageName]) {
        return undefined
      }

      // Then check if optional dependency path exists (using actual resolved path)
      if (optional[packageName]) {
        const pkg = await this.locateFromDepOrRoot(packageName, tree.path, dependency.version)
        if (!pkg) {
          // Declared in `optionalDependencies`, so a miss is an expected condition (e.g. fsevents
          // on Linux/Windows) — classify it as a missing optional dependency, not PKG_NOT_ON_DISK.
          this.logMissingDependency(`${packageName}@${dependency.version}`, true)
          return undefined
        }
      }
      const { id: childDependencyId, pkgOverride } = this.normalizePackageVersion(packageName, dependency)
      await this.extractProductionDependencyGraph(pkgOverride, childDependencyId)
      return childDependencyId
    })

    const collectedDependencies: string[] = []
    for (const dep of depPromises) {
      const result = await dep
      if (result !== undefined) {
        collectedDependencies.push(result)
      }
    }
    this.productionGraph[dependencyId] = { dependencies: collectedDependencies }
  }

  /**
   * Resolve a dependency that `pnpm list` left out of a package's tree to its `allDependencies` entry.
   * The lookup goes through the copy node itself would load from `parentPath` (the package's real store
   * directory), filtered by the declared range, and falls back to a name-only match only when nothing on
   * disk resolves to a collected entry (a `link:` dep, whose entry is keyed by its `link:` version).
   *
   * A name-only lookup returns whichever version was collected first, which is wrong as soon as two
   * versions of the package are installed: with the app pinning es5-ext@0.10.53 while its transitive
   * d@1.0.2 needs es5-ext ^0.10.64, `d` was wired to 0.10.53 and the nested 0.10.64 copy (with its own
   * esniff / event-emitter / next-tick@1.1.0 closure) vanished from the asar (#8493). pnpm 10.29.3+
   * made this common, because its deduped output routes every repeated package through this recovery.
   */
  private async resolveOmittedDependency(depName: string, declaredRange: unknown, parentPath: string | undefined): Promise<PnpmDependency | undefined> {
    const range = typeof declaredRange === "string" ? declaredRange : undefined
    const located = await this.locateFromDepOrRoot(depName, parentPath, range)
    const exact = located ? this.allDependencies.get(`${depName}@${located.packageJson.version}`) : undefined
    return exact ?? this.getAllDepsByName().get(depName)
  }

  protected async collectAllDependencies(_tree: PnpmDependency, _appPackageName: string): Promise<void> {
    for (const root of this.allWorkspacePackages) {
      await this.collectDepsRecursively(root)
    }
  }

  private async collectDepsRecursively(tree: PnpmDependency): Promise<void> {
    const visit = async (key: string, value: PnpmDependency) => {
      if ((value?.dedupedDependenciesCount ?? 0) > 0) {
        return
      }
      const id = `${key}@${value.version}`
      // The pnpm list output can include the same `name@version` thousands of times across a
      // deep workspace; without this guard we re-resolve and re-recurse each occurrence.
      if (this.collectedDeps.has(id)) {
        return
      }
      this.collectedDeps.add(id)
      const pkg = await this.locateFromDepOrRoot(key, value.path, value.version)
      this.allDependencies.set(id, { ...value, path: pkg?.packageDir ?? value.path })
      await this.collectDepsRecursively(value)
    }

    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      await visit(key, value)
    }
    for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
      await visit(key, value)
    }
  }

  protected override getTreeFromWorkspaces(tree: PnpmDependency, packageName: string): PnpmDependency {
    // pnpm v10 workspace: app is nested as a dependency of root — handled by base class
    const result = super.getTreeFromWorkspaces(tree, packageName)
    if (result !== tree) {
      return result
    }
    // pnpm v11 workspace: each workspace package is a separate top-level array entry;
    // non-workspace (single-tree): find returns the one entry or undefined → falls back to tree
    const match = this.allWorkspacePackages.find(pkg => pkg.name === packageName || pkg.from === packageName)
    return match ?? tree
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<PnpmDependency> {
    const dependencyTree = this.extractJsonFromPollutedOutput<PnpmDependency[]>(jsonBlob)
    this._allWorkspacePackages = dependencyTree
    this._pnpmMajorVersion = await this.pnpmVersion.value
    return dependencyTree[0]
  }
}
