import { hoist, type HoisterTree, type HoisterResult } from "./hoist"
import * as path from "path"
import * as fs from "fs"
import { NodeModuleInfo, DependencyTree, DependencyGraph } from "./types"
import { exec, log } from "builder-util"

export abstract class NodeModulesCollector {
  private nodeModules: NodeModuleInfo[]
  protected dependencyPathMap: Map<string, string>
  protected allDependencies: Map<string, DependencyTree> = new Map()

  constructor(private readonly rootDir: string) {
    this.dependencyPathMap = new Map()
    this.nodeModules = []
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

  private convertToDependencyGraph(tree: DependencyTree): DependencyGraph {
    const result: DependencyGraph = { ".": {} }

    const flatten = (node: DependencyTree, parentKey = ".") => {
      const dependencies = node.dependencies || {}

      for (const [key, value] of Object.entries(dependencies)) {
        // Skip empty dependencies(like some optionalDependencies)
        if (Object.keys(value).length === 0) {
          continue
        }
        const version = value.version || ""
        const newKey = `${key}@${version}`
        this.dependencyPathMap.set(newKey, path.normalize(this.resolvePath(value.path)))
        if (!result[parentKey]?.dependencies) {
          result[parentKey] = { dependencies: [] }
        }
        result[parentKey].dependencies!.push(newKey)

        if (node.__circularDependencyDetected) {
          continue
        }
        flatten(value, newKey)
      }
    }

    flatten(tree)
    return result
  }

  getAllDependencies(tree: DependencyTree) {
    const dependencies = tree.dependencies || {}
    for (const [key, value] of Object.entries(dependencies)) {
      if (value.dependencies && Object.keys(value.dependencies).length > 0) {
        this.allDependencies.set(`${key}@${value.version}`, value)
        this.getAllDependencies(value)
      }
    }
  }

  abstract getCommand(): string
  abstract getArgs(): string[]
  abstract removeNonProductionDependencie(tree: DependencyTree): void

  protected async getDependenciesTree(): Promise<DependencyTree> {
    const command = this.getCommand()
    const args = this.getArgs()
    const dependencies = await exec(command, args, {
      cwd: this.rootDir,
      shell: true,
    })
    const dependencyTree: DependencyTree | DependencyTree[] = JSON.parse(dependencies)

    // pnpm returns an array of dependency trees
    if (Array.isArray(dependencyTree)) {
      const tree = dependencyTree[0]
      if (tree.optionalDependencies) {
        tree.dependencies = { ...tree.dependencies, ...tree.optionalDependencies }
      }
      return tree
    }

    // yarn and npm return a single dependency tree
    return dependencyTree
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
        node["dependencies"] = []
        this._getNodeModules(d.dependencies, node["dependencies"])
      }
    }
    result.sort((a, b) => a.name.localeCompare(b.name))
  }

  private getTreeFromWorkspaces(tree: DependencyTree): DependencyTree {
    if (tree.workspaces && tree.dependencies) {
      for (const [key, value] of Object.entries(tree.dependencies)) {
        if (this.rootDir.endsWith(path.normalize(key))) {
          return value
        }
      }
    }
    return tree
  }

  public async getNodeModules(): Promise<NodeModuleInfo[]> {
    const tree = await this.getDependenciesTree()
    const realTree = this.getTreeFromWorkspaces(tree)
    this.getAllDependencies(realTree)
    this.removeNonProductionDependencie(realTree)
    const dependencyGraph = this.convertToDependencyGraph(realTree)
    const hoisterResult = hoist(this.transToHoisterTree(dependencyGraph), { check: true })
    this._getNodeModules(hoisterResult.dependencies, this.nodeModules)
    return this.nodeModules
  }
}
