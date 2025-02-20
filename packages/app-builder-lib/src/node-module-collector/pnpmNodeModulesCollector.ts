import { NodeModulesCollector } from "./nodeModulesCollector"
import { Dependency, DependencyTree, PnpmDependency } from "./types"
import * as path from "path"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  constructor(rootDir: string) {
    super(rootDir)
  }

  getCommand(): string {
    return process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  }

  getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  protected extractRelevantData(npmTree: PnpmDependency): PnpmDependency {
    const tree = super.extractRelevantData(npmTree)
    return {
      ...tree,
      optionalDependencies: this.extractInternal(npmTree.optionalDependencies),
    }
  }

  extractProductionDependencyTree(tree: PnpmDependency): DependencyTree {
    const p = path.normalize(this.resolvePath(tree.path))
    const packageJson: Dependency<string, string> = require(path.join(p, "package.json"))
    const prodDependencies = { ...(packageJson.dependencies || {}), ...(packageJson.optionalDependencies || {}) }

    const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    const dependencies = Object.entries(deps).reduce<DependencyTree["dependencies"]>((acc, curr) => {
      const [packageName, dependency] = curr
      if (!prodDependencies[packageName]) {
        return acc
      }
      return {
        ...acc,
        [packageName]: this.extractProductionDependencyTree(dependency),
      }
    }, {})

    const { name, version, path: packagePath, workspaces } = tree
    const depTree: DependencyTree = {
      name,
      version,
      path: packagePath,
      workspaces,
      dependencies,
      implicitDependenciesInjected: false,
    }
    return depTree
  }

  protected parseDependenciesTree(jsonBlob: string): PnpmDependency {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return dependencyTree[0]
  }
}
