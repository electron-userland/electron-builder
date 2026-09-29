import _fsExtra from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { LogMessageByKey, type Package, readJsonOrNull } from "./moduleManager.js"
import { NodeModulesCollector } from "./nodeModulesCollector.js"
import { getPackageManagerCommand, PM } from "./packageManager.js"
import type { PackageJson, PnpmDependency } from "./types.js"
import { exists, isValidKey } from "builder-util"

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
   * Detect pnpm's installed layout from the on-disk structure rather than from config.
   * pnpm 11 ignores `node-linker` in `.npmrc` (it moved to `nodeLinker` in `pnpm-workspace.yaml`),
   * so config parsing can report "not hoisted" for a hoisted install, which would disable the
   * downward search needed to find version-conflicted nested deps.
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
    // A workspace package's own `node_modules` is often absent (or holds only its version
    // conflicts) in a hoisted workspace, so fall back to the workspace root's `node_modules`.
    let sawPackage = false
    for (const dir of await this.layoutRoots.value) {
      const isolated = await this.scanNodeModulesLayout(path.join(dir, "node_modules"))
      if (isolated != null) {
        if (isolated) {
          return false
        }
        sawPackage = true
      }
    }
    // Packages exist and none route through `.pnpm` → hoisted. No packages → flat default.
    return sawPackage
  })

  /**
   * The pnpm workspace root containing `rootDir` (nearest ancestor with `pnpm-workspace.yaml`, as pnpm
   * itself resolves it), or null outside a workspace or when `rootDir` is the workspace root.
   */
  private readonly workspaceRoot = new Lazy<string | null>(async () => {
    let current = path.resolve(this.rootDir)
    while (true) {
      if (await exists(path.join(current, "pnpm-workspace.yaml"))) {
        return current === path.resolve(this.rootDir) ? null : current
      }
      const parent = path.dirname(current)
      if (parent === current) {
        return null
      }
      current = parent
    }
  })

  /** `rootDir`, then the workspace root when `rootDir` is a workspace package. */
  private readonly layoutRoots = new Lazy<string[]>(async () => {
    const workspaceRoot = await this.workspaceRoot.value
    return workspaceRoot == null ? [this.rootDir] : [this.rootDir, workspaceRoot]
  })

  /** Returns true if `nmDir` is an isolated (`.pnpm`) store, false if hoisted, null if it holds no packages. */
  private async scanNodeModulesLayout(nmDir: string): Promise<boolean | null> {
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
          return true // isolated store: a package routes through the virtual store
        }
      }
    }
    return sawPackage ? false : null
  }

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
      // hoisted top-level dep) can't shadow the correct nested copy under root. Without this, a
      // package that pnpm deduped to a peer's node_modules resolves its transitive deps to the
      // wrong hoisted version (see jsonfile under two fs-extra majors). The root pass uses the
      // same `skipDownwardSearch` as everywhere else: in a hoisted layout it is already false, so
      // the nested `<root>/node_modules/A/node_modules/B` copy is found via BFS; in the flat
      // `.pnpm` virtual store it stays true (forcing it on there would burn thousands of
      // readdir/lstat calls — and on Windows, where pnpm uses junctions that `lstat` reports as
      // directories, the BFS walks the entire store and resolves the wrong paths).
      //
      // When `rootDir` is a workspace package, a hoisted install keeps the tree — including the
      // nested `<workspaceRoot>/node_modules/A/node_modules/B` copies — under the workspace root,
      // which the downward BFS from `rootDir` never reaches (its `node_modules` is often absent),
      // so search the workspace root last.
      let satisfying = parentPath ? await this.cache.locatePackageVersion({ pkgName, parentDir: parentPath, requiredRange, skipDownwardSearch, skipOverrideFallback: true }) : null
      for (const dir of await this.layoutRoots.value) {
        satisfying ??= await this.cache.locatePackageVersion({ pkgName, parentDir: dir, requiredRange, skipDownwardSearch, skipOverrideFallback: true })
      }
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
    })().then(pkg => this.toRealPackage(pkg))

    if (memoKey != null) {
      this.locateMemo.set(memoKey, promise)
    }
    return promise
  }

  /**
   * Resolve a located package to its real directory (the symlink target), leaving a non-symlinked
   * hit untouched.
   *
   * `locatePackageVersion` returns the path it *walked*, which in pnpm's isolated store is the
   * `node_modules/<name>` symlink rather than `.pnpm/<name>@<ver>/node_modules/<name>`. That
   * distinction matters because the store keeps a package's dependencies as SIBLINGS inside
   * `.pnpm/<name>@<ver>/node_modules/`, reachable only from the real path: searching upward from
   * the symlink walks the *linking* project instead of the store and finds nothing. That is how
   * `fs-extra`'s `universalify`/`jsonfile` (and `js-yaml`'s `argparse`) were silently dropped from
   * the asar of an app whose `electron-updater` came from a `link:`ed checkout — pnpm reports such
   * packages with no dependency tree, so `visitDep` resolves their deps from disk through here.
   *
   * Resolving the link is what Node itself does (`--preserve-symlinks` is off by default), which is
   * why the same require works before packaging. `ModuleManager.locatePackageVersionFromCacheKey`
   * and `TraversalNodeModulesCollector` already normalize this way.
   */
  private async toRealPackage(pkg: Package | null): Promise<Package | null> {
    if (pkg == null) {
      return null
    }
    const packageDir = await this.cache.realPath[pkg.packageDir]
    return packageDir === pkg.packageDir ? pkg : { ...pkg, packageDir }
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
    const packageJson = locatedJson ?? (tree.path ? await readJsonOrNull<PackageJson>(path.join(tree.path, "package.json")) : null)

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
    const packageJson = await readJsonOrNull<PackageJson>(path.join(dir, "package.json"))
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
    // located package.json; fall back to reading it straight from the resolved directory when the
    // by-name lookup came up empty. That happens whenever the package does not sit inside a
    // `node_modules/<name>` directory it can find itself in: a cross-drive link target whose
    // junction is unreadable, and a workspace package such as `packages/builder-util-runtime`,
    // which nothing above it exposes under `node_modules/`. Without this fallback such a package
    // contributes no dependencies at all (its `debug`/`sax` would vanish from the asar).
    const pkg = located ?? (resolvedPath != null ? await this.readPackageJsonAt(resolvedPath) : null)
    const hasTreeDeps = Object.keys(value.dependencies ?? {}).length > 0 || Object.keys(value.optionalDependencies ?? {}).length > 0
    if (!hasTreeDeps && pkg?.packageJson) {
      // pnpm list omits sub-deps for link: packages and for entries where the reported path
      // doesn't expand transitive deps (e.g. a link: package's nested dep). Use the on-disk
      // package.json to discover what to include, and pass the declared version range so that
      // resolution skips wrong-version hoisted packages and finds the correct nested copy.
      const pkgOptionalDecl = pkg.packageJson.optionalDependencies || {}
      const pkgDepsDecl = { ...(pkg.packageJson.dependencies || {}), ...pkgOptionalDecl }
      for (const [depName, depRange] of Object.entries(pkgDepsDecl)) {
        const resolved = await this.locateFromDepOrRoot(depName, pkg.packageDir, typeof depRange === "string" ? depRange : undefined)
        if (!resolved) {
          // A miss here silently ships a broken app (the dependency is simply absent from the
          // asar and only fails at runtime with MODULE_NOT_FOUND), so surface it in the log
          // summary. Optional deps are an expected miss and get the quieter bucket.
          this.logMissingDependency(`${depName}@${depRange}`, pkgOptionalDecl[depName] != null)
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
    const appPkgJson = await readJsonOrNull<PackageJson>(path.join(this.rootDir, "package.json"))
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
      const directPkg = await readJsonOrNull<PackageJson>(path.join(linkTarget, "package.json"))
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
