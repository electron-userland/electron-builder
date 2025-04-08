import { Lazy } from "lazy-val"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PnpmDependency } from "./types"
import { exec, log } from "builder-util"

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

    const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    const dependencies = Object.entries(deps).map(([packageName, dependency]) => {
      const depKey = `${packageName}@${dependency.version}`
      this.extractProductionDependencyGraph(dependency)
      return depKey
    })

    this.productionGraph[newKey] = { dependencies }
  }

  protected parseDependenciesTree(jsonBlob: string): PnpmDependency {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return dependencyTree[0]
  }
}
