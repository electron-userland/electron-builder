import { NodeModulesCollector } from "./nodeModulesCollector.js"
import { PM } from "./packageManager.js"
import { NpmDependency } from "./types.js"

export class NpmNodeModulesCollector extends NodeModulesCollector<NpmDependency, string> {
  public readonly installOptions = {
    manager: PM.NPM,
    lockfile: "package-lock.json",
  }

  protected getArgs(): string[] {
    return ["list", "-a", "--include", "prod", "--include", "optional", "--omit", "dev", "--json", "--long", "--silent"]
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

  // `npm list` provides explicit list of deps in _dependencies
  protected isProdDependency(packageName: string, tree: NpmDependency) {
    return tree._dependencies?.[packageName] != null
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<NpmDependency> {
    return Promise.resolve(JSON.parse(jsonBlob))
  }
}
