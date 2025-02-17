import { hoist, type HoisterTree, type HoisterResult } from "./hoist"
import * as path from "path"
import * as fs from "fs"
import { NodeModuleInfo, DependencyTree, DependencyGraph, NpmDependency, ParsedDependencyTree, PARSED_DEPENDENCY_TREE_KEYS } from "./types"
import { exec, log, use } from "builder-util"

export abstract class NodeModulesCollector {
  private nodeModules: NodeModuleInfo[] = []
  protected dependencyPathMap: Map<string, string> = new Map()
  protected allDependencies: Map<string, ParsedDependencyTree> = new Map()

  constructor(private readonly rootDir: string) {}

  public async getNodeModules(): Promise<NodeModuleInfo[]> {
    const tree = await this.getDependenciesTree()
    const realTree = this.getTreeFromWorkspaces(tree)
    const parsedTree = this.extract(realTree)

    // this.collectAllDependencies(parsedTree)

    const productionTree = this.removeNonProductionDependencies(parsedTree)
    const dependencyGraph = this.convertToDependencyGraph(productionTree)

    const hoisterResult = hoist(this.transToHoisterTree(dependencyGraph), { check: true })
    this._getNodeModules(hoisterResult.dependencies, this.nodeModules)

    return this.nodeModules
  }

  protected abstract getCommand(): string
  protected abstract getArgs(): string[]
  protected abstract removeNonProductionDependencies(parsedTree: NpmDependency): DependencyTree
  protected abstract parseDependenciesTree(jsonBlob: string): NpmDependency

  protected async getDependenciesTree(): Promise<NpmDependency> {
    const command = this.getCommand()
    const args = this.getArgs()
    const dependencies = await exec(command, args, {
      cwd: this.rootDir,
      shell: true,
    })
    return this.parseDependenciesTree(dependencies)
  }

  protected extractDependencyTree(tree: NpmDependency): DependencyTree {
    // filter out all extraneous data and deep copy for the tree manipulation steps
    const depTree = JSON.parse(JSON.stringify(tree), (key, value) => {
      if (key === "") {
        // preset value since we can't recursively iterate without `RangeError: Maximum call stack size exceeded`
        // so we inject it here
        value.circularDependencyDetected = false
      } else if (key === "dependencies") {
        console.log(value)
      }
      return value
    })
    return depTree
  }

  private extract(npmTree: NpmDependency) {
    const { name, version, path, workspaces, dependencies, _dependencies, optionalDependencies, peerDependencies } = npmTree
    const tree: DependencyTree = {
      name,
      version,
      path,
      circularDependencyDetected: false,
    }

    const moreExtract = (deps: NpmDependency["dependencies"]) =>
      deps && Object.keys(deps).length > 0
        ? Object.entries(deps).reduce((accum, [packageName, depObjectOrVersionString]) => {
            return {
              ...accum,
              [packageName]:
                typeof depObjectOrVersionString === "object" && Object.keys(depObjectOrVersionString).length > 0
                  ? this.extract(depObjectOrVersionString as any)
                  : depObjectOrVersionString,
            }
          }, {})
        : undefined

    // only set property if existing (at minimum, it helps in Variables debugger window)
    use(workspaces, v => (tree.workspaces = v))
    use(_dependencies, v => (tree._dependencies = v))
    use(optionalDependencies, v => (tree.optionalDependencies = v))
    use(peerDependencies, v => (tree.peerDependencies = v))

    // extract subtree
    use(moreExtract(dependencies), v => (tree.dependencies = v))

    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      if (Object.keys(value.dependencies ?? {}).length > 0) {
        this.allDependencies.set(`${key}@${value.version}`, value)
      }
    }
    return tree
  }

  protected resolvePath(filePath: string) {
    try {
      const stats = fs.lstatSync(filePath)
      if (stats.isSymbolicLink()) {
        return fs.realpathSync(filePath)
      } else {
        return filePath
      }
    } catch (error: any) {
      log.debug({ message: error.message || error.stack }, "error resolving path")
      return filePath
    }
  }

  private convertToDependencyGraph(tree: DependencyTree, parentKey = "."): DependencyGraph {
    return Object.entries(tree.dependencies || {}).reduce<DependencyGraph>((acc, curr) => {
      const [packageName, dependencies] = curr
      // Skip empty dependencies (like some optionalDependencies)
      if (Object.keys(dependencies).length === 0) {
        return acc
      }
      const version = dependencies.version || ""
      const newKey = `${packageName}@${version}`
      // Map dependency details: name, version and path to the dependency tree
      this.dependencyPathMap.set(newKey, path.normalize(this.resolvePath(dependencies.path)))
      if (!acc[parentKey]) {
        acc[parentKey] = { dependencies: [] }
      }
      acc[parentKey].dependencies.push(newKey)
      if (tree.circularDependencyDetected) {
        log.debug(
          {
            dependency: packageName,
            version,
            path: dependencies.path,
            parentModule: tree.name,
            parentVersion: tree.version,
          },
          "evaluated circluar dependency; skipping dependency flattening step"
        )
        return acc
      }

      return { ...acc, ...this.convertToDependencyGraph(dependencies, newKey) }
    }, {})
  }

  private collectAllDependencies(tree: NpmDependency) {
    const dependencies = tree.dependencies || {}
    for (const [key, value] of Object.entries(dependencies)) {
      if (value.dependencies && Object.keys(value.dependencies).length > 0) {
        this.allDependencies.set(`${key}@${value.version}`, value)
        this.collectAllDependencies(value)
      }
    }
  }

  private getTreeFromWorkspaces(tree: NpmDependency): NpmDependency {
    if (tree.workspaces && tree.dependencies) {
      for (const [key, value] of Object.entries(tree.dependencies)) {
        if (this.rootDir.endsWith(path.normalize(key))) {
          return value
        }
      }
    }
    return tree
  }

  private transToHoisterTree(obj: DependencyGraph, key: string = `.`, nodes: Map<string, HoisterTree> = new Map()): HoisterTree {
    let node = nodes.get(key)
    const name = key.match(/@?[^@]+/)![0]
    if (!node) {
      node = {
        name,
        identName: name,
        reference: key.match(/@?[^@]+@?(.+)?/)![1] || ``,
        dependencies: new Set<HoisterTree>(),
        peerNames: new Set<string>([]),
      }
      nodes.set(key, node)

      for (const dep of (obj[key] || {}).dependencies || []) {
        node.dependencies.add(this.transToHoisterTree(obj, dep, nodes))
      }
    }
    return node
  }

  private _getNodeModules(dependencies: Set<HoisterResult>, result: NodeModuleInfo[]) {
    if (dependencies.size === 0) {
      return
    }

    for (const d of dependencies.values()) {
      const reference = [...d.references][0]
      const p = this.dependencyPathMap.get(`${d.name}@${reference}`)
      if (p === undefined) {
        log.debug({ name: d.name, reference }, "cannot find path for dependency")
        continue
      }
      const node: NodeModuleInfo = {
        name: d.name,
        version: reference,
        dir: p,
      }
      result.push(node)
      if (d.dependencies.size > 0) {
        node.dependencies = []
        this._getNodeModules(d.dependencies, node.dependencies)
      }
    }
    result.sort((a, b) => a.name.localeCompare(b.name))
  }
}
