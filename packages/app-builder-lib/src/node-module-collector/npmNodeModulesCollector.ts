import { Lazy } from "lazy-val"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { DependencyTree, NpmDependency, ParsedDependencyTree } from "./types"
import { log } from "builder-util"

export class NpmNodeModulesCollector extends NodeModulesCollector<NpmDependency, string> {
  constructor(rootDir: string) {
    super(rootDir)
  }

  public readonly pmCommand = new Lazy<string>(() => Promise.resolve(process.platform === "win32" ? "npm.cmd" : "npm"))
  public readonly installOptions = this.pmCommand.value.then(cmd => ({ cmd, args: ["ci"], lockfile: "package-lock.json" }))

  protected getArgs(): string[] {
    return ["list", "-a", "--include", "prod", "--include", "optional", "--omit", "dev", "--json", "--long", "--silent"]
  }

  protected extractRelevantData(npmTree: NpmDependency): NpmDependency {
    const tree = super.extractRelevantData(npmTree)
    const { optionalDependencies, _dependencies } = npmTree
    return { ...tree, optionalDependencies, _dependencies }
  }

  protected extractProductionDependencyTree(tree: NpmDependency): DependencyTree {
    const _deps = tree._dependencies ?? {}

    let deps = tree.dependencies ?? {}
    let implicitDependenciesInjected = false

    if (Object.keys(_deps).length > 0 && Object.keys(deps).length === 0) {
      log.debug({ name: tree.name, version: tree.version }, "injecting implicit _dependencies")
      deps = this.allDependencies.get(`${tree.name}@${tree.version}`)?.dependencies ?? {}
      implicitDependenciesInjected = true
    }

    const dependencies = Object.entries(deps).reduce<DependencyTree["dependencies"]>((acc, curr) => {
      const [packageName, dependency] = curr
      if (!_deps[packageName] || Object.keys(dependency).length === 0) {
        return acc
      }
      if (implicitDependenciesInjected) {
        const { name, version, path, workspaces } = dependency
        const simplifiedTree: ParsedDependencyTree = { name, version, path, workspaces }
        return {
          ...acc,
          [packageName]: { ...simplifiedTree, implicitDependenciesInjected },
        }
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
      implicitDependenciesInjected,
    }
    return depTree
  }

  protected parseDependenciesTree(jsonBlob: string): NpmDependency {
    return JSON.parse(jsonBlob)
  }
}
