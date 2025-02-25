import { hoist, type HoisterTree, type HoisterResult } from "./hoist"
import * as path from "path"
import * as fs from "fs"
import type { NodeModuleInfo, DependencyTree, DependencyGraph, Dependency } from "./types"
import { exec, log } from "builder-util"
import { Lazy } from "lazy-val"

export abstract class NodeModulesCollector<T extends Dependency<T, OptionalsType>, OptionalsType> {
  private nodeModules: NodeModuleInfo[] = []
  protected dependencyPathMap: Map<string, string> = new Map()
  protected allDependencies: Map<string, T> = new Map()

  constructor(private readonly rootDir: string) {}

  public async getNodeModules(): Promise<NodeModuleInfo[]> {
    const tree: T = await this.getDependenciesTree()
    const realTree: T = this.getTreeFromWorkspaces(tree)
    const parsedTree: Dependency<T, OptionalsType> = this.extractRelevantData(realTree)

    this.collectAllDependencies(parsedTree)

    const productionTree: DependencyTree = this.extractProductionDependencyTree(parsedTree)
    const dependencyGraph: DependencyGraph = this.convertToDependencyGraph(productionTree)

    const hoisterResult: HoisterResult = hoist(this.transToHoisterTree(dependencyGraph), { check: true })
    this._getNodeModules(hoisterResult.dependencies, this.nodeModules)

    return this.nodeModules
  }

  public abstract readonly installOptions: Promise<{
    cmd: string
    args: string[]
    lockfile: string
  }>
  protected abstract readonly pmCommand: Lazy<string>
  protected abstract getArgs(): string[]
  protected abstract parseDependenciesTree(jsonBlob: string): T
  protected abstract extractProductionDependencyTree(tree: Dependency<T, OptionalsType>): DependencyTree

  protected async getDependenciesTree(): Promise<T> {
    const command = await this.pmCommand.value
    const args = this.getArgs()
    const dependencies = await exec(command, args, {
      cwd: this.rootDir,
      shell: true,
    })
    return this.parseDependenciesTree(dependencies)
  }

  protected extractRelevantData(npmTree: T): Dependency<T, OptionalsType> {
    // Do not use `...npmTree` as we are explicitly extracting the data we need
    const { name, version, path, workspaces, dependencies } = npmTree
    const tree: Dependency<T, OptionalsType> = {
      name,
      version,
      path,
      workspaces,
      // DFS extract subtree
      dependencies: this.extractInternal(dependencies),
    }

    return tree
  }

  protected extractInternal(deps: T["dependencies"]): T["dependencies"] {
    return deps && Object.keys(deps).length > 0
      ? Object.entries(deps).reduce((accum, [packageName, depObjectOrVersionString]) => {
          return {
            ...accum,
            [packageName]:
              typeof depObjectOrVersionString === "object" && Object.keys(depObjectOrVersionString).length > 0
                ? this.extractRelevantData(depObjectOrVersionString)
                : depObjectOrVersionString,
          }
        }, {})
      : undefined
  }

  protected resolvePath(filePath: string): string {
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
      if (!dependencies.path) {
        log.error(
          {
            packageName,
            data: dependencies,
            parentModule: tree.name,
            parentVersion: tree.version,
          },
          "dependency path is undefined"
        )
        throw new Error("unable to parse `path` during `tree.dependencies` reduce")
      }
      // Map dependency details: name, version and path to the dependency tree
      this.dependencyPathMap.set(newKey, path.normalize(this.resolvePath(dependencies.path)))
      if (!acc[parentKey]) {
        acc[parentKey] = { dependencies: [] }
      }
      acc[parentKey].dependencies.push(newKey)
      if (tree.implicitDependenciesInjected) {
        log.debug(
          {
            dependency: packageName,
            version,
            path: dependencies.path,
            parentModule: tree.name,
            parentVersion: tree.version,
          },
          "converted implicit dependency"
        )
        return acc
      }

      return { ...acc, ...this.convertToDependencyGraph(dependencies, newKey) }
    }, {})
  }

  private collectAllDependencies(tree: Dependency<T, OptionalsType>) {
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      if (Object.keys(value.dependencies ?? {}).length > 0) {
        this.allDependencies.set(`${key}@${value.version}`, value)
        this.collectAllDependencies(value)
      }
    }
  }

  private getTreeFromWorkspaces(tree: T): T {
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
