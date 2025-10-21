import { load } from "js-yaml"
import * as fs from "fs-extra"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { YarnDependency } from "./types"
import { execSync } from "child_process"
import { log } from "builder-util"
import { Lazy } from "lazy-val"

export class YarnNodeModulesCollector extends NodeModulesCollector<YarnDependency, string> {
  public readonly installOptions = {
    manager: PM.YARN,
    lockfile: "yarn.lock",
    lockfileDirs: (workspaceRoot: string) =>
      new Lazy(async () => {
        try {
          const linkedModules = path.join(workspaceRoot, "node_modules")
          if (await fs.pathExists(linkedModules)) {
            return [linkedModules]
          }
        } catch (error: any) {
          log.debug({ workspaceRoot, error: error.message, stack: error.stack }, "no yarn cache dir detected")
        }
        return []
      }),
  }
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
    log.debug(
      { version: this.version, isPnP: this.isPnP },
      "Yarn version detected. Expected `pnp.cjs` for PnP or node_modules linker for non-PnP. Falling back to npm query if neither."
    )
    // TODO: Migrate to be a subclass of NpmNodeModulesCollector for non-PnP Yarn Berry
    throw new Error(`Yarn version ${this.version} is not supported for CLI tree extraction. Use PnP or node_modules linker instead.`)
  }

  protected async getDependenciesTree(): Promise<YarnDependency> {
    if (this.isPnP) {
      log.debug({ version: this.version }, "using Yarn PnP for dependency tree extraction.")
      // Yarn PnP
      // Reference: https://yarnpkg.com/features/pnp
      // Note: .pnp.cjs is not always in the project root (can be in workspace root instead)
      // So we explicitly specify the path here to avoid issues.
      const pnpFile = path.join(this.rootDir, ".pnp.cjs")
      const tree = this.getYarnPnPTree(this.rootDir, pnpFile)
      if (tree) {
        return tree
      }
      log.debug({ pnpFile }, "Yarn PnP file not found or failed to load.")
      throw new Error(`Failed to extract Yarn PnP dependency tree.`)
    }

    if (this.version.startsWith("1.")) {
      return super.getDependenciesTree()
    }

    // Yarn Berry node_modules linker fallback. (Slower due to system ops, so we only use it as a fallback)
    log.debug({ version: this.version }, "using manual node_modules traversal for Yarn v2+.")
    return this.buildNodeModulesTreeManually(this.rootDir)
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<YarnDependency> {
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

  /**
   * Builds a dependency tree using only package.json dependencies and optionalDependencies.
   * This skips devDependencies and does not walk the node_modules filesystem.
   */
  private async buildNodeModulesTreeManually(baseDir: string): Promise<YarnDependency> {
    const visited = new Set<string>()

    const buildFromPackage = async (pkgDir: string): Promise<YarnDependency> => {
      const pkgPath = path.join(pkgDir, "package.json")
      const pkg = fs.readJSONSync(pkgPath)
      const id = this.moduleKeyGenerator(pkg)
      if (visited.has(id)) {
        return { name: pkg.name, version: pkg.version, path: pkgDir }
      }
      visited.add(id)

      const deps: Record<string, YarnDependency> = {}
      const optDeps: Record<string, string> = {}

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.optionalDependencies,
      }

      for (const [depName, depVersion] of Object.entries(allDeps ?? {})) {
        try {
          const depDir = await this.resolveModuleDir(depName, pkgDir)
          deps[depName] = await buildFromPackage(depDir)
        } catch {
          // Not installed or cannot resolve; keep version range info only
          optDeps[depName] = depVersion as string
        }
      }

      return {
        name: pkg.name,
        version: pkg.version,
        path: pkgDir,
        dependencies: Object.keys(deps).length ? deps : undefined,
        optionalDependencies: Object.keys(optDeps).length ? optDeps : undefined,
      }
    }

    return await buildFromPackage(baseDir)
  }

  private getYarnVersion(): string {
    try {
      return execSync("yarn --version", { encoding: "utf8", cwd: this.rootDir }).toString().trim()
    } catch {
      return "unknown"
    }
  }

  private detectPnP(rootDir: string): boolean {
    try {
      if (fs.existsSync(path.join(rootDir, ".pnp.cjs")) || fs.existsSync(path.join(rootDir, ".pnp.js"))) {
        return true
      }
      const rcPath = path.join(rootDir, ".yarnrc.yml")
      if (fs.existsSync(rcPath)) {
        const cfg: any = load(fs.readFileSync(rcPath, "utf-8"))
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
