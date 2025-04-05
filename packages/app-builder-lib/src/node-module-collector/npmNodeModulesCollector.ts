import { Lazy } from "lazy-val"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { NpmDependency } from "./types"

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

  protected extractProductionDependencyGraph(tree: NpmDependency) {
    const _deps = tree._dependencies ?? {}
    let deps = tree.dependencies ?? {}
    const newKey = `${tree.name}@${tree.version}`

    if (this.productionGraph[newKey]) {
      return
    }

    if (Object.keys(_deps).length > 0 && Object.keys(deps).length === 0) {
      deps = this.allDependencies.get(newKey)?.dependencies ?? {}
    }

    const dependencies = Object.entries(deps)
      .filter(([packageName]) => _deps[packageName])
      .map(([packageName, dependency]) => {
        const dependencyKey = `${packageName}@${dependency.version}`
        this.extractProductionDependencyGraph(dependency)
        return dependencyKey
      })

    this.productionGraph[newKey] = { dependencies }
  }

  protected parseDependenciesTree(jsonBlob: string): NpmDependency {
    return JSON.parse(jsonBlob)
  }
}
