import { log } from "builder-util"
import { Lazy } from "lazy-val"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { PackageJson, YarnDependency } from "./types"

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

  protected getArgs(): string[] {
    return ["list", "--production", "--json", "--depth=Infinity", "--no-progress"]
  }

  protected async getTreeFromWorkspaces(tree: YarnDependency): Promise<YarnDependency> {
    if (!tree.workspaces || !tree.dependencies) {
      return tree
    }

    const appName = this.packageVersionString(tree)

    if (tree.dependencies?.[appName]) {
      const { name, path } = tree.dependencies[appName]
      log.debug({ name, path }, "pruning root app/self package from workspace tree")
      delete tree.dependencies[appName]
    }
    return Promise.resolve(tree)
  }

  protected async extractProductionDependencyGraph(tree: YarnDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    const productionDeps = Object.entries(tree.dependencies || {}).map(async ([, dependency]) => {
      const dep = {
        ...dependency,
        path: await this.cache.realPath[dependency.path],
      }

      const childDependencyId = this.packageVersionString(dep)
      await this.extractProductionDependencyGraph(dep, childDependencyId)
      return childDependencyId
    })

    const dependencies: string[] = []
    for (const dep of productionDeps) {
      dependencies.push(await dep)
    }
    this.productionGraph[dependencyId] = { dependencies }
  }

  protected getDependencyType(pkgName: string, parentPkgJson: PackageJson): "prod" | "dev" | "optional" {
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
      throw new Error('Failed to extract Yarn tree: no "type":"tree" line found in console output')
    }
    const rootPkgJson = await this.appPkgJson.value

    const normalizedTree = await this.normalizeTree({ tree: parsedTree, seen: new Set<string>(), appName: rootPkgJson.name, parentPath: this.rootDir, parentPkgJson: rootPkgJson })

    const dependencies: Record<string, YarnDependency> = {}
    for (const [name, dep] of Object.entries(normalizedTree)) {
      dependencies[name] = dep
    }

    return Promise.resolve({
      name: rootPkgJson.name,
      version: rootPkgJson.version,
      path: this.rootDir,
      dependencies,
      workspaces: rootPkgJson?.workspaces,
    })
  }

  private async normalizeTree(options: {
    tree: YarnListTree[]
    seen: Set<string>
    appName?: string
    parentPath: string
    parentPkgJson?: PackageJson // Add parent's package.json
  }): Promise<Record<string, YarnDependency>> {
    const { tree, seen, appName, parentPath = this.rootDir } = options
    let parentPkgJson = options.parentPkgJson
    const normalized: Record<string, YarnDependency> = {}

    // Load parent's package.json if not provided
    if (!parentPkgJson && parentPath) {
      const parentPkgPath = path.join(parentPath, "package.json")
      try {
        parentPkgJson = await this.cache.packageJson[parentPkgPath]
      } catch {
        // Parent might not have package.json (e.g., root workspace)
      }
    }

    for (const node of tree) {
      const match = node.name.match(/^(.*)@([^@]+)$/)
      if (!match) {
        log.debug({ name: node.name }, "invalid node name format")
        continue
      }

      const [, pkgName, version] = match
      const id = `${pkgName}@${version}`

      if (seen.has(id)) {
        continue
      }

      // Find the correct package path that matches the required version
      const pkg = await this.locatePackageVersion(parentPath, pkgName, version)
      const pkgPath = pkg ? pkg.packageDir : null

      if (!pkgPath) {
        log.warn({ pkgName, version, parentPath }, "could not find package matching version")
        continue
      }

      seen.add(id)

      const normalizedDep: YarnDependency = {
        name: pkgName,
        version,
        path: pkgPath,
        dependencies: {},
        optionalDependencies: {},
      }

      // Recursively process children, passing this package's info
      if (node.children && node.children.length > 0) {
        const childPkgJson = await this.cache.packageJson[path.join(pkgPath, "package.json")]
        const childDeps = await this.normalizeTree({
          tree: node.children,
          seen,
          appName,
          parentPath: pkgPath,
          parentPkgJson: childPkgJson, // Pass this package's package.json to children
        })

        for (const [childDepName, childDep] of Object.entries(childDeps)) {
          normalizedDep.dependencies![childDepName] = childDep
        }
      }

      normalized[pkgName] = normalizedDep
    }

    return normalized
  }

  /**
   * Resolves a package path that matches the required version.
   * Searches in order: nested -> hoisted -> walk up tree
   */
  async resolvePackageWithVersion(pkgName: string, requiredVersion: string, parentPath: string, parentPkgJson?: PackageJson): Promise<string | null> {
    const searchPaths: string[] = []

    // 1. Nested under parent (highest priority for version conflicts)
    searchPaths.push(path.join(parentPath, "node_modules", pkgName))

    // 2. Hoisted at root
    searchPaths.push(path.join(this.rootDir, "node_modules", pkgName))

    // 3. Walk up the directory tree
    let current = path.dirname(parentPath)
    while (current !== this.rootDir && current !== path.dirname(current)) {
      searchPaths.push(path.join(current, "node_modules", pkgName))
      current = path.dirname(current)
    }

    // Try each path and validate version
    for (const candidatePath of searchPaths) {
      if (!(await this.cache.exists[candidatePath])) {
        continue
      }

      const pkgJsonPath = path.join(candidatePath, "package.json")
      try {
        const pkgJson = await this.cache.packageJson[pkgJsonPath]

        // Validate version matches
        if (pkgJson.version === requiredVersion) {
          log.debug(
            {
              pkgName,
              requiredVersion,
              foundVersion: pkgJson.version,
              path: candidatePath,
            },
            "found matching package version"
          )
          return candidatePath
        } else {
          log.debug(
            {
              pkgName,
              requiredVersion,
              foundVersion: pkgJson.version,
              path: candidatePath,
            },
            "package version mismatch, continuing search"
          )
        }
      } catch (error: any) {
        log.debug(
          {
            pkgName,
            path: candidatePath,
            error: error.message,
          },
          "failed to read package.json, skipping"
        )
      }
    }

    // If no exact match found, log warning
    log.warn(
      {
        pkgName,
        requiredVersion,
        parentPath,
        searchedPaths: searchPaths,
      },
      "could not find package with matching version"
    )

    return null
  }

  protected async collectAllDependencies(tree: YarnDependency, packageToExclude: string) {
    const rootPkgJson = await this.appPkgJson.value
    const failedPackages = new Set<string>()

    log.debug({ packageToExclude, hasWorkspaces: !!tree.workspaces }, "collectAllDependencies starting")

    const collect = async (
      deps: YarnDependency["dependencies"] | YarnDependency["optionalDependencies"] = {},
      isOptionalDependency: boolean,
      parentIsOptional: boolean = false
    ) => {
      for (const [, value] of Object.entries(deps)) {
        // Skip the app package if provided
        if (packageToExclude && value.name === packageToExclude) {
          log.debug({ name: value.name }, "skipping app package in collectAllDependencies")
          continue
        }

        const isRootOptional = !!rootPkgJson.optionalDependencies?.[value.name]
        const isDirectRootDep = rootPkgJson.dependencies?.[value.name] || rootPkgJson.optionalDependencies?.[value.name] || rootPkgJson.devDependencies?.[value.name]
        const treatAsOptional = isOptionalDependency || parentIsOptional || isRootOptional

        let p: string | null

        try {
          p = await this.cache.realPath[value.path]
        } catch (e) {
          if (treatAsOptional) {
            log.debug({ pkg: this.cacheKey(value), name: value.name }, "failed to resolve optional dependency, skipping")
            failedPackages.add(value.name)
            continue
          }

          if (!isDirectRootDep) {
            log.debug({ pkg: this.cacheKey(value), name: value.name }, "failed to resolve transitive dependency, treating as optional")
            failedPackages.add(value.name)
            continue
          }

          log.error({ pkg: this.cacheKey(value) }, "failed to resolve module directory")
          throw e
        }

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

        const childIsOptional = treatAsOptional
        await collect(m.dependencies, false, childIsOptional)
        await collect(m.optionalDependencies, true, true)
      }
    }

    await collect(tree.dependencies, false, false)
    await collect(tree.optionalDependencies, true, true)

    // Final cleanup: remove the app package from allDependencies
    if (packageToExclude) {
      for (const [key, dep] of this.allDependencies.entries()) {
        if (dep.name === packageToExclude) {
          log.debug({ key, name: dep.name }, "removing app package from allDependencies")
          this.allDependencies.delete(key)
        }
      }
    }

    if (failedPackages.size > 0) {
      const cleanDependencies = (deps: Record<string, YarnDependency> = {}) => {
        for (const [key, dep] of Object.entries(deps)) {
          if (failedPackages.has(dep.name)) {
            log.debug({ name: dep.name }, "removing failed package from tree")
            delete deps[key]
          } else {
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
