import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree, Dependency, ParsedDependencyTree } from "./types"
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

  removeNonProductionDependencies(tree: DependencyTree): DependencyTree {
    const p = path.normalize(this.resolvePath(tree.path))
    const packageJson: Dependency<string> = require(path.join(p, "package.json"))
    const prodDependencies = { ...(packageJson.dependencies || {}), ...(packageJson.optionalDependencies || {}) }
    const dependencies = Object.entries(tree.dependencies || {}).reduce<DependencyTree["dependencies"]>((acc, curr) => {
      const [packageName, dependency] = curr
      if (!prodDependencies[packageName]) {
        return acc
      }
      return {
        ...acc,
        [packageName]: this.removeNonProductionDependencies(dependency),
      }
    }, {})

    return { ...tree, dependencies }
  }

  protected parseDependenciesTree(jsonBlob: string): ParsedDependencyTree {
    const dependencyTree = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    if (Array.isArray(dependencyTree)) {
      const tree = dependencyTree[0]
      if (tree.optionalDependencies) {
        tree.dependencies = { ...tree.dependencies, ...tree.optionalDependencies }
      }
      return tree
    }
    return dependencyTree
  }
}
