import { log } from "builder-util"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager.js"
import { PackageJson, TraversedDependency } from "./types.js"
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
    return this.buildNodeModulesTreeManually(this.rootDir)
  }

  protected async collectAllDependencies(tree: TraversedDependency, appPackageName: string) {
    for (const [, value] of Object.entries({ ...tree.dependencies, ...tree.optionalDependencies })) {
      this.allDependencies.set(this.packageVersionString(value), value)
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
      const childDependencyId = this.packageVersionString(dependency)
      await this.extractProductionDependencyGraph(dependency, childDependencyId)
      collectedDependencies.push(childDependencyId)
    }
    this.productionGraph[dependencyId] = { dependencies: collectedDependencies }
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<TraversedDependency> {
    return Promise.resolve(JSON.parse(jsonBlob))
  }

  /**
   * Builds a dependency tree using only package.json dependencies and optionalDependencies.
   * This skips devDependencies and uses Node.js module resolution (require.resolve).
   */
  private async buildNodeModulesTreeManually(baseDir: string): Promise<TraversedDependency> {
    // Track visited packages by their resolved path to prevent infinite loops
    const visited = new Set<string>()
    const resolvedBaseDir = await this.cache.realPath[baseDir]

    /**
     * Recursively builds dependency tree starting from a package directory.
     */
    const buildFromPackage = async (packageDir: string): Promise<TraversedDependency> => {
      const pkgPath = path.join(packageDir, "package.json")

      if (!(await this.cache.exists[pkgPath])) {
        throw new Error(`package.json not found at ${pkgPath}`)
      }

      const json: PackageJson = (await this.cache.json[pkgPath])!
      const resolvedPackageDir = await this.cache.realPath[packageDir]

      // Use resolved path as the unique identifier to prevent circular dependencies
      if (visited.has(resolvedPackageDir)) {
        log.debug({ name: json.name, version: json.version, path: resolvedPackageDir }, "skipping already visited package")

        return {
          name: json.name,
          version: json.version,
          path: resolvedPackageDir,
        }
      }

      visited.add(resolvedPackageDir)

      const prodDeps: Record<string, TraversedDependency> = {}
      for (const [depName, depVersion] of Object.entries(json.dependencies || {})) {
        const pkg = await this.locatePackageWithVersion({ name: depName, version: depVersion, path: resolvedPackageDir })

        const logFields = { parent: json.name, dependency: depName, version: depVersion }
        if (pkg == null) {
          log.error(logFields, "production dependency not found")
          throw new Error(`Production dependency ${depName} not found for package ${json.name}`)
        }

        // Skip if this dependency resolves to the base directory or any parent we're already processing
        if (pkg.packageDir === resolvedPackageDir || pkg.packageDir === resolvedBaseDir) {
          log.debug({ ...logFields, resolvedPath: pkg.packageDir }, "skipping self-referential dependency")
          continue
        }
        log.debug(logFields, "processing production dependency")
        prodDeps[depName] = await buildFromPackage(pkg.packageDir)
      }

      const optionalDeps: Record<string, TraversedDependency> = {}
      for (const [depName, depVersion] of Object.entries(json.optionalDependencies || {})) {
        const pkg = await this.locatePackageWithVersion({ name: depName, version: depVersion, path: resolvedPackageDir })

        const logFields = { parent: json.name, dependency: depName, version: depVersion }
        if (pkg == null) {
          log.debug(logFields, "optional dependency not installed, skipping")
          continue
        }

        // Skip if this dependency resolves to the base directory or any parent we're already processing
        if (pkg.packageDir === resolvedPackageDir || pkg.packageDir === resolvedBaseDir) {
          log.debug({ ...logFields, resolvedPath: pkg.packageDir }, "skipping self-referential dependency")
          continue
        }
        log.debug(logFields, "processing optional dependency")
        optionalDeps[depName] = await buildFromPackage(pkg.packageDir)
      }

      return {
        name: json.name,
        version: json.version,
        path: resolvedPackageDir,
        dependencies: Object.keys(prodDeps).length > 0 ? prodDeps : undefined,
        optionalDependencies: Object.keys(optionalDeps).length > 0 ? optionalDeps : undefined,
      }
    }

    return buildFromPackage(baseDir)
  }
}
