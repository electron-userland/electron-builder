import { log } from "builder-util"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { PnpmDependency } from "./types"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  public readonly installOptions = {
    manager: PM.PNPM,
    lockfile: "pnpm-lock.yaml",
  }

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity", "--long"]
  }

  private async getProductionDependencies(depTree: PnpmDependency): Promise<{ path: string; dependencies: Record<string, string>; optionalDependencies: Record<string, string> }> {
    const packageName = depTree.name || depTree.from

    const result = await this.cache.locatePackageVersion({ parentDir: depTree.path, pkgName: packageName, requiredRange: depTree.version })
    if (result == null) {
      return { path: path.resolve(depTree.path), dependencies: {}, optionalDependencies: {} }
    }

    const { dependencies, optionalDependencies } = result.packageJson
    return { path: result.packageDir, dependencies: { ...dependencies }, optionalDependencies: { ...optionalDependencies } }
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }
    this.productionGraph[dependencyId] = { dependencies: [] }

    const packageName = tree.name || tree.from

    const treeDep = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    const isRoot = packageName === dependencyId
    const json = isRoot ? null : await this.getProductionDependencies(tree)
    const prodDependencies = json ? { ...json.dependencies, ...json.optionalDependencies } : treeDep

    const collectedDependencies: string[] = []
    for (const packageName in treeDep) {
      // First check if it's a production dependency
      if (!prodDependencies[packageName]) {
        continue
      }
      // Then check if optional dependency path exists (using actual resolved path)
      const version = json?.optionalDependencies?.[packageName] || tree.optionalDependencies?.[packageName]?.version
      // execute function in if-statement so that we only search when we know it's an optional dependency
      if (version != null && (await this.locatePackageWithVersion({ name: packageName, version, path: json?.path ?? tree.path })) == null) {
        log.debug({ packageName, version: version }, `optional dependency not installed, skipping`)
        continue
      }

      const dependency = treeDep[packageName]
      const childDependencyId = this.packageVersionString(dependency)
      await this.extractProductionDependencyGraph(dependency, childDependencyId)
      collectedDependencies.push(childDependencyId)
    }
    this.productionGraph[dependencyId] = { dependencies: collectedDependencies }
  }

  protected async collectAllDependencies(tree: PnpmDependency) {
    const allDeps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    for (const packageName in allDeps) {
      const dependency = allDeps[packageName]
      const result = await this.getProductionDependencies({ ...dependency, name: packageName })
      this.allDependencies.set(this.packageVersionString(dependency), { ...dependency, path: result.path })
      await this.collectAllDependencies(dependency)
    }
  }

  protected packageVersionString(pkg: PnpmDependency): string {
    // we use 'from' field because 'name' may be different in case of aliases
    return `${pkg.from}@${pkg.version}`
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<PnpmDependency> {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return Promise.resolve(dependencyTree[0])
  }
}
