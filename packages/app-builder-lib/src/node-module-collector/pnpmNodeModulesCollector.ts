import { LogMessageByKey } from "./moduleManager"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { PnpmDependency } from "./types"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  public readonly installOptions = {
    manager: PM.PNPM,
    lockfile: "pnpm-lock.yaml",
  }

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity", "--silent", "--loglevel=error"]
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string) {
    if (this.productionGraph[dependencyId]) {
      return
    }
    this.productionGraph[dependencyId] = { dependencies: [] }

    if ((tree.dedupedDependenciesCount ?? 0) > 0) {
      const realDep = this.allDependencies.get(dependencyId)
      if (realDep) {
        this.cache.logSummary[LogMessageByKey.PKG_DUPLICATE_REF].push(dependencyId)
        tree = realDep
      } else {
        this.cache.logSummary[LogMessageByKey.PKG_DUPLICATE_REF_UNRESOLVED].push(dependencyId)
        return
      }
    }

    const packageName = tree.name || tree.from
    const { packageJson } = (await this.cache.locatePackageVersion({ pkgName: packageName, parentDir: this.rootDir, requiredRange: tree.version })) || {}

    const all = packageJson ? { ...packageJson.dependencies, ...packageJson.optionalDependencies } : { ...tree.dependencies, ...tree.optionalDependencies }
    const optional = packageJson ? { ...packageJson.optionalDependencies } : {}

    const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    this.productionGraph[dependencyId] = { dependencies: [] }
    const depPromises = Object.entries(deps).map(async ([packageName, dependency]) => {
      // First check if it's in production dependencies
      if (!all[packageName]) {
        return undefined
      }

      // Then check if optional dependency path exists (using actual resolved path)
      if (optional[packageName]) {
        const pkg = await this.cache.locatePackageVersion({ pkgName: packageName, parentDir: this.rootDir, requiredRange: dependency.version })
        if (!pkg) {
          this.cache.logSummary[LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED].push(`${packageName}@${dependency.version}`)
          return undefined
        }
      }
      const { id: childDependencyId, pkgOverride } = this.normalizePackageVersion(packageName, dependency)
      await this.extractProductionDependencyGraph(pkgOverride, childDependencyId)
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
      if (value?.dedupedDependenciesCount && value.dedupedDependenciesCount > 0) {
        continue
      }
      const pkg = await this.cache.locatePackageVersion({ pkgName: key, parentDir: this.rootDir, requiredRange: value.version })
      this.allDependencies.set(`${key}@${value.version}`, { ...value, path: pkg?.packageDir ?? value.path })
      await this.collectAllDependencies(value)
    }

    // Collect optional dependencies if they exist
    for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
      if (value?.dedupedDependenciesCount && value.dedupedDependenciesCount > 0) {
        continue
      }
      const pkg = await this.cache.locatePackageVersion({ pkgName: key, parentDir: this.rootDir, requiredRange: value.version })
      this.allDependencies.set(`${key}@${value.version}`, { ...value, path: pkg?.packageDir ?? value.path })
      await this.collectAllDependencies(value)
    }
  }

  protected parseDependenciesTree(jsonBlob: string): PnpmDependency {
    // pnpm returns an array of dependency trees
    const dependencyTree: PnpmDependency[] = this.extractJsonFromPollutedOutput<PnpmDependency[]>(jsonBlob)
    return dependencyTree[0]
  }
}
