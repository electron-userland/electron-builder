import { Lazy } from "lazy-val"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency } from "./types"
import * as path from "path"
import * as os from "os"

export const NPM_LIST_ARGS = ["list", "-a", "--include", "prod", "--include", "optional", "--omit", "dev", "--json", "--long", "--silent"]
export class NpmNodeModulesCollector extends NodeModulesCollector<NpmDependency, string> {
  public readonly installOptions = {
    manager: PM.NPM,
    lockfile: "package-lock.json",
  }

  protected getArgs(): string[] {
    return NPM_LIST_ARGS
  }

  protected async collectAllDependencies(tree: NpmDependency) {
    for (const [, value] of Object.entries(tree.dependencies || {})) {
      const { _dependencies = {}, dependencies = {} } = value
      const isDuplicateDep = Object.keys(_dependencies).length > 0 && Object.keys(dependencies).length === 0
      if (isDuplicateDep) {
        continue
      }
      this.allDependencies.set(this.moduleKeyGenerator(value), value)
      await this.collectAllDependencies(value)
    }
  }

  protected async extractProductionDependencyGraph(tree: NpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const { _dependencies: prodDependencies = {}, dependencies = {} } = tree
    const isDuplicateDep = Object.keys(prodDependencies).length > 0 && Object.keys(dependencies).length === 0
    const resolvedDeps = isDuplicateDep ? (this.allDependencies.get(dependencyId)?.dependencies ?? {}) : dependencies
    // Initialize with empty dependencies array first to mark this dependency as "in progress"
    // After initialization, if there are libraries with the same name+version later, they will not be searched recursively again
    // This will prevents infinite loops when circular dependencies are encountered.
    this.productionGraph[dependencyId] = { dependencies: [] }
    const productionDeps = Object.entries(resolvedDeps)
      .filter(([packageName]) => prodDependencies[packageName])
      .map(async ([, dependency]) => {
        const childDependencyId = this.moduleKeyGenerator(dependency)
        const dep = {
          ...dependency,
          name: dependency.name,
          path: await this.resolveModuleDir(dependency.name, dependency.path),
        }
        await this.extractProductionDependencyGraph(dep, childDependencyId)
        return childDependencyId
      })
    this.productionGraph[dependencyId] = { dependencies: await Promise.all(productionDeps) }
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<NpmDependency> {
    return Promise.resolve(JSON.parse(jsonBlob))
  }
}
