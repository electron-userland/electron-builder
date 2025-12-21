import { isEmptyOrSpaces, log } from "builder-util"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { PackageJson, PnpmDependency } from "./types"

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
    if (isEmptyOrSpaces(packageName)) {
      log.error(depTree, `Cannot determine production dependencies for package with empty name`)
      throw new Error(`Cannot compute production dependencies for package with empty name: ${packageName}`)
    }

    const actualPath = await this.locatePackageVersion(depTree.path, packageName, depTree.version).then(it => it?.packageDir)
    const resolvedLocalPath = await this.cache.realPath[actualPath ?? depTree.path]
    const p = path.normalize(resolvedLocalPath)
    const pkgJsonPath = path.join(p, "package.json")

    let packageJson: PackageJson
    try {
      packageJson = await this.cache.packageJson[pkgJsonPath]
    } catch (error: any) {
      log.warn(null, `Failed to read package.json for ${p}: ${error.message}`)
      return { path: p, dependencies: {}, optionalDependencies: {} }
    }
    return { path: p, dependencies: { ...packageJson.dependencies }, optionalDependencies: { ...packageJson.optionalDependencies } }
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }
    this.productionGraph[dependencyId] = { dependencies: [] }

    const packageName = tree.name || tree.from

    const treeDep = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    const json = packageName === dependencyId ? null : await this.getProductionDependencies(tree)
    const prodDependencies = json ? { ...json.dependencies, ...json.optionalDependencies } : treeDep

    const collectedDependencies: string[] = []
    for (const packageName in treeDep) {
      if (!prodDependencies[packageName]) {
        continue
      }

      // Then check if optional dependency path exists (using actual resolved path)
      const version = json?.optionalDependencies?.[packageName] || tree.optionalDependencies?.[packageName]?.version
      const actualPath = await this.locatePackageVersion(json?.path ?? tree.path, packageName, version).then(it => it?.packageDir)
      if (actualPath == null || !(await this.cache.exists[actualPath])) {
        log.debug({ packageName, version: version, searchPath: actualPath }, `optional dependency not installed, skipping`)
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
    // Collect regular dependencies
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      const json = await this.getProductionDependencies(value)
      this.allDependencies.set(`${key}@${value.version}`, { ...value, path: json.path })
      await this.collectAllDependencies(value)
    }

    // Collect optional dependencies if they exist
    for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
      const json = await this.getProductionDependencies(value)
      this.allDependencies.set(`${key}@${value.version}`, { ...value, path: json.path })
      await this.collectAllDependencies(value)
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
