import { log } from "builder-util"
import * as fs from "fs"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { getPackageManagerCommand, PM } from "./packageManager"
import { Dependency, PnpmDependency } from "./types"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  public readonly installOptions = { manager: PM.PNPM, lockfile: "pnpm-lock.yaml" }

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    let packageJson: Dependency<string, string>
    try {
      const dependencyPath = await this.resolvePnpmModuleDir(tree)
      // Attempt to extract the production dependency graph
      packageJson = require(path.join(dependencyPath, "package.json"))
    } catch (error: any) {
      log.error({ error: error.message, stack: error.stack }, "node module collector threw error extracting production dependency graph")
      throw error
    }
    const prodDependencies = { ...packageJson.dependencies, ...packageJson.optionalDependencies }

    const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    this.productionGraph[dependencyId] = { dependencies: [] }
    const dependencies = Object.entries(deps)
      .filter(([packageName, dependency]) => {
        // First check if it's in production dependencies
        if (!prodDependencies[packageName]) {
          return false
        }

        // Then check if optional dependency path exists
        if (packageJson.optionalDependencies?.[packageName] && !fs.existsSync(dependency.path)) {
          log.debug({ packageName, version: dependency.version, path: dependency.path }, `optional dependency path doesn't exist`)
          return false
        }

        return true
      })
      .map(async ([packageName, dependency]) => {
        const childDependencyId = `${packageName}@${dependency.version}`
        await this.extractProductionDependencyGraph(dependency, childDependencyId)
        return childDependencyId
      })

    this.productionGraph[dependencyId] = { dependencies: await Promise.all(dependencies) }
  }

  protected async collectAllDependencies(tree: PnpmDependency): Promise<void> {
    const collect = async (deps: PnpmDependency["dependencies"] | PnpmDependency["optionalDependencies"] = {}) => {
      for (const [key, value] of Object.entries(deps)) {
        const module = {
          ...value,
          name: key,
          path: await this.resolvePnpmModuleDir(value),
        }
        this.allDependencies.set(this.moduleKeyGenerator(module), module)
        await this.collectAllDependencies(module)
      }
    }
    // Collect regular dependencies
    await collect(tree.dependencies)
    // Collect optional dependencies if they exist
    await collect(tree.optionalDependencies)
  }

  private async resolvePnpmModuleDir(pkg: PnpmDependency): Promise<string> {
    const isHoisted = await this.isHoisted.value
    if (pkg.path === this.rootDir) {
      return pkg.path
    }

    // use .from instead of .name
    const id = isHoisted ? pkg.from : `${pkg.from}@${pkg.version}`
    return super.resolveModuleDir(id, isHoisted ? this.rootDir : pkg.path)
  }

  protected parseDependenciesTree(jsonBlob: string): PnpmDependency {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return dependencyTree.map(tree => {
      return { ...tree }
    })[0]
  }
}
