import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree } from "./types"
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

  deletePeerDeps(tree: DependencyTree) {
    const dependencies = tree.dependencies || {}
    for (const [key, value] of Object.entries(dependencies)) {
      const p = path.normalize(this.resolvePath(value.path))
      const pJson: DependencyTree = require(path.join(p, "package.json"))
      const peerDependencies = pJson.peerDependencies || {}
      if (peerDependencies[key]) {
        delete dependencies[key]
      }
      this.deletePeerDeps(value)
    }
  }
}
