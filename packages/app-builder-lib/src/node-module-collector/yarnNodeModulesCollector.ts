import { execSync } from "child_process"
import * as fs from "fs-extra"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { Dependency, YarnDependency } from "./types"

export class YarnNodeModulesCollector extends NodeModulesCollector<YarnDependency, string> {
  public readonly installOptions = { manager: PM.YARN, lockfile: "yarn.lock" }

  protected getArgs(): string[] {
    return ["list", "--production", "--json", "--depth=Infinity", "--no-progress"]
  }

  protected collectAllDependencies(tree: Dependency<YarnDependency, string>): void {
    const visited = new Set<string>()
    const stack: Dependency<YarnDependency, string>[] = [tree]

    while (stack.length > 0) {
      const node = stack.pop()
      if (!node) continue

      const id = `${node.name}@${node.version}`
      if (visited.has(id)) continue
      visited.add(id)

      this.allDependencies.set(id, node)
      for (const dep of Object.values(node.dependencies ?? {})) {
        stack.push(dep)
      }
    }
  }

  protected async getDependenciesTree(): Promise<YarnDependency> {
    const pnpPath = path.join(this.rootDir, ".pnp.cjs")

    // 1️⃣ Yarn Berry in PnP mode
    if (fs.existsSync(pnpPath)) {
      const tree = await this.getYarnPnPTree(this.rootDir, pnpPath)
      if (tree) return tree
      throw new Error(`Failed to extract Yarn PnP tree: .pnp.cjs file exists but failed to parse it`)
    }

    // 2️⃣ Yarn Classic (v1.x) fallback detection
    // const yarnVersion = this.getYarnVersion()
    // const major = parseInt(yarnVersion.split(".")[0], 10)
    // if (major < 2) {
    //   const output = execSync("yarn list --production --json --no-progress", {
    //     cwd: this.rootDir,
    //     encoding: "utf8",
    //   })
    //   return this.parseYarnClassicTree(output, this.rootDir)
    // }

    // 3️⃣ Yarn Berry (2+) in node_modules linker mode
    return super.getDependenciesTree()
  }

  protected parseDependenciesTree(jsonBlob: string): YarnDependency {
    const lines = jsonBlob
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        try {
          return JSON.parse(l)
        } catch {
          return undefined
        }
      })
      .filter(Boolean)

    const parsed = lines.find((l: any) => l.type === "tree")?.data?.trees
    if (!parsed) {
      throw new Error(`Failed to extract Yarn tree: no "type":"tree" line found in \`yarn list\` output`)
    }

    return this.normalizeTree(parsed, this.rootDir)
  }

  private normalizeTree(data: any[], root: string): YarnDependency {
    if (!data?.length) {
      throw new Error("Yarn module collector dependency tree is invalid or empty")
    }

    const parseTree = (node: any, parentDir: string): YarnDependency => {
      const { name, version } = this.parseNameVersion(node.name)
      const dir = this.resolveModuleDir(name, parentDir)
      const deps: Record<string, YarnDependency> = {}

      if (Array.isArray(node.children) && node.children.length > 0) {
        for (const child of node.children) {
          const dep = parseTree(child, dir)
          deps[dep.name] = dep
        }
      }

      return {
        name,
        version,
        path: dir,
        dependencies: Object.keys(deps).length ? deps : undefined,
      }
    }

    return parseTree(data[0], root)
  }

  /**
   * Yarn v1 “classic” tree parser
   */
  private parseYarnClassicTree(jsonBlob: string, cwd: string): YarnDependency {
    const lines = jsonBlob
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        try {
          return JSON.parse(l)
        } catch {
          return undefined
        }
      })
      .filter(Boolean)

    const trees = lines.find((l: any) => l.type === "tree")?.data?.trees
    const tree = trees?.[0]
    if (!tree) {
      throw new Error("Failed to parse Yarn v1 classic tree from output")
    }
    return this.normalizeYarnClassicTree(tree, cwd)
  }

  private normalizeYarnClassicTree(tree: any, cwd: string): YarnDependency {
    const { name, version } = this.parseNameVersion(tree.name)
    const node: YarnDependency = {
      name,
      version: tree.version || version,
      path: path.resolve(cwd, "node_modules", name),
      dependencies: {},
    }

    if (Array.isArray(tree.children)) {
      for (const child of tree.children) {
        const dep = this.normalizeYarnClassicTree(child, cwd)
        node.dependencies![dep.name] = dep
      }
    }

    return node
  }

  private async getYarnPnPTree(cwd: string, pnpPath: string): Promise<YarnDependency | undefined> {
    try {
      let pnpApi
      try {
        pnpApi = require(pnpPath)
      } catch {
        pnpApi = await import(pnpPath)
      }

      const topLocator = pnpApi.topLevel
      const visited = new Set<string>()

      const buildNode = (locator: any): YarnDependency => {
        const info = pnpApi.getPackageInformation(locator)
        const dir = info?.packageLocation ? path.resolve(info.packageLocation) : path.resolve(cwd)

        const node: YarnDependency = {
          name: locator.name,
          version: locator.reference,
          path: dir,
          dependencies: {},
        }

        if (!info?.packageDependencies) return node

        for (const [depName, ref] of info.packageDependencies) {
          if (ref === null) continue
          const key = `${depName}@${ref}`
          if (visited.has(key)) continue
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

  /**
   * Resolve the directory of a dependency from a given base path.
   */
  private resolveModuleDir(pkg: string, base: string): string {
    return path.resolve(base, "node_modules", pkg)
    try {
      const entry = require.resolve(path.join(pkg, "package.json"), { paths: [base] })
      return path.dirname(entry)
    } catch {
      return path.join(base, "node_modules", pkg)
    }
  }

  /**
   * Parse a dependency identifier like "@scope/pkg@1.2.3" or "pkg@1.2.3"
   */
  private parseNameVersion(identifier: string): { name: string; version: string } {
    const match = identifier.match(/^(@[^/]+\/[^@]+)@(.+)$/) || identifier.match(/^([^@]+)@(.+)$/)
    if (match) {
      return { name: match[1], version: match[2] }
    }
    return { name: identifier, version: "unknown" }
  }

  private getYarnVersion(): string {
    try {
      const version = execSync("yarn --version", { cwd: this.rootDir, encoding: "utf8" }).trim()
      return version
    } catch {
      return "1.0.0" // default fallback
    }
  }

  protected extractProductionDependencyGraph(tree: Dependency<YarnDependency, string>, dependencyId: string): void {
    if (this.productionGraph[dependencyId]) return

    const deps = tree.dependencies || {}
    this.productionGraph[dependencyId] = { dependencies: [] }
    const dependencies = Object.entries(deps).map(([packageName, dependency]) => {
      const childDependencyId = `${packageName}@${dependency.version}`
      this.extractProductionDependencyGraph(dependency, childDependencyId)
      return childDependencyId
    })

    this.productionGraph[dependencyId] = { dependencies }
  }

}
