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

  protected extractProductionDependencyGraph(tree: NpmDependency, isRoot: boolean = false): void {
    const newKey = isRoot ? "." : `${tree.name}@${tree.version}`
    if (this.productionGraph[newKey]) return

    const { _dependencies = {}, dependencies = {} } = tree
    const isDuplicateDep = Object.keys(_dependencies).length > 0 && Object.keys(dependencies).length === 0
    const resolvedDeps = isDuplicateDep ? (this.allDependencies.get(newKey)?.dependencies ?? {}) : dependencies
    // don't delete this, it's used to prevent infinite loops
    this.productionGraph[newKey] = { dependencies: [] }
    const productionDeps = Object.entries(resolvedDeps)
      .filter(([pkg]) => _dependencies[pkg])
      .map(([pkg, dep]) => {
        const depKey = `${pkg}@${dep.version}`
        this.extractProductionDependencyGraph(dep)
        return depKey
      })
    this.productionGraph[newKey] = { dependencies: productionDeps }
  }

  protected parseDependenciesTree(jsonBlob: string): NpmDependency {
    return JSON.parse(jsonBlob)
  }
}
