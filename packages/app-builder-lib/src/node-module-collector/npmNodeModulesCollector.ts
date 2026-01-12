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
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      if (this.isDuplicatedNpmDependency(value)) {
        continue
      }

      // Skip dependencies without a valid path (e.g., uninstalled optional dependencies)
      // This commonly happens with platform-specific optional deps like sharp's native bindings
      if (!value.path || !value.version) {
        log.debug({ name: value.name, version: value.version, path: value.path }, "dependency missing path or version, skipping")
        continue
      }

      // Check if the dependency path actually exists
      const realPath = await this.cache.realPath[value.path].catch(() => null)
      if (!realPath || !(await this.cache.exists[realPath])) {
        log.debug({ name: value.name, version: value.version, path: value.path }, "dependency path does not exist, skipping (likely uninstalled optional dependency)")
        continue
      }

      // Use the key (alias name) instead of value.name for npm aliased packages
      // e.g., { "foo": { name: "@scope/bar", ... } } should be stored as "foo@version"
      // This ensures aliased packages are copied to the correct location in node_modules
      const normalizedDep: NpmDependency = key !== value.name ? { ...value, name: key } : value
      this.allDependencies.set(this.packageVersionString(normalizedDep), normalizedDep)
      await this.collectAllDependencies(value)
    }
  }

  protected async extractProductionDependencyGraph(tree: NpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const isDuplicateDep = this.isDuplicatedNpmDependency(tree)
    // When dealing with duplicate/hoisted deps, get the full dependency info from allDependencies
    const resolvedTree = isDuplicateDep ? this.allDependencies.get(dependencyId) : tree
    const resolvedDeps = resolvedTree?.dependencies
    // Initialize with empty dependencies array first to mark this dependency as "in progress"
    // After initialization, if there are libraries with the same name+version later, they will not be searched recursively again
    // This will prevents infinite loops when circular dependencies are encountered.
    this.productionGraph[dependencyId] = { dependencies: [] }

    const collectedDependencies: string[] = []
    if (resolvedDeps && Object.keys(resolvedDeps).length > 0) {
      for (const packageName in resolvedDeps) {
        // Use resolvedTree for isProdDependency check since it has the actual dependencies
        // (tree might have empty dependencies if it's a hoisted duplicate)
        if (!resolvedTree || !this.isProdDependency(packageName, resolvedTree)) {
          continue
        }
        const dependency = resolvedDeps[packageName]
        // Use the key (alias name) for aliased packages to match how they're stored in allDependencies
        const normalizedName = packageName !== dependency.name ? packageName : dependency.name
        const childDependencyId = `${normalizedName}@${dependency.version}`

        if (!this.allDependencies.has(childDependencyId)) {
          log.debug({ name: normalizedName, version: dependency.version }, "dependency not in allDependencies, skipping (likely uninstalled optional dependency)")
          continue
        }

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
     * @param packageDir - The directory of the package to process
     * @param aliasName - Optional alias name for npm aliased dependencies (e.g., "foo": "npm:@scope/bar@1.0.0")
     *                    When provided, this name is used instead of the package.json name for the module name,
     *                    ensuring the package is copied to the correct location in node_modules.
     */
    const buildFromPackage = async (packageDir: string, aliasName?: string): Promise<NpmDependency> => {
      const pkgPath = path.join(packageDir, "package.json")

      log.debug({ pkgPath }, "building dependency node from package.json")

      if (!(await this.cache.exists[pkgPath])) {
        throw new Error(`package.json not found at ${pkgPath}`)
      }

      const pkg: PackageJson = await this.cache.packageJson[pkgPath]
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
            log.warn({ package: moduleName, dependency: depName, version: depVersion }, "dependency not found, skipping")
            continue
          }

          const resolvedDepPath = await this.cache.realPath[depPath.packageDir]
          const logFields = { package: moduleName, dependency: depName, resolvedPath: resolvedDepPath }

          // Skip if this dependency resolves to the base directory or any parent we're already processing
          if (resolvedDepPath === resolvedPackageDir || resolvedDepPath === (await this.cache.realPath[baseDir])) {
            log.debug(logFields, "skipping self-referential dependency")
            continue
          }

          log.debug(logFields, "processing production dependency")

          // Recursively build the dependency tree for this dependency
          // Pass depName as the alias - it will be used as the module name if different from the actual package name
          prodDeps[depName] = await buildFromPackage(resolvedDepPath, depName)
        } catch (error: any) {
          log.warn({ package: moduleName, dependency: depName, error: error.message }, "failed to process dependency, skipping")
        }
      }

      return {
        name: moduleName,
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
