import { log } from "builder-util"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { PackageJson, PnpmDependency } from "./types"

type ProdDep = Pick<PackageJson, "name" | "version" | "dependencies" | "optionalDependencies"> & { path: string }

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  public readonly installOptions = {
    manager: PM.PNPM,
    lockfile: "pnpm-lock.yaml",
  }

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity", "--long"]
  }

  private async getProductionDependencies(depTree: PnpmDependency): Promise<ProdDep> {
    const name = depTree.name || depTree.from
    const result = await this.locatePackageWithVersion({ ...depTree, name })
    return {
      name: result?.packageJson.name || name,
      version: result?.packageJson.version || depTree.version,
      path: result?.packageDir || path.resolve(depTree.path),
      dependencies: result?.packageJson.dependencies || {},
      optionalDependencies: result?.packageJson.optionalDependencies || {},
    }
  }

  private isProdDependencyOrInJSON(depName: string, dep: PnpmDependency, pkg: ProdDep | null): boolean {
    const prodDeps = { ...(pkg?.dependencies || {}), ...(pkg?.optionalDependencies || {}) }
    return pkg ? prodDeps[depName] != null : this.isProdDependency(depName, dep)
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }
    this.productionGraph[dependencyId] = { dependencies: [] }

    const isRoot = (tree.name || tree.from) === dependencyId
    const json = isRoot ? null : await this.getProductionDependencies(tree)

    const treeDep = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }

    const collectedDependencies: string[] = []
    for (const packageName in treeDep) {
      const dependency = treeDep[packageName]
      if (!this.isProdDependencyOrInJSON(packageName, dependency, json)) {
        continue
      }

      // Then check if optional dependency path exists (using actual resolved path)
      const version = json?.optionalDependencies?.[packageName] || tree.optionalDependencies?.[packageName]?.version
      const result = await this.locatePackageWithVersion({ name: packageName, version: version || "", path: json?.path ?? tree.path })
      if (version != null && result == null) {
        log.debug({ packageName, version: version }, `optional dependency not installed, skipping`)
        continue
      }

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
      this.allDependencies.set(`${result.name}@${result.version}`, { ...dependency, path: result.path })
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
