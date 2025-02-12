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
    if (Object.keys(_dependencies).length > 0 && Object.keys(dependencies).length === 0) {
      tree.dependencies = this.allDependencies.get(`${tree.name}@${tree.version}`)?.dependencies || {}
      tree.skipCircularDeps = true
      return
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
