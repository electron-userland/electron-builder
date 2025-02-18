import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree, NpmDependency, ParsedDependencyTree } from "./types"
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
    const _deps = tree._dependencies ?? {}
    const deps = tree.dependencies ?? {}
    if (Object.keys(_deps).length > 0 && Object.keys(deps).length === 0) {
      tree.dependencies = this.allDependencies.get(`${tree.name}@${tree.version}`)?.dependencies
      tree.implicitDependenciesInjected = true
      log.debug({ name: tree.name, version: tree.version }, "injecting implicit _dependencies")
      return tree
    }

    const dependencies = Object.entries(tree.dependencies || {}).reduce<DependencyTree["dependencies"]>((acc, curr) => {
      const [packageName, dependency] = curr
      if (!_deps[packageName] || Object.keys(dependency).length === 0) {
        return acc
      }
      if (tree.implicitDependenciesInjected) {
        const { name, version, path } = dependency
        const simplifiedTree: ParsedDependencyTree = { name, version, path }
        return {
          ...acc,
          [packageName]: { ...simplifiedTree, implicitDependenciesInjected: true },
        }
      }
      return {
        ...acc,
        [packageName]: this.removeNonProductionDependencies(dependency),
      }
    }, {})

    return { ...tree, dependencies }
  }

  protected parseDependenciesTree(jsonBlob: string): NpmDependency {
    return JSON.parse(jsonBlob)
  }
}
