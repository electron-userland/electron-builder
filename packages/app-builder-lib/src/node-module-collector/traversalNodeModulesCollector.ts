import { log } from "builder-util"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager.js"
import { TraversedDependency } from "./types.js"
import * as path from "path"

// manual traversal of node_modules for package managers without CLI support for dependency tree extraction (e.g., bun) OR as a fallback (e.g. corepack enabled w/ strict mode)
export class TraversalNodeModulesCollector extends NodeModulesCollector<TraversedDependency, TraversedDependency> {
  public installOptions = {
    manager: PM.TRAVERSAL,
    lockfile: "none",
  }

  protected getArgs(): string[] {
    return []
  }

  protected getDependenciesTree(_pm: PM): Promise<TraversedDependency> {
    log.info(null, "using manual traversal of node_modules to build dependency tree")
    return this.buildNodeModulesTreeManually(this.rootDir, undefined)
  }

  protected async collectAllDependencies(tree: TraversedDependency, appPackageName: string) {
    for (const [packageKey, value] of Object.entries({ ...tree.dependencies, ...tree.optionalDependencies })) {
      const normalizedDep = this.normalizePackageVersion(packageKey, value)
      this.allDependencies.set(normalizedDep.id, normalizedDep.pkgOverride)
      await this.collectAllDependencies(value, appPackageName)
    }
  }

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
      const normalizedDep = this.normalizePackageVersion(packageName, dependency)
      const childDependencyId = normalizedDep.id
      await this.extractProductionDependencyGraph(normalizedDep.pkgOverride, childDependencyId)
      collectedDependencies.push(childDependencyId)
    }
    this.productionGraph[dependencyId] = { dependencies: collectedDependencies }
  }

  /**
   * Builds a dependency tree using only package.json dependencies and optionalDependencies.
   * This skips devDependencies and uses Node.js module resolution (require.resolve).
   */
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

      if (!(await this.cache.exists[pkgPath])) {
        throw new Error(`package.json not found at ${pkgPath}`)
      }

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
          version: pkg.version,
          path: resolvedPackageDir,
        }
      }

      visited.add(resolvedPackageDir)

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
            log.debug({ ...logFields, resolvedPath: pkg.packageDir }, "skipping self-referential dependency")
            continue
          }

          log.debug(logFields, "processing production dependency")
          builtPackages[depName] = await buildFromPackage(pkg.packageDir, depName)
        }
        return builtPackages
      }

      const prodDeps = await buildPackage(pkg.dependencies, (depName: string, version: string) => {
        log.error({ parent: moduleName, dependency: depName, version }, "production dependency not found")
        throw new Error(`Production dependency ${depName} not found for package ${moduleName}`)
      })

      const optionalDeps = await buildPackage(pkg.optionalDependencies, (depName: string) => {
        log.debug({ parent: moduleName, dependency: depName }, "optional dependency not installed, skipping")
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
  }
}
