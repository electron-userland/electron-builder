import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree, ParsedDependencyTree } from "./types"
import { log } from "builder-util"

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

  protected removeNonProductionDependencies(tree: DependencyTree): DependencyTree {

    const dependencies = tree.dependencies || {}
    const _dependencies = tree._dependencies || {}
    if (Object.keys(_dependencies).length > 0 && Object.keys(dependencies).length === 0) {
      tree.dependencies = this.allDependencies.get(`${tree.name}@${tree.version}`)?.dependencies || {}
      tree.circularDependencyDetected = true
      log.debug({ name: tree.name, version: tree.version }, "circular dependency detected")
      return tree
    }

    // eslint-disable-next-line prefer-const
    for (let [key, value] of Object.entries(dependencies)) {
      if (!_dependencies[key] || Object.keys(value).length === 0) {
        delete dependencies[key]
        continue
      }
      value = this.removeNonProductionDependencies(value)
    }
    return tree
  }

  protected parseDependenciesTree(jsonBlob: string): ParsedDependencyTree {
    const dependencyTree = JSON.parse(jsonBlob)
    return dependencyTree
  }
}
