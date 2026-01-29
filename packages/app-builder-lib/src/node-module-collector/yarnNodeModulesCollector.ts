import { log } from "builder-util"
import { Lazy } from "lazy-val"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector.js"
import { PM } from "./packageManager.js"
import { YarnDependency } from "./types.js"

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
    const rootPkgJson = (await this.cache.json[path.join(this.rootDir, "package.json")])!

    const normalizedTree = await this.normalizeTree({ tree: parsedTree, seen: new Set<string>(), appName: rootPkgJson.name, parentPath: this.rootDir })

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

  private async normalizeTree(options: { tree: YarnListTree[]; seen: Set<string>; appName?: string; parentPath: string }): Promise<Record<string, YarnDependency>> {
    const { tree, seen, appName, parentPath = this.rootDir } = options
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
        log.debug({ pkgName, version }, "registering shadow node (hoisted elsewhere), will resolve")
      }

      if (seen.has(id)) {
        continue
      }

      // Find the correct package path that matches the required version
      const pkg = await this.locatePackageWithVersion({ name: pkgName, version, path: parentPath })
      const pkgPath = pkg?.packageDir

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
        const childDeps = await this.normalizeTree({
          tree: node.children,
          seen,
          appName,
          parentPath: pkgPath,
        })

        for (const [childDepName, childDep] of Object.entries(childDeps)) {
          normalizedDep.dependencies![childDepName] = childDep
        }
      }

      normalized[pkgName] = normalizedDep
    }

    return normalized
  }

  protected async collectAllDependencies(tree: YarnDependency, packageToExclude: string) {
    const rootPkgJson = (await this.cache.json[path.join(this.rootDir, "package.json")])!
    const failedPackages = new Set<string>()

    const collect = async (
      deps: YarnDependency["dependencies"] | YarnDependency["optionalDependencies"] = {},
      isOptionalDependency: boolean,
      parentIsOptional: boolean = false
    ) => {
      for (const [, value] of Object.entries(deps)) {
        const isRootOptional = !!rootPkgJson.optionalDependencies?.[value.name]
        const isDirectRootDep = rootPkgJson.dependencies?.[value.name] || rootPkgJson.optionalDependencies?.[value.name] || rootPkgJson.devDependencies?.[value.name]
        const treatAsOptional = isOptionalDependency || parentIsOptional || isRootOptional

        const logFields = { name: value.name, version: value.version, path: value.path }
        const p = await this.cache.realPath[value.path]
        if (!(await this.cache.exists[p])) {
          if (treatAsOptional) {
            log.debug(logFields, "failed to find optional dependency, skipping")
            failedPackages.add(value.name)
            continue
          }

          if (!isDirectRootDep) {
            log.debug(logFields, "failed to find transitive dependency, treating as optional")
            failedPackages.add(value.name)
            continue
          }

          const message = "unable to find module directory; is the path correct?"
          log.error(logFields, message)
          throw new Error(`Failed to resolve module directory for ${value.name}@${value.version} at path: ${value.path}`)
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
          for (const [, d] of Object.entries(dep.dependencies || {})) {
            this.allDependencies.set(this.packageVersionString(d), d)
          }
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
