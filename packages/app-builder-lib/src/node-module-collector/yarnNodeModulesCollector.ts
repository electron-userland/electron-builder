import { load } from "js-yaml"
import * as fs from "fs-extra"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { Dependency, YarnDependency } from "./types"
import { execSync } from "child_process"
import { log } from "builder-util"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"

export class YarnNodeModulesCollector extends NodeModulesCollector<YarnDependency, string> {
  public readonly installOptions = { manager: PM.YARN, lockfile: "yarn.lock" }
  private version: string
  private isPnP: boolean

  constructor(rootDir: string, tempDirManager: import("builder-util").TmpDir) {
    super(rootDir, tempDirManager)

    this.version = this.getYarnVersion()
    this.isPnP = this.detectPnP(rootDir)
  }

  protected getArgs(): string[] {
    // Only Yarn v1 uses CLI. We use pnp.cjs for PnP and manual tree build for Yarn Berry node_modules linker
    if (this.version.startsWith("1.")) {
      return ["list", "--production", "--json", "--depth=Infinity", "--no-progress"]
    }
    log.debug({ version: this.version, isPnP: this.isPnP }, "Yarn version detected. Expected `pnp.cjs` for PnP or node_modules linker for non-PnP.")
    throw new Error(`Yarn version ${this.version} is not supported for CLI tree extraction. Use PnP or node_modules linker instead.`)
  }

  protected async getDependenciesTree(): Promise<YarnDependency> {
    if (this.isPnP) {
      const pnpFile = path.join(this.rootDir, ".pnp.cjs")
      const tree = this.getYarnPnPTree(this.rootDir, pnpFile)
      if (tree) return tree
      throw new Error(`Failed to extract Yarn PnP dependency tree.`)
    }

    if (this.version.startsWith("1.")) {
      return super.getDependenciesTree()
    }

    // Yarn Berry node_modules linker fallback
    return this.buildNodeModulesTreeManually(this.rootDir)
  }

  protected parseDependenciesTree(jsonBlob: string): YarnDependency {
    const data = JSON.parse(jsonBlob)
    if (data.dependencies) {
      return this.normalizeNpmLikeTree(data, this.rootDir)
    }

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

    if (parsed.length === 0) {
      return { name: ".", version: "unknown", path: this.rootDir }
    }

    return this.normalizeTree(parsed, this.rootDir)
  }

  private normalizeTree(data: any[], root: string): YarnDependency {
    const parseTree = (node: any, parentDir: string): YarnDependency => {
      const { name, version } = this.parseNameVersion(node.name)
      const dir = this.resolveModuleDir(name, parentDir)
      const deps: Record<string, YarnDependency> = {}

      if (Array.isArray(node.children)) {
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

    const dependencies = data
      .map(i => {
        const tree1 = parseTree(i, root)
        return tree1
      })
      .reduce(
        (acc, cur) => {
          acc[cur.name] = cur
          return acc
        },
        {} as Record<string, YarnDependency>
      )
    return {
      name: ".",
      version: "unknown",
      path: root,
      dependencies,
    }
  }

  private normalizeNpmLikeTree(data: any, cwd: string): YarnDependency {
    const parseNode = (node: any, parentDir: string): YarnDependency => {
      const name = node.name
      const version = node.version
      const dir = this.resolveModuleDir(name, parentDir)
      const deps: Record<string, YarnDependency> = {}

      for (const [depName, depNode] of Object.entries(node.dependencies ?? {})) {
        deps[depName] = parseNode(depNode, dir)
      }

      return { name, version, path: dir, dependencies: Object.keys(deps).length ? deps : undefined }
    }

    return parseNode(data, cwd)
  }

  protected collectAllDependencies(tree: YarnDependency) {
    // Collect regular dependencies
    for (const [key, value] of Object.entries(tree.dependencies || {})) {
      this.allDependencies.set(`${key}@${value.version}`, value)
      this.collectAllDependencies(value)
    }

    // Collect optional dependencies if they exist
    // for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
    //   this.allDependencies.set(`${key}@${value.version}`, value)
    //   this.collectAllDependencies(value)
    // }
  }

  // extractProductionDependencyGraph(tree: YarnDependency, dependencyId: string): void {
  //   if (this.productionGraph[dependencyId]) {
  //     return
  //   }

  //   const p = path.normalize(this.resolveModuleDir(tree.name, tree.path))
  //   const packageJson: Dependency<string, string> = require(path.join(p, "package.json"))
  //   const prodDependencies = { ...packageJson.dependencies, ...packageJson.optionalDependencies }

  //   const deps = { ...(tree.dependencies || {}) } // ...(tree.optionalDependencies || {}) }
  //   this.productionGraph[dependencyId] = { dependencies: [] }
  //   const dependencies = Object.entries(deps)
  //     .filter(([packageName, dependency]) => {
  //       // First check if it's in production dependencies
  //       if (!prodDependencies[packageName]) {
  //         return false
  //       }

  //       // Then check if optional dependency path exists
  //       if (packageJson.optionalDependencies?.[packageName] && !fs.existsSync(dependency.path)) {
  //         log.debug({ packageName, version: dependency.version, path: dependency.path }, `optional dependency path doesn't exist`)
  //         return false
  //       }

  //       return true
  //     })
  //     .map(([packageName, dependency]) => {
  //       const childDependencyId = `${packageName}@${dependency.version}`
  //       this.extractProductionDependencyGraph(dependency, childDependencyId)
  //       return childDependencyId
  //     })

  //   this.productionGraph[dependencyId] = { dependencies }
  // }

  protected extractProductionDependencyGraph(tree: YarnDependency, dependencyId: string): void {
    if (this.productionGraph[dependencyId]) {
      return
    }
    const productionDeps = Object.entries(tree.dependencies || {}).map(([packageName, dependency]) => {
      const childDependencyId = `${packageName}@${dependency.version}`
      this.extractProductionDependencyGraph(dependency, childDependencyId)
      return childDependencyId
    })
    this.productionGraph[dependencyId] = { dependencies: productionDeps }
  }

  private buildNodeModulesTreeManually(baseDir: string): YarnDependency {
    const rootPkg = fs.readJSONSync(path.join(baseDir, "package.json"))

    const traverse = (pkgDir: string): Record<string, YarnDependency> | undefined => {
      const nodeModules = path.join(pkgDir, "node_modules")
      if (!fs.existsSync(nodeModules)) return undefined

      const deps: Record<string, YarnDependency> = {}
      for (const name of fs.readdirSync(nodeModules)) {
        if (name.startsWith(".")) continue
        const depPath = path.join(nodeModules, name)
        const pkgJson = path.join(depPath, "package.json")
        // if (!fs.existsSync(pkgJson)) continue
        const pkg = fs.readJSONSync(pkgJson)
        deps[name] = { name: pkg.name, version: pkg.version, path: depPath, dependencies: traverse(depPath) }
      }
      return Object.keys(deps).length ? deps : undefined
    }
    const rootNode: YarnDependency = { name: rootPkg.name, version: rootPkg.version, path: baseDir, dependencies: traverse(baseDir) }
    return rootNode
  }

  private getYarnVersion(): string {
    try {
      return execSync("yarn --version", { cwd: this.rootDir }).toString().trim()
    } catch {
      return "unknown"
    }
  }

  private detectPnP(rootDir: string): boolean {
    try {
      const rcPath = path.join(rootDir, ".yarnrc.yml")
      if (fs.existsSync(rcPath)) {
        const cfg: any = load(fs.readFileSync(rcPath, "utf-8"))
        if (cfg?.nodeLinker === "pnp") return true
      }
      return fs.existsSync(path.join(rootDir, ".pnp.cjs"))
    } catch {
      return false
    }
  }

  private getYarnPnPTree(cwd: string, pnpPath: string): YarnDependency | undefined {
    try {
      const pnpApi = require(pnpPath)
      const topLocator = pnpApi.topLevel
      const visited = new Set<string>()

      const buildNode = (locator: any): YarnDependency => {
        const info = pnpApi.getPackageInformation(locator)
        const dir = info?.packageLocation ? path.resolve(info.packageLocation) : path.resolve(cwd)
        const node: YarnDependency = { name: locator.name, version: locator.reference, path: dir, dependencies: {} }

        if (!info?.packageDependencies) return node

        for (const [depName, ref] of info.packageDependencies) {
          if (!ref) continue
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
   * Parse a dependency identifier like "@scope/pkg@1.2.3" or "pkg@1.2.3"
   */
  private parseNameVersion(identifier: string): { name: string; version: string } {
    const match = identifier.match(/^(@[^/]+\/[^@]+)@(.+)$/) || identifier.match(/^([^@]+)@(.+)$/)
    if (match) {
      return { name: match[1], version: match[2] }
    }
    return { name: identifier, version: "unknown" }
  }
}
