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
      log.error(depTree, `cannot determine production dependencies for package with empty name`)
      throw new Error(`Cannot compute production dependencies for package with empty name: ${packageName}`)
    }

    const pkg = await this.resolvePackage(packageName, depTree.path)
    const { packageDir } = (await this.locatePackageVersion(packageName, pkg || depTree.path, depTree.version)) ?? {}

    if (packageDir == null) {
      // ignore. logged further upstream if identified as an optional dependency
      return { path: depTree.path, dependencies: {}, optionalDependencies: {} }
    }

    let packageJson: PackageJson
    try {
      packageJson = await this.cache.packageJson[path.join(packageDir, "package.json")]
    } catch {
      // ignore. logged further upstream if identified as an optional dependency
      return { path: packageDir, dependencies: {}, optionalDependencies: {} }
    }

    return {
      path: packageDir,
      dependencies: { ...packageJson.dependencies },
      optionalDependencies: { ...packageJson.optionalDependencies },
    }
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const packageName = tree.name || tree.from
    const json = packageName === dependencyId ? null : await this.getProductionDependencies(tree)
    const prodDependencies = json ? { ...(json.dependencies || {}), ...(json.optionalDependencies || {}) } : { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    if (prodDependencies == null) {
      this.productionGraph[dependencyId] = { dependencies: [] }
      return
    }
    const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    this.productionGraph[dependencyId] = { dependencies: [] }
    const depPromises = Object.entries(deps).map(async ([packageName, dependency]) => {
      // First check if it's in production dependencies
      if (!prodDependencies[packageName]) {
        return undefined
      }

      // Then check if optional dependency path exists (using actual resolved path)
      if (json?.optionalDependencies?.[packageName]) {
        const actualPath = await this.locatePackageVersion(tree.path, packageName, dependency.version).then(r => r?.packageDir)
        if (!actualPath || !(await this.cache.exists[actualPath])) {
          log.debug({ packageName, version: dependency.version, searchPath: actualPath }, `optional dependency not installed, skipping`)
          return undefined
        }
      }
      const childDependencyId = this.packageVersionString(dependency)
      await this.extractProductionDependencyGraph(dependency, childDependencyId)
      return childDependencyId
    })

    const collectedDependencies: string[] = []
    for (const dep of depPromises) {
      const result = await dep
      if (result !== undefined) {
        collectedDependencies.push(result)
      }
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

  protected async parseDependenciesTree(jsonBlob: string): Promise<PnpmDependency> {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return Promise.resolve(dependencyTree[0])
  }
}
