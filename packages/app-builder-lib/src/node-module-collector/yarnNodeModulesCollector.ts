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
        path: await this.resolvePath(dependency.path),
      }

      const childDependencyId = this.packageVersionString(dep)
      await this.extractProductionDependencyGraph(dep, childDependencyId)
      return childDependencyId
    })

    this.productionGraph[dependencyId] = { dependencies: await Promise.all(productionDeps) }
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

    // const normalizedTree = await this.normalizeTree(parsedTree, new Set<string>(), undefined)
    const rootPkgJson = await this.appPkgJson.value

    const normalizedTree = await this.normalizeTreeBFS(parsedTree, rootPkgJson.name, this.rootDir)

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

  /**
   * BFS-based normalizeTree specifically for Yarn Classic v1.
   * Avoids recursion depth issues and resolves real on-disk paths robustly.
   */
  private async normalizeTreeBFS(rootTrees: YarnListTree[], appName?: string, parentRoot: string = this.rootDir): Promise<Record<string, YarnDependency>> {
    const normalized: Record<string, YarnDependency> = {}
    const seen = new Set<string>()

    // Work queue for BFS: each item carries both the tree node and its parent dir
    const queue: Array<{ node: YarnListTree; parentPath: string }> = []

    // Seed with root trees
    for (const node of rootTrees) {
      queue.push({ node, parentPath: parentRoot })
    }

    while (queue.length > 0) {
      const { node, parentPath } = queue.shift()!

      // Parse "pkg@version"
      const match = node.name.match(/^(.*)@([^@]+)$/)
      if (!match) {
        log.debug({ name: node.name }, "invalid node name format in BFS normalize")
        continue
      }

      const [, pkgName, declaredVersion] = match
      const id = `${pkgName}@${declaredVersion}`

      // Yarn classic marks shadow nodes but they may still physically exist nested.
      const isShadow = node.shadow && node.color === "dim"
      if (isShadow) {
        log.debug({ pkgName, declaredVersion }, "shadow node – Yarn claims hoisted")
      }

      // Skip if we already processed this versioned package
      if (seen.has(id)) {
        continue
      }
      seen.add(id)

      let pkgPath: string | null

      // ------------------------------------------------------
      // 1. Try nested under parentPath
      // ------------------------------------------------------
      const nested = path.join(parentPath, "node_modules", pkgName)
      const nestedExists = await this.existsMemoized(nested)

      if (isShadow && nestedExists) {
        log.warn({ pkgName, declaredVersion, nested, parentPath }, "Yarn claims hoisted but nested copy exists on disk (shadow contradiction)")
      }

      if (nestedExists) {
        pkgPath = nested
      } else {
        // ------------------------------------------------------
        // 2. Try hoisted under rootDir
        // ------------------------------------------------------
        const hoisted = path.join(this.rootDir, "node_modules", pkgName)
        const hoistedExists = await this.existsMemoized(hoisted)

        if (hoistedExists) {
          pkgPath = hoisted
        } else {
          // ------------------------------------------------------
          // 3. Full Node-style resolution fallback
          // ------------------------------------------------------
          try {
            pkgPath = (await this.resolvePackageDir(pkgName, parentPath))!
            log.debug({ pkgName, declaredVersion, resolved: pkgPath }, "resolvePackageDir() fallback succeeded in BFS")
          } catch {
            log.warn({ pkgName, declaredVersion, parentPath }, "could not locate package in nested/hoisted/fallback resolution (BFS)")
            continue
          }
        }
      }

      // ------------------------------------------------------
      // Retrieve real version from package.json
      // ------------------------------------------------------
      let realVersion = declaredVersion
      let pkgJson: PackageJson | undefined

      try {
        pkgJson = await this.readJsonMemoized(path.join(pkgPath, "package.json"))
        if (pkgJson?.version) {
          realVersion = pkgJson.version
          if (realVersion !== declaredVersion) {
            log.debug({ pkgName, declared: declaredVersion, real: realVersion }, "corrected real version from package.json during BFS")
          }
        }
      } catch {
        // If the hoisted path existed but package.json was missing, try nested fallback
        if (pkgPath.includes("node_modules") && !nestedExists) {
          log.warn({ pkgName, pkgPath }, "failed to read package.json — hoisted path may be ghost; retrying nested/fallback")

          if (nestedExists) {
            pkgPath = nested
          } else {
            try {
              pkgPath = await this.resolvePackageDir(pkgName, parentPath)
            } catch {
              log.error({ pkgName }, "package.json missing and no fallback resolution worked (BFS)")
              continue
            }
          }

          try {
            pkgJson = await this.readJsonMemoized(pkgPath!)
            if (pkgJson?.version) {
              realVersion = pkgJson.version
            }
          } catch {
            log.error({ pkgName, pkgPath }, "package.json still unreadable after fallback — skipping")
            continue
          }
        } else {
          log.warn({ pkgName, pkgPath }, "failed to read package.json for real version in BFS")
        }
      }

      // ------------------------------------------------------
      // Build the YarnDependency node
      // ------------------------------------------------------
      const dep: YarnDependency = {
        name: pkgName,
        version: realVersion,
        path: pkgPath!,
        dependencies: {},
        optionalDependencies: {},
      }

      normalized[pkgName] = dep

      // ------------------------------------------------------
      // Enqueue children for BFS
      // ------------------------------------------------------
      if (pkgPath && node.children && node.children.length > 0) {
        for (const child of node.children) {
          queue.push({ node: child, parentPath: pkgPath })
        }
      }
    }

    return normalized
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
          p = await this.resolvePath(value.path)
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
