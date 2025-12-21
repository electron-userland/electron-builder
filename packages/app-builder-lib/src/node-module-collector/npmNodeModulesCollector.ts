import { log } from "builder-util"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency, PackageJson } from "./types"

export class NpmNodeModulesCollector extends NodeModulesCollector<NpmDependency, string> {
  public readonly installOptions = {
    manager: PM.NPM,
    lockfile: "package-lock.json",
  }

  protected getArgs(): string[] {
    return ["list", "-a", "--include", "prod", "--include", "optional", "--omit", "dev", "--json", "--long", "--silent"]
  }

  protected async getDependenciesTree(pm: PM): Promise<NpmDependency> {
    try {
      return await super.getDependenciesTree(pm)
    } catch (error: any) {
      log.info({ pm: this.installOptions.manager, parser: PM.NPM, error: error.message }, "unable to process dependency tree, falling back to using manual node_modules traversal")
    }
    // node_modules linker fallback. (Slower due to system ops, so we only use it as a fallback) [such as when corepack env will not allow npm CLI to extract tree]
    return this.buildNodeModulesTreeManually(this.rootDir)
  }

  protected async collectAllDependencies(tree: NpmDependency) {
    for (const [, value] of Object.entries(tree.dependencies || {})) {
      if (this.isDuplicatedNpmDependency(value)) {
        continue
      }
      this.allDependencies.set(this.packageVersionString(value), value)
      await this.collectAllDependencies(value)
    }
  }

  protected async extractProductionDependencyGraph(tree: NpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const isDuplicateDep = this.isDuplicatedNpmDependency(tree)
    const resolvedDeps = isDuplicateDep ? this.allDependencies.get(dependencyId)?.dependencies : tree.dependencies
    // Initialize with empty dependencies array first to mark this dependency as "in progress"
    // After initialization, if there are libraries with the same name+version later, they will not be searched recursively again
    // This will prevents infinite loops when circular dependencies are encountered.
    this.productionGraph[dependencyId] = { dependencies: [] }

    const collectedDependencies: string[] = []
    if (resolvedDeps && Object.keys(resolvedDeps).length > 0) {
      for (const packageName in resolvedDeps) {
        if (!this.isProdDependency(packageName, tree)) {
          continue
        }
        const dependency = resolvedDeps[packageName]
        const childDependencyId = this.packageVersionString(dependency)
        await this.extractProductionDependencyGraph(dependency, childDependencyId)
        collectedDependencies.push(childDependencyId)
      }
    }
    this.productionGraph[dependencyId] = { dependencies: collectedDependencies }
  }

  // Check: is package already included as a prod dependency due to another package?
  // We need to check this to prevent infinite loops in case of duplicated dependencies
  private isDuplicatedNpmDependency(tree: NpmDependency): boolean {
    const { _dependencies = {}, dependencies = {} } = tree
    const isDuplicateDep = Object.keys(_dependencies).length > 0 && Object.keys(dependencies).length === 0
    return isDuplicateDep
  }

  protected isProdDependency(packageName: string, tree: NpmDependency) {
    return tree._dependencies?.[packageName] != null
  }

  /**
   * Builds a dependency tree using only package.json dependencies and optionalDependencies.
   * This skips devDependencies and uses Node.js module resolution (require.resolve).
   */
  protected buildNodeModulesTreeManually(baseDir: string): Promise<NpmDependency> {
    // Track visited packages by their resolved path to prevent infinite loops
    const visited = new Set<string>()

    /**
     * Recursively builds dependency tree starting from a package directory.
     */
    const buildFromPackage = async (packageDir: string): Promise<NpmDependency> => {
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

      const prodDeps: Record<string, NpmDependency> = {}
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

  protected async parseDependenciesTree(jsonBlob: string): Promise<NpmDependency> {
    return Promise.resolve(JSON.parse(jsonBlob))
  }
}
