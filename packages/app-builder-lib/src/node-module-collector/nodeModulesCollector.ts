import { hoist, type HoisterTree, type HoisterResult } from "./hoist"
import * as path from "path"
import { NodeModuleInfo, DependencyTree, DependencyGraph } from "./types"
import { log } from "builder-util"

export abstract class NodeModulesCollector {
  private nodeModules: NodeModuleInfo[]
  protected rootDir: string
  protected dependencyPathMap: Map<string, string>

  constructor(rootDir: string) {
    this.dependencyPathMap = new Map()
    this.nodeModules = []
    this.rootDir = rootDir
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

  public TransToDependencyGraph(tree: DependencyTree): DependencyGraph {
    const result: DependencyGraph = { ".": { dependencies: [] } }

    const flatten = (node: DependencyTree, parentKey = ".") => {
      const dependencies = node.dependencies || {}

      for (const [key, value] of Object.entries(dependencies)) {
        // Skip empty dependencies(like some optionalDependencies)
        if (Object.keys(value).length === 0) {
          continue
        }
        const version = value.version || ""
        const newKey = `${key}@${version}`
        this.dependencyPathMap.set(newKey, path.normalize(value.path))
        if (!result[parentKey].dependencies) {
          result[parentKey].dependencies = []
        }
        result[parentKey].dependencies.push(newKey)
        flatten(value, newKey)
      }
    }

    flatten(tree)
    return result
  }

  abstract getDependenciesTree(): DependencyTree
  abstract getPMCommand(): string

  private _getNodeModules(dependencies: Set<HoisterResult>, result: NodeModuleInfo[]) {
    if (dependencies.size === 0) return

    for (const d of dependencies.values()) {
      const reference = [...d.references][0]
      const p = this.dependencyPathMap.get(`${d.name}@${reference}`)
      if (p === undefined) {
        log.warn(`Cannot find path for ${d.name}@${reference}`)
        continue
      }
      const node = {
        name: d.name,
        version: reference,
        dir: p,
      } as NodeModuleInfo
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

  public getNodeModules(): NodeModuleInfo[] {
    const tree = this.getDependenciesTree()
    const realTree = this.getTreeFromWorkspaces(tree)
    const dependencyGraph = this.TransToDependencyGraph(realTree)
    const hoisterResult = hoist(this.transToHoisterTree(dependencyGraph), { check: true })
    this._getNodeModules(hoisterResult.dependencies, this.nodeModules)
    return this.nodeModules
  }
}
