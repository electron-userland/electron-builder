import { NodeModulesCollector } from "./nodeModulesCollector.js"
import { PM } from "./packageManager.js"
import { NpmDependency } from "./types.js"

export class NpmNodeModulesCollector extends NodeModulesCollector<NpmDependency, string> {
  public readonly installOptions = {
    manager: PM.NPM,
    lockfile: "package-lock.json",
  }

  protected getArgs(): string[] {
    return ["list", "-a", "--include", "prod", "--include", "optional", "--omit", "dev", "--json", "--long", "--silent", "--loglevel=error"]
  }

  protected async collectAllDependencies(tree: NpmDependency) {
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      if (this.isDuplicatedNpmDependency(value)) {
        continue
      }
      const normalizedDep = this.normalizePackageVersion(key, value)
      this.allDependencies.set(normalizedDep.id, normalizedDep.pkgOverride)
      await this.collectAllDependencies(value)
    }
  }

  protected async extractProductionDependencyGraph(tree: NpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const isDuplicateDep = this.isDuplicatedNpmDependency(tree)
    const targetTree = isDuplicateDep ? this.allDependencies.get(dependencyId) : tree

    // Initialize with empty dependencies array first to mark this dependency as "in progress"
    // After initialization, if there are libraries with the same name+version later, they will not be searched recursively again
    // This will prevents infinite loops when circular dependencies are encountered.
    this.productionGraph[dependencyId] = { dependencies: [] }

    const collectedDependencies: string[] = []
    if (targetTree?.dependencies) {
      for (const packageName in targetTree.dependencies) {
        // Check against matching _dependencies
        if (!this.isProdDependency(packageName, targetTree)) {
          continue
        }
        const dependency = targetTree.dependencies[packageName]
        // Match first version's empty check
        if (Object.keys(dependency).length === 0) {
          continue
        }
        const normalizedDep = this.normalizePackageVersion(packageName, dependency)
        const childDependencyId = normalizedDep.id
        await this.extractProductionDependencyGraph(normalizedDep.pkgOverride, childDependencyId)
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
}
