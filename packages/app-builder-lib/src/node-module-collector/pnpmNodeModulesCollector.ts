import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree, Dependency } from "./types"
import * as path from "path"

export class PnpmNodeModulesCollector extends NodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  getCommand(): string {
    return process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  }

  getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  removeNonProductionDependencie(tree: DependencyTree) {
    const dependencies = tree.dependencies || {}
    const p = path.normalize(this.resolvePath(tree.path))
    const pJson: Dependency = require(path.join(p, "package.json"))
    const _dependencies = pJson.dependencies || {}
    const _optionalDependencies = pJson.optionalDependencies || {}
    const prodDependencies = { ..._dependencies, ..._optionalDependencies }
    for (const [key, value] of Object.entries(dependencies)) {
      if (!prodDependencies[key]) {
        delete dependencies[key]
        continue
      }
      this.removeNonProductionDependencie(value)
    }
  }
}
