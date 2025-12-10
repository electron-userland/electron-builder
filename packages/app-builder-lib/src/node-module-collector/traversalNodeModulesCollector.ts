import { log } from "builder-util"
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
  public installOptions = {
    manager: PM.TRAVERSAL,
    lockfile: "none",
  }
  protected getArgs(): string[] {
    return []
  }

  protected getDependenciesTree(_pm: PM): Promise<TraversedDependency> {
    return this.buildNodeModulesTreeManually(this.rootDir)
  }

  protected async collectAllDependencies(tree: Dependency<TraversedDependency, string>, appPackageName: string) {
    for (const [, value] of Object.entries(tree.dependencies || {})) {
      this.allDependencies.set(this.packageVersionString(value), value)
      await this.collectAllDependencies(value, appPackageName)
    }
  }

  protected isProdDependency(packageName: string, tree: Dependency<TraversedDependency, string>): boolean {
    return tree.dependencies?.[packageName] != null || tree.optionalDependencies?.[packageName] != null
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<TraversedDependency> {
    return Promise.resolve(JSON.parse(jsonBlob))
  }

  /**
   * Builds a dependency tree using only package.json dependencies and optionalDependencies.
   * This skips devDependencies and uses Node.js module resolution (require.resolve).
   */
  private buildNodeModulesTreeManually(baseDir: string): Promise<TraversedDependency> {
    // Track visited packages by their resolved path to prevent infinite loops
    const visited = new Set<string>()

    /**
     * Recursively builds dependency tree starting from a package directory.
     */
    const buildFromPackage = async (packageDir: string): Promise<TraversedDependency> => {
      const pkgPath = path.join(packageDir, "package.json")

      log.debug({ pkgPath }, "building dependency node from package.json")

      if (!(await this.cache.exists[pkgPath])) {
        throw new Error(`package.json not found at ${pkgPath}`)
      }

      const pkg: PackageJson = await this.cache.packageJson[pkgPath]
      const resolvedPackageDir = await this.cache.realPath[packageDir]

      // Use resolved path as the unique identifier to prevent circular dependencies
      if (visited.has(resolvedPackageDir)) {
        log.debug({ name: pkg.name, version: pkg.version, path: resolvedPackageDir }, "skipping already visited package")

        return {
          name: pkg.name,
          version: pkg.version,
          path: resolvedPackageDir,
        }
      }

      visited.add(resolvedPackageDir)

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
            continue
          }

          log.debug(logFields, "processing production dependency")

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
  }
}
