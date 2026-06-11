import _fsExtra from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { LogMessageByKey, type Package } from "./moduleManager.js"
import { NodeModulesCollector } from "./nodeModulesCollector.js"
import { getPackageManagerCommand, PM } from "./packageManager.js"
import type { PackageJson, PnpmDependency } from "./types.js"

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

    // pnpm --prod omits sub-deps for link: packages (and synthetic entries derived from them).
    // For any dep declared in the package.json (all) that pnpm left out of the tree, recover
    // the resolved entry from allDependencies so it lands in the production graph.
    for (const depName of Object.keys(all)) {
      if (!deps[depName]) {
        for (const [id, dep] of this.allDependencies.entries()) {
          const { name } = this.parseNameVersion(id)
          if (name === depName) {
            deps[depName] = dep
            break
          }
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
          this.logMissingDependency(`${packageName}@${dependency.version}`)
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

  protected async collectAllDependencies(_tree: PnpmDependency, _appPackageName: string): Promise<void> {
    for (const root of this.allWorkspacePackages) {
      await this.collectDepsRecursively(root)
    }
    // pnpm --prod omits link: packages from its JSON output entirely; pick them up from the
    // app's package.json so their transitive deps are included in allDependencies.
    await this.collectOmittedLinkPackages()
  }

  /**
   * Visit a single dependency node, adding it and its transitive deps to allDependencies.
   *
   * For packages that pnpm list did NOT expand (link: packages and the synthetic entries
   * derived from them), the tree has empty dependencies/optionalDependencies. In that case
   * we fall back to the on-disk package.json to discover transitive deps, resolving each one
   * from the package's own node_modules first (where pnpm placed them).
   */
  private async visitDep(key: string, value: PnpmDependency): Promise<void> {
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

    const treeDepsCount = Object.keys({ ...(value.dependencies || {}), ...(value.optionalDependencies || {}) }).length
    if (treeDepsCount === 0 && pkg?.packageJson) {
      // pnpm list omits sub-deps for link: packages and for synthetic entries we create when
      // traversing their transitive deps. Use the package.json to discover what to include.
      const pkgDeps = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.optionalDependencies || {}) }
      for (const depName of Object.keys(pkgDeps)) {
        const resolved = await this.locateFromDepOrRoot(depName, pkg.packageDir, undefined)
        if (!resolved) {
          continue
        }
        await this.visitDep(depName, {
          from: depName,
          name: depName,
          version: resolved.packageJson.version,
          path: resolved.packageDir,
          dependencies: {},
          optionalDependencies: {},
        } as unknown as PnpmDependency)
      }
    } else {
      await this.collectDepsRecursively(value)
    }
  }

  private async collectDepsRecursively(tree: PnpmDependency): Promise<void> {
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      await this.visitDep(key, value)
    }
    for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
      await this.visitDep(key, value)
    }
  }

  /**
   * pnpm excludes link: packages from `pnpm list --prod` output. Read the app's package.json
   * directly to find any link: deps that were silently omitted and visit them so their
   * transitive deps end up in allDependencies.
   */
  private async collectOmittedLinkPackages(): Promise<void> {
    const appPkgJson = (await _fsExtra.readJson(path.join(this.rootDir, "package.json")).catch(() => null)) as PackageJson | null
    if (!appPkgJson) {
      return
    }
    const allDeps = { ...(appPkgJson.dependencies || {}), ...(appPkgJson.optionalDependencies || {}) }
    for (const [name, version] of Object.entries(allDeps)) {
      if (typeof version !== "string" || !version.startsWith("link:")) {
        continue
      }
      const resolved = await this.locateFromDepOrRoot(name, this.rootDir, undefined)
      if (!resolved) {
        continue
      }
      await this.visitDep(name, {
        from: name,
        name,
        version: resolved.packageJson.version,
        path: resolved.packageDir,
        dependencies: {},
        optionalDependencies: {},
      } as unknown as PnpmDependency)
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
