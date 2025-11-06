import { log } from "builder-util"
import { readJson } from "fs-extra"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { YarnDependency } from "./types"
import { Lazy } from "lazy-val"

type YarnListJsonLine =
  | {
      type: "tree"
      data: {
        type: "list"
        trees: YarnListTree[]
      }
    }
  | {
      type: "info" | "warning" | "error"
      data: string
    }

interface YarnListTree {
  name: string // e.g. "lodash@4.17.21"
  children: YarnListTree[]
  shadow?: boolean
  color?: string
  hint?: any
  depth?: number
}

export class YarnNodeModulesCollector extends NodeModulesCollector<YarnDependency, YarnDependency> {
  public readonly installOptions = {
    manager: PM.YARN,
    lockfile: "yarn.lock",
  }

  protected isHoisted: Lazy<boolean> = new Lazy<boolean>(async () => {
    return Promise.resolve(true) // Yarn Classic always hoists
  })

  private appPkgJson: Lazy<any> = new Lazy<any>(async () => {
    const appPkgPath = path.join(this.rootDir, "package.json")
    return readJson(appPkgPath)
  })

  protected getArgs(): string[] {
    return ["list", "--production", "--json", "--depth=Infinity", "--no-progress"]
  }

  protected async getTreeFromWorkspaces(tree: YarnDependency): Promise<YarnDependency> {
    const appName = (await this.appPkgJson.value).name
    if (tree.dependencies?.[appName]) {
      const { name, path } = tree.dependencies[appName]
      log.debug({ name, path }, "pruning root app/self package from workspace tree")
      delete tree.dependencies[appName]
    }

    return tree
  }

  protected async extractProductionDependencyGraph(tree: YarnDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const productionDeps = Object.entries(tree.dependencies || {}).map(async ([, dependency]) => {
      const dep = {
        ...dependency,
        path: this.resolvePath(dependency.path),
      }

      const childDependencyId = this.packageVersionString(dep)
      await this.extractProductionDependencyGraph(dep, childDependencyId)
      return childDependencyId
    })

    this.productionGraph[dependencyId] = { dependencies: await Promise.all(productionDeps) }
  }

  protected getDependencyType(pkgName: string, parentPkgJson: any): "prod" | "dev" | "optional" {
    if (parentPkgJson.optionalDependencies?.[pkgName]) {
      return "optional"
    }

    if (parentPkgJson.devDependencies?.[pkgName]) {
      return "dev"
    }

    if (parentPkgJson.dependencies?.[pkgName]) {
      return "prod"
    }

    return "prod"
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<YarnDependency> {
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
      .filter(Boolean) as YarnListJsonLine[]

    const parsedTree: YarnListTree[] | undefined = lines
      .filter(l => l.type === "tree")
      .map(l => (l.data as any).trees)
      .shift()

    if (!parsedTree) {
      // log.warn({ output: jsonBlob }, `Failed to extract Yarn tree: no "type":"tree" line found, falling back to manual node_modules traversal`)
      // return this.buildNodeModulesTreeManually(this.rootDir)
      throw new Error('Failed to extract Yarn tree: no "type":"tree" line found in console output')
    }

    const normalizedTree = this.normalizeTree(parsedTree)

    const dependencies: Record<string, YarnDependency> = {}
    for (const [name, dep] of Object.entries(normalizedTree)) {
      dependencies[name] = dep
    }

    const rootPkgJson = await this.appPkgJson.value
    return Promise.resolve({
      name: rootPkgJson.name || ".",
      version: rootPkgJson.version || "unknown",
      path: this.rootDir,
      dependencies,
    })
  }

  private normalizeTree(tree: YarnListTree[], seen = new Set<string>()): Record<string, YarnDependency> {
    const normalized: Record<string, YarnDependency> = {}

    for (const node of tree) {
      const match = node.name.match(/^(.*)@([^@]+)$/)
      if (!match) {
        log.debug({ name: node.name }, "invalid node name format")
        continue
      }

      const [, pkgName, version] = match
      const id = `${pkgName}@${version}`

      const isShadow = node.shadow && node.color === "dim"
      if (isShadow) {
        log.debug({ pkgName, version }, "skipping shadow node")
        continue
      }

      if (seen.has(id)) {
        continue
      }

      seen.add(id)

      // const depKey = [...this.allDependencies.keys()].find(key => {
      //   const [nameKey, versionKey] = key.split("::")
      //   return nameKey === pkgName && versionKey === version
      // })

      const dep = this.allDependencies.get(node.name)!

      const normalizedDep: YarnDependency = {
        name: pkgName,
        version,
        path: this.resolvePath(dep.path), // Use fallback path since yarn classic's hoisting behavior
        dependencies: {},
        optionalDependencies: {},
      }

      log.debug({ name: pkgName, version }, "+ normalize")

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          const childMatch = child.name.match(/^(.*)@([^@]+)$/)
          if (!childMatch) {
            continue
          }

          const [, childName, childVersion] = childMatch
          if (child.shadow && child.color === "dim") {
            continue
          }

          log.debug({ parent: pkgName, childName, childVersion }, "  + normalize child")
          const childDeps = this.normalizeTree([child], seen)

          for (const [childDepName, childDep] of Object.entries(childDeps)) {
            normalizedDep.dependencies![childDepName] = childDep
          }
        }
      }

      normalized[pkgName] = normalizedDep
    }

    return normalized
  }

  /**
    1. Build reverse dependency map before collecting - map each package to the set of packages that depend on it
    2. Check if all parents failed - when processing a package, check if ALL of its parents are in the failedPackages set
    3. Treat as optional if all parents failed - this means the package is only needed by packages that weren't installed
   */
  protected async collectAllDependencies(tree: YarnDependency) {
    // Load root package.json once to check for optional dependencies
    const rootPkgJson = await readJson(path.join(this.rootDir, "package.json")).catch(() => ({}))

    // Track packages that failed to install
    const failedPackages = new Set<string>()

    const collect = async (
      deps: YarnDependency["dependencies"] | YarnDependency["optionalDependencies"] = {},
      isOptionalDependency: boolean,
      parentIsOptional: boolean = false
    ) => {
      for (const [, value] of Object.entries(deps)) {
        // Check if this is a root-level optional dependency
        const isRootOptional = rootPkgJson.optionalDependencies?.[value.name]

        // Check if this package appears ONLY as a descendant of failed packages
        // by checking if it's NOT a direct dependency in the root package.json
        const isDirectRootDep = rootPkgJson.dependencies?.[value.name] || rootPkgJson.optionalDependencies?.[value.name] || rootPkgJson.devDependencies?.[value.name]

        // If not a direct root dep and any ancestor failed, treat as optional
        const treatAsOptional = isOptionalDependency || parentIsOptional || isRootOptional

        let p: string | null

        try {
          p = this.resolvePath(value.path)
        } catch (e) {
          if (treatAsOptional) {
            log.debug({ pkg: this.cacheKey(value), name: value.name }, "failed to resolve optional dependency, skipping")
            failedPackages.add(value.name)
            continue
          }

          // Special case: if this is not a direct root dependency and resolution failed,
          // it might be a transitive dep of an optional package
          if (!isDirectRootDep) {
            log.debug({ pkg: this.cacheKey(value), name: value.name }, "failed to resolve transitive dependency, treating as optional")
            failedPackages.add(value.name)
            continue
          }

          log.error({ pkg: this.cacheKey(value) }, "failed to resolve module directory")
          throw e
        }

        // If resolution returned null (optional dependency not found), skip it
        if (!p) {
          log.debug({ pkg: this.cacheKey(value), name: value.name }, "optional dependency not found, skipping")
          failedPackages.add(value.name)
          continue
        }

        let resolvedVersion = value.version
        const versionMatch = p.match(/[/\\]node_modules[/\\][^@]+@([^/\\]+)[/\\]/)
        if (versionMatch) {
          resolvedVersion = versionMatch[1]
          if (resolvedVersion !== value.version) {
            log.debug({ name: value.name, declared: value.version, resolved: resolvedVersion }, "resolved actual version from path")
          }
        }

        const m: YarnDependency = {
          ...value,
          version: resolvedVersion,
          path: p,
        }

        const moduleKey = this.packageVersionString(m)
        if (this.allDependencies.has(moduleKey)) {
          continue
        }

        this.allDependencies.set(moduleKey, m)

        // Recursively collect children - if parent is optional, all children are optional
        const childIsOptional = treatAsOptional
        await collect(m.dependencies, false, childIsOptional)
        await collect(m.optionalDependencies, true, true)
      }
    }

    await collect(tree.dependencies, false, false)
    await collect(tree.optionalDependencies, true, true)

    // Clean up: remove dependencies of failed packages from the tree
    if (failedPackages.size > 0) {
      const cleanDependencies = (deps: Record<string, YarnDependency> = {}) => {
        for (const [key, dep] of Object.entries(deps)) {
          if (failedPackages.has(dep.name)) {
            log.debug({ name: dep.name }, "removing failed package from tree")
            delete deps[key]
          } else {
            // Recursively clean children
            if (dep.dependencies) {
              cleanDependencies(dep.dependencies)
            }
            if (dep.optionalDependencies) {
              cleanDependencies(dep.optionalDependencies)
            }
          }
        }
      }

      cleanDependencies(tree.dependencies)
      cleanDependencies(tree.optionalDependencies)
    }
  }
}
