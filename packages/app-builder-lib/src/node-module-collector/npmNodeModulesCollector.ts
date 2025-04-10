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

  protected collectAllDependencies(tree: NpmDependency) {
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      const { _dependencies = {}, dependencies = {} } = value
      const isDuplicateDep = Object.keys(_dependencies).length > 0 && Object.keys(dependencies).length === 0
      if (isDuplicateDep) {
        continue
      }
      this.allDependencies.set(`${key}@${value.version}`, value)
      this.collectAllDependencies(value)
    }
  }

  protected extractProductionDependencyGraph(tree: NpmDependency, dependencyId: string): void {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const { _dependencies: prodDependencies = {}, dependencies = {} } = tree
    const isDuplicateDep = Object.keys(prodDependencies).length > 0 && Object.keys(dependencies).length === 0
    const resolvedDeps = isDuplicateDep ? (this.allDependencies.get(dependencyId)?.dependencies ?? {}) : dependencies
    // Initialize with empty dependencies array first to mark this dependency as "in progress"
    // After initialization, if there are libraries with the same name+version later, they will not be searched recursively again
    // This will prevents infinite loops when circular dependencies are encountered.
    this.productionGraph[dependencyId] = { dependencies: [] }
    const productionDeps = Object.entries(resolvedDeps)
      .filter(([packageName]) => prodDependencies[packageName])
      .map(([packageName, dependency]) => {
        const childDependencyId = `${packageName}@${dependency.version}`
        this.extractProductionDependencyGraph(dependency, childDependencyId)
        return childDependencyId
      })
    this.productionGraph[dependencyId] = { dependencies: productionDeps }
  }

  protected parseDependenciesTree(jsonBlob: string): NpmDependency {
    return JSON.parse(jsonBlob)
  }
}
