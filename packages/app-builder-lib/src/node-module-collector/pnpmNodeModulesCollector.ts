import { log } from "builder-util"
import * as fs from "fs"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { Dependency, PnpmDependency } from "./types"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  constructor(rootDir: string) {
    super(rootDir)
  }

  public readonly installOptions = { manager: PM.PNPM, lockfile: "pnpm-lock.yaml" }

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string): void {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const p = path.normalize(this.resolvePath(tree.path))
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
        if (packageJson.optionalDependencies && packageJson.optionalDependencies[packageName] && !fs.existsSync(dependency.path)) {
          log.debug(null, `Optional dependency ${packageName}@${dependency.version} path doesn't exist: ${dependency.path}`)
          return false
        }

        return true
      })
      .map(([packageName, dependency]) => {
        const childDependencyId = `${packageName}@${dependency.version}`
        this.extractProductionDependencyGraph(dependency, childDependencyId)
        return childDependencyId
      })

    this.productionGraph[dependencyId] = { dependencies }
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
