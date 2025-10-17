import { log } from "builder-util"
import * as fs from "fs"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { getPackageManagerCommand, PM } from "./packageManager"
import { Dependency, PnpmDependency } from "./types"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  static async isPnpmProjectHoisted(rootDir: string) {
    const command = getPackageManagerCommand(PM.PNPM)
    const config = await NodeModulesCollector.safeExec(command, ["config", "list"], rootDir)
    const lines = Object.fromEntries(config.split("\n").map(line => line.split("=").map(s => s.trim())))
    return lines["node-linker"] === "hoisted"
  }

  public readonly installOptions = { manager: PM.PNPM, lockfile: "pnpm-lock.yaml" }

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const isHoisted = await this.isProjectHoisted()
    const p = this.resolveModuleDir(dependencyId, (isHoisted) ? this.rootDir : tree.path)
    const packageJson: Dependency<string, string> = require(path.join(p, "package.json"))
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
        const childDependencyId = isHoisted ? packageName : `${packageName}@${dependency.version}`
        await this.extractProductionDependencyGraph(dependency, childDependencyId)
        return childDependencyId
      })

    this.productionGraph[dependencyId] = { dependencies: await Promise.all(dependencies) }
  }

  protected collectAllDependencies(tree: PnpmDependency) {
    // Collect regular dependencies
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      this.allDependencies.set(`${key}@${value.version}`, value)
      this.collectAllDependencies(value)
    }

    // Collect optional dependencies if they exist
    for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
      this.allDependencies.set(`${key}@${value.version}`, value)
      this.collectAllDependencies(value)
    }
  }

  protected parseDependenciesTree(jsonBlob: string): PnpmDependency {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return dependencyTree[0]
  }
}
