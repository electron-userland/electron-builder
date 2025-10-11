import * as path from "path"
import * as fs from "fs-extra"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"
import { Dependency, NodeModuleInfo, YarnDependency } from "./types"
import { NodeModulesCollector } from "./nodeModulesCollector"

export class YarnNodeModulesCollector extends NodeModulesCollector<YarnDependency, string> {
  public readonly installOptions = { manager: PM.YARN, lockfile: "yarn.lock" }

  protected getArgs(): string[] {
    return ["list", "--production", "--json", "--depth=Infinity", "--no-progress"]
  }

  // getTreeFromWorkspaces(tree: YarnDependency): YarnDependency {
  //   // If workspaces are used, only the root project will have all dependencies listed
  //   // So we need to find the root project and return its tree
  //   if (tree.name === "workspace-root" && tree.dependencies) {
  //     for (const dep of Object.values(tree.dependencies)) {
  //       if (dep.name === path.basename(this.rootDir)) {
  //         return dep
  //       }
  //     }
  //   }
  //   return tree
  // }

  protected collectAllDependencies(tree: Dependency<YarnDependency, string>): void {
    // Traverse the dependency tree and collect all production dependencies for the given dependencyId
    const visited = new Set<string>()
    const stack: Dependency<YarnDependency, string>[] = [tree]

    while (stack.length > 0) {
      const node = stack.pop()
      if (!node) {
        continue
      }
      const id = node.name + "@" + node.version
      if (visited.has(id)) {
        continue
      }
      visited.add(id)

      this.allDependencies.set(id, node)

      if (node.dependencies) {
        for (const dep of Object.keys(node.dependencies).map(name => node.dependencies![name])) {
          stack.push(dep)
        }
      }
    }
  }

  // protected collectAllDependencies(tree: Dependency<YarnDependency, string>): void {
  //   // Traverse the entire dependency tree and collect all dependencies
  //   const visited = new Set<string>();
  //   const stack: Dependency<YarnDependency, string>[] = [tree];

  //   while (stack.length > 0) {
  //     const node = stack.pop();
  //     if (!node) continue;
  //     const id = node.id;
  //     if (visited.has(id)) continue;
  //     visited.add(id);

  //     this.allDependencies.set(id, node);

  //     if (node.dependencies) {
  //       for (const dep of node.dependencies) {
  //         stack.push(dep);
  //       }
  //     }
  //   }
  // }

  protected getDependenciesTree(): Promise<YarnDependency> {
    // Yarn Berry in PnP mode does not support `yarn list` command
    // So we need to detect if it's PnP mode by checking if .pnp.cjs file exists
    const pnpPath = path.join(this.rootDir, ".pnp.cjs")
    if (fs.existsSync(pnpPath)) {
      const tree = this.getYarnPnPTree(this.rootDir, pnpPath)
      if (tree) {
        return Promise.resolve(tree)
      }
      throw new Error(`Failed to extract Yarn PnP tree: .pnp.cjs file exists but failed to parse it`)
    }
    // Classic Yarn or Yarn Berry in node_modules mode
    return super.getDependenciesTree()
  }

  protected parseDependenciesTree(jsonBlob: string): YarnDependency {
    const treeLine = jsonBlob.split("\n").find((line: string | string[]) => line.includes('"type":"tree"'))
    if (!treeLine) {
      throw new Error(`Failed to extract Yarn tree: no "type":"tree" line found in \`yarn list\` output`)
    }

    const parsed = JSON.parse(treeLine).data
    return this.normalizeTree(parsed, this.rootDir)!
  }

  private normalizeTree(data: any, cwd: string): YarnDependency | undefined {
    if (!data || !data.name || !data.version) return undefined

    const node: YarnDependency = {
      name: data.name,
      version: data.version,
      path: path.resolve(cwd, "node_modules", data.name),
      dependencies: {},
    }

    if (data.dependencies) {
      for (const [depName, depInfo] of Object.entries<any>(data.dependencies)) {
        const depNode = this.normalizeTree(depInfo, path.resolve(cwd, "node_modules"))
        if (depNode) node.dependencies![depName] = depNode
      }
    }

    return node
  }

  protected extractProductionDependencyGraph(tree: Dependency<YarnDependency, string>, dependencyId: string): void {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const deps = tree.dependencies || {}
    this.productionGraph[dependencyId] = { dependencies: [] }
    const dependencies = Object.entries(deps).map(([packageName, dependency]) => {
      const childDependencyId = `${packageName}@${dependency.version}`
      this.extractProductionDependencyGraph(dependency, childDependencyId)
      return childDependencyId
    })

    this.productionGraph[dependencyId] = { dependencies }
  }

  // getYarnTree(cwd: string): YarnDependency | undefined {
  //   const pnpPath = path.join(cwd, ".pnp.cjs")

  //   if (fs.existsSync(pnpPath)) {
  //     return this.getYarnPnPTree(cwd, pnpPath)
  //   }

  //   // Classic Yarn or Yarn Berry in node_modules mode
  //   // const output = execSync(`yarn list --production --json --depth=Infinity`, {
  //   //   cwd,
  //   //   encoding: "utf8",
  //   // })

  //   const treeLine = output.split("\n").find((line: string | string[]) => line.includes('"type":"tree"'))
  //   if (!treeLine) return undefined

  //   const parsed = JSON.parse(treeLine).data
  //   return this.normalizeYarnClassicTree(parsed, cwd)
  // }

  private normalizeYarnClassicTree(tree: any, cwd: string): YarnDependency {
    const [name, version] = tree.name?.split("@") ?? []
    const node: YarnDependency = {
      name: tree.name,
      version: tree.version || version,
      path: path.resolve(cwd, "node_modules", name),
      dependencies: tree.children?.map((child: any) => this.normalizeYarnClassicTree(child, cwd)),
    }

    return node
  }

  private getYarnPnPTree(cwd: string, pnpPath: string): YarnDependency | undefined {
    try {
      const pnpApi = require(pnpPath)
      const topLocator = pnpApi.topLevel
      // const topInfo = pnpApi.getPackageInformation(topLocator)

      const visited = new Set<string>()

      function buildNode(locator: any): YarnDependency {
        const info = pnpApi.getPackageInformation(locator)
        const dir = info?.packageLocation ? path.resolve(info.packageLocation) : path.resolve(cwd)

        const node: YarnDependency = {
          name: locator.name,
          version: locator.reference,
          path: dir,
          dependencies: {},
        }

        if (!info?.packageDependencies) {
          return node
        }
        for (const [depName, ref] of info.packageDependencies) {
          if (ref === null) {
            continue
          }
          const key = `${depName}@${ref}`
          if (visited.has(key)) {
            continue
          }
          visited.add(key)

          const depLocator = pnpApi.getLocator(depName, ref)
          node.dependencies![depName] = buildNode(depLocator)
        }

        return node
      }

      return buildNode(topLocator)
    } catch (err) {
      console.error("Failed to extract Yarn PnP tree:", err)
      return undefined
    }
  }
}
