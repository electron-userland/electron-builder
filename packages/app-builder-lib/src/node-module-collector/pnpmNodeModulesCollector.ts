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
    const entries = await _fsExtra.readdir(nmDir).catch(() => [] as string[])
    let sawPackage = false
    for (const name of entries) {
      if (name.startsWith(".")) {
        continue // .pnpm, .bin, .modules.yaml
      }
      const entryPath = path.join(nmDir, name)
      // A scoped dir (@scope) is not a package itself; descend to its packages.
      const candidates = name.startsWith("@") ? (await _fsExtra.readdir(entryPath).catch(() => [] as string[])).map(s => path.join(entryPath, s)) : [entryPath]
      for (const candidate of candidates) {
        const real = await _fsExtra.realpath(candidate).catch(() => null)
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
      // Phase 1: find a version that SATISFIES requiredRange, trying the dep's own location
      // first, then the workspace root. Crucially, neither pass accepts an out-of-range override
      // here — so a wrong-version copy reachable via upward search from `parentPath` (e.g. a
      // hoisted top-level dep) can't shadow the correct nested copy under root. Without this, a
      // package that pnpm deduped to a peer's node_modules resolves its transitive deps to the
      // wrong hoisted version (see jsonfile under two fs-extra majors). The root pass uses the
      // same `skipDownwardSearch` as everywhere else: in a hoisted layout it is already false, so
      // the nested `<root>/node_modules/A/node_modules/B` copy is found via BFS; in the flat
      // `.pnpm` virtual store it stays true (forcing it on there would burn thousands of
      // readdir/lstat calls — and on Windows, where pnpm uses junctions that `lstat` reports as
      // directories, the BFS walks the entire store and resolves the wrong paths).
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
    const { packageJson: locatedJson } = (await this.locateFromDepOrRoot(packageName, tree.path, tree.version)) || {}
    // Fallback: the app root package is never installed inside a node_modules directory, so
    // the name-based lookup above returns null. Reading directly from tree.path ensures that
    // link: dependencies — which some pnpm versions omit from `pnpm list --prod` output —
    // still appear in `all` and therefore reach the production graph.
    const packageJson = locatedJson ?? (tree.path ? ((await _fsExtra.readJson(path.join(tree.path, "package.json")).catch(() => null)) as PackageJson | null) : null)

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
   * Resolve a `link:` dependency to its real on-disk source directory — never the `node_modules`
   * junction pnpm creates for it. Returns null for non-link deps.
   *
   * Why this matters: resolving a link: dep through `node_modules` (locateFromDepOrRoot) yields the
   * junction, which CI cannot read across drives. CI checks out the repo on `D:` but installs the
   * app under `C:\…\Temp`, so the junction is a cross-volume link that `realpath`/`stat` fail on,
   * silently dropping the package from the asar. The link target is a plain directory that reads
   * fine from any drive, so we resolve straight to it.
   */
  private resolveLinkTarget(value: PnpmDependency): string | null {
    const version = value.version
    if (typeof version !== "string" || !version.startsWith("link:")) {
      return null
    }
    const spec = version.slice("link:".length)
    // A cross-drive link cannot be expressed relative, so pnpm reports it as an absolute path —
    // use it directly. Otherwise prefer pnpm's already-resolved absolute `path` (the source dir,
    // never the junction), falling back to resolving the relative spec against the workspace root.
    if (path.isAbsolute(spec)) {
      return path.normalize(spec)
    }
    if (value.path && path.isAbsolute(value.path)) {
      return path.normalize(value.path)
    }
    return path.resolve(this.rootDir, spec)
  }

  private async readPackageJsonAt(dir: string): Promise<Package | null> {
    const packageJson = (await _fsExtra.readJson(path.join(dir, "package.json")).catch(() => null)) as PackageJson | null
    return packageJson ? { packageDir: dir, packageJson } : null
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
    const id = `${key}@${value.version}`
    // The pnpm list output can include the same `name@version` thousands of times across a
    // deep workspace; without this guard we re-resolve and re-recurse each occurrence.
    if (this.collectedDeps.has(id)) {
      return
    }
    this.collectedDeps.add(id)

    const located = await this.locateFromDepOrRoot(key, value.path, value.version)
    // For a link: dep, store the real source dir (the link target) rather than the located path,
    // which is the node_modules junction. Across drives that junction is unreadable (see
    // resolveLinkTarget), so storing it makes the package vanish from the asar.
    const linkTarget = this.resolveLinkTarget(value)
    const resolvedPath = linkTarget ?? located?.packageDir ?? value.path
    this.allDependencies.set(id, { ...value, path: resolvedPath })

    // For transitive-dep discovery of entries pnpm did not expand (link: packages), use the
    // located package.json; fall back to the link target's own package.json when the junction
    // could not be resolved (again, the cross-drive case).
    const pkg = located ?? (linkTarget != null ? await this.readPackageJsonAt(linkTarget) : null)
    const treeDepsCount = Object.keys({ ...(value.dependencies || {}), ...(value.optionalDependencies || {}) }).length
    if (treeDepsCount === 0 && pkg?.packageJson) {
      // pnpm list omits sub-deps for link: packages and for entries where the reported path
      // doesn't expand transitive deps (e.g. a link: package's nested dep). Use the on-disk
      // package.json to discover what to include, and pass the declared version range so that
      // resolution skips wrong-version hoisted packages and finds the correct nested copy.
      const pkgDepsDecl = { ...(pkg.packageJson.dependencies || {}), ...(pkg.packageJson.optionalDependencies || {}) }
      for (const [depName, depRange] of Object.entries(pkgDepsDecl)) {
        const resolved = await this.locateFromDepOrRoot(depName, pkg.packageDir, typeof depRange === "string" ? depRange : undefined)
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
      // Resolve the link: target path directly — bypasses potentially broken cross-drive
      // Windows junctions (C:→D:) that locateFromDepOrRoot would traverse through
      // node_modules and silently fail on (readJson returns null via .catch).
      const linkRelPath = version.slice("link:".length)
      const linkTarget = path.isAbsolute(linkRelPath) ? linkRelPath : path.resolve(this.rootDir, linkRelPath)
      const directPkg = (await _fsExtra.readJson(path.join(linkTarget, "package.json")).catch(() => null)) as PackageJson | null
      const resolved = directPkg ? { packageDir: linkTarget, packageJson: directPkg } : await this.locateFromDepOrRoot(name, this.rootDir, undefined)
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
