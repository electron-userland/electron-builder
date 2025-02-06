import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree } from "./types"

export class YarnNodeModulesCollector extends NodeModulesCollector {
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
    if (dependencies && Object.keys(dependencies).length === 0) {
      tree.dependencies = this.allDependencies.get(`${tree.name}@${tree.version}`)?.dependencies || {}
    }

    for (const [key, value] of Object.entries(dependencies)) {
      if (!_dependencies[key] || Object.keys(value).length === 0) {
        delete dependencies[key]
        continue
      }
      this.removeNonProductionDependencie(value)
    }
  }
}
