import { Lazy } from "lazy-val"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PnpmDependency, Dependency } from "./types"
import { exec, log } from "builder-util"
import * as path from "path"
import * as fs from "fs"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  constructor(rootDir: string) {
    super(rootDir)
  }

  static readonly pmCommand = new Lazy<string>(async () => {
    if (process.platform === "win32") {
      try {
        await exec("pnpm", ["--version"])
      } catch (_error: any) {
        log.debug(null, "pnpm not detected, falling back to pnpm.cmd")
        return "pnpm.cmd"
      }
    }
    return "pnpm"
  })

  protected readonly pmCommand: Lazy<string> = PnpmNodeModulesCollector.pmCommand
  public readonly installOptions = this.pmCommand.value.then(cmd => ({ cmd, args: ["install", "--frozen-lockfile"], lockfile: "pnpm-lock.yaml" }))

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  protected extractRelevantData(npmTree: PnpmDependency): PnpmDependency {
    const tree = super.extractRelevantData(npmTree)
    return {
      ...tree,
      optionalDependencies: this.extractInternal(npmTree.optionalDependencies),
    }
  }

  extractProductionDependencyGraph(tree: PnpmDependency, isRoot: boolean = false): void {
    const newKey = isRoot ? "." : `${tree.from}@${tree.version}`
    if (this.productionGraph[newKey]) return

    const p = path.normalize(this.resolvePath(tree.path))
    const packageJson: Dependency<string, string> = require(path.join(p, "package.json"))
    const prodDependencies = { ...packageJson.dependencies, ...packageJson.optionalDependencies }

    const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    const dependencies = Object.entries(deps)
      .map(([packageName, dependency]) => {
        // check if the optional dependency's path is existing
        if (packageJson.optionalDependencies && packageJson.optionalDependencies[packageName] && !fs.existsSync(dependency.path)) {
            log.debug(null, `Dependency ${packageName}@${dependency.version} path doesn't exist: ${dependency.path}`)
            return null
        }

        if (prodDependencies[packageName]) {
          const depKey = `${packageName}@${dependency.version}`
          this.extractProductionDependencyGraph(dependency)
          return depKey
        }

        return null
      })
      .filter(Boolean) as string[]

    this.productionGraph[newKey] = { dependencies }
  }

  protected parseDependenciesTree(jsonBlob: string): PnpmDependency {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return dependencyTree[0]
  }
}
