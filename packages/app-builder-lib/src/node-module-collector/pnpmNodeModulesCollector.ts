import { log } from "builder-util"
import * as fs from "fs"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { getPackageManagerCommand, PM } from "./packageManager"
import { Dependency, PnpmDependency } from "./types"

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

    const getProductionDependencies = (tree: PnpmDependency): { packageJson: Dependency<string, string>; prodDeps: Record<string, string> } | null => {
      const p = path.normalize(this.resolvePackageDir(tree.name, tree.path) ?? this.resolvePath(tree.path))
      let packageJson: Dependency<string, string>
      try {
        packageJson = require(path.join(p, "package.json"))
      } catch (error: any) {
        log.warn(null, `Failed to read package.json for ${p}: ${error.message}`)
        return null
      }
      return { packageJson, prodDeps: { ...packageJson.dependencies, ...packageJson.optionalDependencies } }
    }

    const json = tree.name === dependencyId ? null : getProductionDependencies(tree)
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

        // Then check if optional dependency path exists
        if (json?.packageJson?.optionalDependencies?.[packageName] && !fs.existsSync(dependency.path)) {
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
