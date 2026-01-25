import { isEmptyOrSpaces, log } from "builder-util"
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
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  private async resolveActualPath(depTree: PnpmDependency): Promise<string> {
    // If using hoisted mode, try to find the package at the hoisted location first
    if (await this.isHoisted.value) {
      const packageName = depTree.name || depTree.from
      if (packageName) {
        const hoistedPath = path.join(this.rootDir, "node_modules", packageName)
        if (await this.cache.exists[hoistedPath]) {
          return hoistedPath
        }
      }
    }
    // Fall back to the reported path (which might be the .pnpm store path)
    return depTree.path
  }

  private async getProductionDependencies(depTree: PnpmDependency): Promise<{ path: string; prodDeps: Record<string, string>; optionalDependencies: Record<string, string> }> {
    const packageName = depTree.name || depTree.from
    if (isEmptyOrSpaces(packageName)) {
      log.error(depTree, `Cannot determine production dependencies for package with empty name`)
      throw new Error(`Cannot compute production dependencies for package with empty name: ${packageName}`)
    }

    const actualPath = await this.resolveActualPath(depTree)
    const resolvedLocalPath = await this.cache.realPath[actualPath]
    const p = path.normalize(resolvedLocalPath)
    const pkgJsonPath = path.join(p, "package.json")

    const packageJson = await this.cache.json[pkgJsonPath]
    if (packageJson == null) {
      return { path: p, prodDeps: {}, optionalDependencies: {} }
    }
    return { path: p, prodDeps: { ...packageJson.dependencies, ...packageJson.optionalDependencies }, optionalDependencies: { ...packageJson.optionalDependencies } }
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const packageName = tree.name || tree.from
    const json = packageName === dependencyId ? null : await this.getProductionDependencies(tree)
    const prodDependencies = json?.prodDeps ?? { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
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
        const actualPath = await this.resolveActualPath(dependency)
        if (!(await this.cache.exists[actualPath])) {
          log.debug(null, `Optional dependency ${packageName}@${dependency.version} path doesn't exist: ${actualPath}`)
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
      const json = await this.getProductionDependencies({ ...value, name: key })
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

  protected parseDependenciesTree(jsonBlob: string): PnpmDependency {
    // pnpm returns an array of dependency trees
    const dependencyTree: PnpmDependency[] = this.extractJsonFromPollutedOutput<PnpmDependency[]>(jsonBlob)
    return dependencyTree[0]
  }
}
