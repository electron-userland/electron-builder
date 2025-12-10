import { log } from "builder-util"
<<<<<<< HEAD
import * as path from "path"
import { LogMessageByKey } from "./moduleManager.js"
import { NodeModulesCollector } from "./nodeModulesCollector.js"
import { PM } from "./packageManager.js"
import { TraversedDependency } from "./types.js"

// manual traversal of node_modules for package managers without CLI support for dependency tree extraction (e.g., bun) OR as a fallback (e.g. corepack enabled w/ strict mode)
export class TraversalNodeModulesCollector extends NodeModulesCollector<TraversedDependency, TraversedDependency> {
=======
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager.js"
import { Dependency, PackageJson, TraversedDependency } from "./types.js"
import * as path from "path"

// manual traversal of node_modules for package managers without CLI support for dependency tree extraction (e.g., bun) OR as a fallback (e.g. corepack enabled w/ strict mode)
export class TraversalNodeModulesCollector extends NodeModulesCollector<TraversedDependency, string> {
  // so that tests can still install deps and verify manual collection
  // public installOptions = {
  //   manager: PM.NPM,
  //   lockfile: "package-lock.json",
  // }
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
  public installOptions = {
    manager: PM.TRAVERSAL,
    lockfile: "none",
  }
<<<<<<< HEAD

=======
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
  protected getArgs(): string[] {
    return []
  }

  protected getDependenciesTree(_pm: PM): Promise<TraversedDependency> {
<<<<<<< HEAD
    log.info(null, "using manual traversal of node_modules to build dependency tree")
    return this.buildNodeModulesTreeManually(this.rootDir, undefined)
  }

  protected async collectAllDependencies(tree: TraversedDependency, appPackageName: string) {
    for (const [packageKey, value] of Object.entries({ ...tree.dependencies, ...tree.optionalDependencies })) {
      const normalizedDep = this.normalizePackageVersion(packageKey, value)
      this.allDependencies.set(normalizedDep.id, normalizedDep.pkgOverride)
=======
    return this.buildNodeModulesTreeManually(this.rootDir)
  }

  protected async collectAllDependencies(tree: Dependency<TraversedDependency, string>, appPackageName: string) {
    for (const [, value] of Object.entries(tree.dependencies || {})) {
      this.allDependencies.set(this.packageVersionString(value), value)
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
      await this.collectAllDependencies(value, appPackageName)
    }
  }

<<<<<<< HEAD
  // we don't need to check optional dependencies here because they're pre-processed in `buildNodeModulesTreeManually`
  protected async extractProductionDependencyGraph(tree: TraversedDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }
    this.productionGraph[dependencyId] = { dependencies: [] }

    const prodDependencies = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }

    const collectedDependencies: string[] = []
    for (const packageName in prodDependencies) {
      const dependency = prodDependencies[packageName]
      const { id: childDependencyId, pkgOverride } = this.normalizePackageVersion(packageName, dependency)
      await this.extractProductionDependencyGraph(pkgOverride, childDependencyId)
      collectedDependencies.push(childDependencyId)
    }
    this.productionGraph[dependencyId] = { dependencies: collectedDependencies }
=======
  protected isProdDependency(packageName: string, tree: Dependency<TraversedDependency, string>): boolean {
    return tree.dependencies?.[packageName] != null || tree.optionalDependencies?.[packageName] != null
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<TraversedDependency> {
    return Promise.resolve(JSON.parse(jsonBlob))
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
  }

  /**
   * Builds a dependency tree using only package.json dependencies and optionalDependencies.
   * This skips devDependencies and uses Node.js module resolution (require.resolve).
   */
<<<<<<< HEAD
  private async buildNodeModulesTreeManually(baseDir: string, aliasName: string | undefined): Promise<TraversedDependency> {
    // Track visited packages by their resolved path to prevent infinite loops
    const visited = new Set<string>()
    const resolvedBaseDir = await this.cache.realPath[baseDir]

    /**
     * Recursively builds dependency tree starting from a package directory.
     * @param packageDir - The directory of the package to process
     * @param aliasName - Optional alias name for npm aliased dependencies (e.g., "foo": "npm:@scope/bar@1.0.0")
     *                    When provided, this name is used instead of the package.json name for the module name,
     *                    ensuring the package is copied to the correct location in node_modules.
     */
    const buildFromPackage = async (packageDir: string, aliasName: string | undefined): Promise<TraversedDependency> => {
      const pkgPath = path.join(packageDir, "package.json")

=======
  private buildNodeModulesTreeManually(baseDir: string): Promise<TraversedDependency> {
    // Track visited packages by their resolved path to prevent infinite loops
    const visited = new Set<string>()

    /**
     * Recursively builds dependency tree starting from a package directory.
     */
    const buildFromPackage = async (packageDir: string): Promise<TraversedDependency> => {
      const pkgPath = path.join(packageDir, "package.json")

      log.debug({ pkgPath }, "building dependency node from package.json")

>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
      if (!(await this.cache.exists[pkgPath])) {
        throw new Error(`package.json not found at ${pkgPath}`)
      }

<<<<<<< HEAD
      const pkg = (await this.cache.json[pkgPath])!
      const resolvedPackageDir = await this.cache.realPath[packageDir]

      // Use the alias name if provided, otherwise fall back to the package.json name
      // This ensures npm aliased packages are copied to the correct location
      const moduleName = aliasName ?? pkg.name

      // Use resolved path as the unique identifier to prevent circular dependencies
      if (visited.has(resolvedPackageDir)) {
        log.debug({ name: moduleName, version: pkg.version, path: resolvedPackageDir }, "skipping already visited package")

        return {
          name: moduleName,
=======
      const pkg: PackageJson = await this.cache.packageJson[pkgPath]
      const resolvedPackageDir = await this.cache.realPath[packageDir]

      // Use resolved path as the unique identifier to prevent circular dependencies
      if (visited.has(resolvedPackageDir)) {
        log.debug({ name: pkg.name, version: pkg.version, path: resolvedPackageDir }, "skipping already visited package")

        return {
          name: pkg.name,
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
          version: pkg.version,
          path: resolvedPackageDir,
        }
      }

      visited.add(resolvedPackageDir)

<<<<<<< HEAD
      const buildPackage = async (dependencies: Record<string, string> | undefined, nullHandler: (depName: string, version: string) => void) => {
        const builtPackages: Record<string, TraversedDependency> = {}
        for (const [depName, depVersion] of Object.entries(dependencies || {})) {
          const pkg = await this.locatePackageWithVersion({ name: depName, version: depVersion, path: resolvedPackageDir })

          const logFields = { parent: moduleName, dependency: depName, version: depVersion }
          if (pkg == null) {
            nullHandler(depName, depVersion)
            continue
          }

          // Skip if this dependency resolves to the base directory or any parent we're already processing
          if (pkg.packageDir === resolvedPackageDir || pkg.packageDir === resolvedBaseDir) {
            this.cache.logSummary[LogMessageByKey.PKG_SELF_REF].push(`${depName}@${depVersion}`)
=======
      const prodDeps: Record<string, TraversedDependency> = {}
      const allProdDepNames = {
        ...pkg.dependencies,
        ...pkg.optionalDependencies,
      }

      // Process all production and optional dependencies
      for (const [depName, depVersion] of Object.entries(allProdDepNames)) {
        try {
          const depPath = await this.locatePackageVersion(resolvedPackageDir, depName, depVersion)

          if (!depPath || depPath.packageDir.length === 0) {
            log.warn({ package: pkg.name, dependency: depName, version: depVersion }, "dependency not found, skipping")
            continue
          }

          const resolvedDepPath = await this.cache.realPath[depPath.packageDir]
          const logFields = { package: pkg.name, dependency: depName, resolvedPath: resolvedDepPath }

          // Skip if this dependency resolves to the base directory or any parent we're already processing
          if (resolvedDepPath === resolvedPackageDir || resolvedDepPath === (await this.cache.realPath[baseDir])) {
            log.debug(logFields, "skipping self-referential dependency")
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
            continue
          }

          log.debug(logFields, "processing production dependency")
<<<<<<< HEAD
          builtPackages[depName] = await buildFromPackage(pkg.packageDir, depName)
        }
        return builtPackages
      }

      const prodDeps = await buildPackage(pkg.dependencies, (depName: string, version: string) => {
        log.error({ parent: moduleName, dependency: depName, version }, "production dependency not found")
        throw new Error(`Production dependency ${depName} not found for package ${moduleName}`)
      })

      const optionalDeps = await buildPackage(pkg.optionalDependencies, (depName: string, version: string) => {
        log.debug({ parent: moduleName, dependency: depName }, "optional dependency not installed, skipping")
        this.cache.logSummary[LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED].push(`${depName}@${version}`)
      })

      return {
        name: moduleName,
        version: pkg.version,
        path: resolvedPackageDir,
        dependencies: Object.keys(prodDeps).length > 0 ? prodDeps : undefined,
        optionalDependencies: Object.keys(optionalDeps).length > 0 ? optionalDeps : undefined,
      }
    }

    return buildFromPackage(baseDir, aliasName)
=======

          // Recursively build the dependency tree for this dependency
          prodDeps[depName] = await buildFromPackage(resolvedDepPath)
        } catch (error: any) {
          log.warn({ package: pkg.name, dependency: depName, error: error.message }, "failed to process dependency, skipping")
        }
      }

      return {
        name: pkg.name,
        version: pkg.version,
        path: resolvedPackageDir,
        dependencies: Object.keys(prodDeps).length > 0 ? prodDeps : undefined,
        optionalDependencies: pkg.optionalDependencies,
      }
    }

    return buildFromPackage(baseDir)
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
  }
}
