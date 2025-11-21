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
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const getProductionDependencies = async (depTree: PnpmDependency): Promise<{ prodDeps: Record<string, string>; optionalDependencies: Record<string, string> } | null> => {
      const packageName = depTree.name || depTree.from
      if (isEmptyOrSpaces(packageName)) {
        log.error(depTree, `Cannot determine production dependencies for package with empty name`)
        throw new Error(`Cannot compute production dependencies for package with empty name: ${packageName}`)
      }

      const p = path.normalize((await this.resolvePackageDir(packageName, depTree.path)) ?? (await this.resolvePath(depTree.path)))
      const pkgJsonPath = path.join(p, "package.json")

      let packageJson: PackageJson
      try {
        packageJson = this.requireMemoized(pkgJsonPath)
      } catch (error: any) {
        log.warn(null, `Failed to read package.json for ${p}: ${error.message}`)
        return null
      }
      return { prodDeps: { ...packageJson.dependencies, ...packageJson.optionalDependencies }, optionalDependencies: { ...packageJson.optionalDependencies } }
    }

    const packageName = tree.name || tree.from
    const json = packageName === dependencyId ? null : await getProductionDependencies(tree)
    const prodDependencies = json?.prodDeps ?? { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    if (prodDependencies == null) {
      this.productionGraph[dependencyId] = { dependencies: [] }
      return
    }
    const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    this.productionGraph[dependencyId] = { dependencies: [] }
    const depPromises = Object.entries(deps)
      .filter(([packageName, dependency]) => {
        // First check if it's in production dependencies
        if (!prodDependencies[packageName]) {
          return false
        }

        // Then check if optional dependency path exists (using memoized version)
        if (json?.optionalDependencies?.[packageName] && !this.existsSyncMemoized(dependency.path)) {
          log.debug(null, `Optional dependency ${packageName}@${dependency.version} path doesn't exist: ${dependency.path}`)
          return false
        }

        return true
      })
      .map(async ([, dependency]) => {
        const childDependencyId = this.packageVersionString(dependency)
        await this.extractProductionDependencyGraph(dependency, childDependencyId)
        return childDependencyId
      })

    const dependencies = await Promise.all(depPromises)
    this.productionGraph[dependencyId] = { dependencies }
  }

  protected async collectAllDependencies(tree: PnpmDependency) {
    // Collect regular dependencies
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      this.allDependencies.set(`${key}@${value.version}`, value)
      await this.collectAllDependencies(value)
    }

    // Collect optional dependencies if they exist
    for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
      this.allDependencies.set(`${key}@${value.version}`, value)
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
