import { load } from "js-yaml"
import * as fs from "fs-extra"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { YarnDependency } from "./types"
import { exists, log } from "builder-util"
import { Lazy } from "lazy-val"

export class YarnNodeModulesCollector extends NodeModulesCollector<YarnDependency, string> {
  public readonly installOptions = {
    manager: PM.YARN,
    lockfile: "yarn.lock",
  }
  protected readonly isPnP = new Lazy<boolean>(async () => this.detectPnP(this.rootDir))

  protected getArgs(): string[] {
    return ["list", "--production", "--json", "--depth=Infinity", "--no-progress"]
  }

  protected async getDependenciesTree(pm: PM): Promise<YarnDependency> {
    if (await this.isPnP.value) {
      log.debug(null, "using Yarn PnP for dependency tree extraction")
      // Yarn PnP
      // Reference: https://yarnpkg.com/features/pnp
      // Note: .pnp.cjs is not always in the project root (can be in workspace root instead)
      // So we explicitly specify the path here to avoid issues.
      const pnpFile = path.join(this.rootDir, ".pnp.cjs")
      const tree = this.getYarnPnPTree(this.rootDir, pnpFile)
      if (tree) {
        return tree
      }
      log.error({ pnpFile }, "Yarn PnP file not found or failed to load")
      throw new Error(`Failed to extract Yarn PnP dependency tree - .pnp.cjs file not found or invalid`)
    }

    return super.getDependenciesTree(pm)
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<YarnDependency> {
    try {
      const data = JSON.parse(jsonBlob)
      if (data.dependencies) {
        return this.normalizeNpmLikeTree(data, this.rootDir)
      }
    } catch {
      // ignore
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

  protected async collectAllDependencies(tree: YarnDependency) {
    // Collect regular dependencies
    for (const [_, value] of Object.entries(tree.dependencies || {})) {
      this.allDependencies.set(this.moduleKeyGenerator(value), value)
      await this.collectAllDependencies(value)
    }

    // Collect optional dependencies if they exist
    for (const [key, value] of Object.entries(tree.optionalDependencies || {})) {
      const module = {
        name: key,
        version: value,
        path: await this.resolveModuleDir(key, tree.path),
      }
      this.allDependencies.set(this.moduleKeyGenerator(module), module)
    }
  }

  protected async extractProductionDependencyGraph(tree: YarnDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }
    const productionDeps = Object.entries(tree.dependencies || {}).map(async ([, dependency]) => {
      const childDependencyId = this.moduleKeyGenerator(dependency)
      await this.extractProductionDependencyGraph(dependency, childDependencyId)
      return childDependencyId
    })
    this.productionGraph[dependencyId] = { dependencies: await Promise.all(productionDeps) }
  }

  private async normalizeTree(data: any[], root: string): Promise<YarnDependency> {
    const parseTree = async (node: any, parentDir: string): Promise<YarnDependency> => {
      const { name, version } = this.parseNameVersion(node.name)
      const dir = await this.resolveModuleDir(name, parentDir)

      const deps: Record<string, YarnDependency> = {}
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const dep = await parseTree(child, dir)
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

    const dependencies = (
      await Promise.all(
        data.map(async i => {
          return parseTree(i, root)
        })
      )
    ).reduce(
      (acc, cur) => {
        const current = cur
        acc[current.name] = current
        return acc
      },
      {} as Record<string, YarnDependency>
    )

    return {
      name: ".", // root package name stub
      version: "unknown",
      path: root,
      dependencies,
    }
  }

  private async normalizeNpmLikeTree(data: any, cwd: string): Promise<YarnDependency> {
    const parseNode = async (node: any, parentDir: string): Promise<YarnDependency> => {
      const name = node.name
      const version = node.version
      const dir = await this.resolveModuleDir(name, parentDir)
      const deps: Record<string, YarnDependency> = {}

      for (const [depName, depNode] of Object.entries(node.dependencies ?? {})) {
        deps[depName] = await parseNode(depNode, dir)
      }

      return { name, version, path: dir, dependencies: Object.keys(deps).length ? deps : undefined }
    }

    return await parseNode(data, cwd)
  }

  private async detectPnP(rootDir: string): Promise<boolean> {
    try {
      if ((await exists(path.join(rootDir, ".pnp.cjs"))) || (await exists(path.join(rootDir, ".pnp.js")))) {
        return true
      }
      const rcPath = path.join(rootDir, ".yarnrc.yml")
      if (await exists(rcPath)) {
        const cfg: any = load(await fs.readFile(rcPath, "utf-8"))
        if (cfg?.nodeLinker === "pnp") {
          return true
        }
      }
    } catch {
      // ignore
    }
    return false
  }

  private getYarnPnPTree(cwd: string, pnpPath: string): YarnDependency | undefined {
    try {
      const pnpApi = require(pnpPath)
      const topLocator = pnpApi.topLevel
      const visited = new Set<string>()

      const buildNode = (locator: any): YarnDependency => {
        const info = pnpApi.getPackageInformation(locator)
        const dir = info?.packageLocation ? path.resolve(info.packageLocation) : path.resolve(cwd)
        if (dir.includes("virtual")) {
          log.error({ dir, locator }, "unable to extract file(s) from Yarn PnP virtual package")
          throw new Error(`Cannot resolve Yarn PnP virtual package [${locator.name}@${locator.reference}] at [${dir}], please force hoisted node_modules installation instead`)
        }

        const node: YarnDependency = { name: locator.name, version: locator.reference, path: dir, dependencies: {} }

        if (!info?.packageDependencies) {
          return node
        }

        for (const [depName, ref] of info.packageDependencies) {
          if (!ref) {
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
    } catch (err: any) {
      log.error({ message: err.message, stack: err.stack }, "Yarn PnP extraction error")
    }
    return undefined
  }
}
