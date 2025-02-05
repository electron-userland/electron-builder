import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree } from "./types"

export class NpmNodeModulesCollector extends NodeModulesCollector {
  constructor(rootDir: string) {
    super(rootDir)
  }

  getCommand(): string {
    return process.platform === "win32" ? "npm.cmd" : "npm"
  }

  getArgs(): string[] {
    return ["list", "-a", "--include", "prod", "--include", "optional", "--omit", "dev", "--json", "--long", "--silent"]
  }

  removeNonProductionDependencie(tree: DependencyTree) {
    const dependencies = tree.dependencies || {}
    const _dependencies = tree._dependencies || {}
    for (const [key, value] of Object.entries(dependencies)) {
      if (!_dependencies[key]) {
        delete dependencies[key]
        continue
      }
      this.removeNonProductionDependencie(value)
    }
  }
}
