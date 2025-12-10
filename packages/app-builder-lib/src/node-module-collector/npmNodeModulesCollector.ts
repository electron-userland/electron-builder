import { log } from "builder-util"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector.js"
import { PM } from "./packageManager.js"
import { NpmDependency, PackageJson } from "./types.js"

export class NpmNodeModulesCollector extends NodeModulesCollector<NpmDependency, string> {
  public readonly installOptions = {
    manager: PM.NPM,
    lockfile: "package-lock.json",
  }

  protected getArgs(): string[] {
    return ["list", "-a", "--include", "prod", "--include", "optional", "--omit", "dev", "--json", "--long", "--silent"]
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
    const productionDeps = Object.entries(resolvedDeps || {})
      .filter(([packageName]) => this.isProdDependency(packageName, tree))
      .map(async ([, dependency]) => {
        const childDependencyId = this.packageVersionString(dependency)
        await this.extractProductionDependencyGraph(dependency, childDependencyId)
        return childDependencyId
      })

    const collectedDependencies: string[] = []
    for (const dep of productionDeps) {
      collectedDependencies.push(await dep)
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

  protected async parseDependenciesTree(jsonBlob: string): Promise<NpmDependency> {
    return Promise.resolve(JSON.parse(jsonBlob))
  }
}
