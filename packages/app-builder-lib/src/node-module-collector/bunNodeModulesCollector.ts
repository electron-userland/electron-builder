import { log } from "builder-util"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { BunDependency, BunManifest, Dependencies } from "./types"

export class BunNodeModulesCollector extends NodeModulesCollector<BunDependency, BunDependency> {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

  // Cache for dependencies by their resolved path to prevent infinite recursion
  private readonly dependencyCacheByPath = new Map<string, BunDependency>()

  protected getArgs(): string[] {
    // Bun doesn't use CLI commands for tree parsing, we build it manually
    return []
  }

  protected async getDependenciesTree(): Promise<BunDependency> {
    const rootPkgPath = path.join(this.rootDir, "package.json")
    const rootManifest = this.requireMemoized(rootPkgPath)
    const rootName = rootManifest.name ?? "."

    const childMaps = await this.resolveChildren(this.rootDir, {
      manifestDependencies: rootManifest.dependencies ?? {},
      manifestOptionalDependencies: rootManifest.optionalDependencies ?? {},
    })

    return {
      name: rootName,
      version: rootManifest.version ?? "0.0.0",
      path: this.rootDir,
      manifestDependencies: rootManifest.dependencies ?? {},
      manifestOptionalDependencies: rootManifest.optionalDependencies ?? {},
      dependencies: Object.keys(childMaps.dependencies ?? {}).length > 0 ? childMaps.dependencies : undefined,
      optionalDependencies: Object.keys(childMaps.optionalDependencies ?? {}).length > 0 ? childMaps.optionalDependencies : undefined,
    }
  }

  protected async collectAllDependencies(tree: BunDependency): Promise<void> {
    const allDeps = [...Object.values(tree.dependencies || {}), ...Object.values(tree.optionalDependencies || {})]

    for (const dependency of allDeps) {
      const key = `${dependency.name}@${dependency.version}`
      if (!this.allDependencies.has(key)) {
        this.allDependencies.set(key, dependency)
        await this.collectAllDependencies(dependency)
      }
    }
  }

  protected async extractProductionDependencyGraph(tree: BunDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    // Initialize with empty dependencies to prevent infinite recursion
    this.productionGraph[dependencyId] = { dependencies: [] }

    const dependencies: string[] = []

    const processDeps = [
      { entries: tree.dependencies, manifest: tree.manifestDependencies },
      { entries: tree.optionalDependencies, manifest: tree.manifestOptionalDependencies },
    ]

    for (const { entries, manifest } of processDeps) {
      if (!entries) {
        continue
      }

      for (const [alias, dep] of Object.entries(entries)) {
        // Only include if it's declared in the manifest (production/optional, not dev)
        if (manifest[alias]) {
          const childId = `${dep.name}@${dep.version}`
          dependencies.push(childId)
          await this.extractProductionDependencyGraph(dep, childId)
        }
      }
    }

    this.productionGraph[dependencyId] = { dependencies }
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<BunDependency> {
    // This method is not used for Bun since we build the tree manually
    // but is required by the abstract class
    return Promise.resolve(JSON.parse(jsonBlob))
  }

  /**
   * Resolves all child dependencies (both regular and optional) for a given package
   */
  private async resolveChildren(requesterDir: string, manifest: BunManifest): Promise<Dependencies<BunDependency, BunDependency>> {
    const dependencies: Record<string, BunDependency> = {}
    const optionalDependencies: Record<string, BunDependency> = {}

    // Process regular dependencies
    for (const alias of Object.keys(manifest.manifestDependencies)) {
      const dependency = await this.loadDependency(alias, requesterDir, false)
      if (dependency) {
        dependencies[alias] = dependency
      }
    }

    // Process optional dependencies
    for (const alias of Object.keys(manifest.manifestOptionalDependencies)) {
      const dependency = await this.loadDependency(alias, requesterDir, true)
      if (dependency) {
        optionalDependencies[alias] = dependency
      }
    }

    return { dependencies, optionalDependencies }
  }

  /**
   * Loads a single dependency and recursively resolves its children
   */
  private async loadDependency(alias: string, requesterDir: string, isOptional: boolean): Promise<BunDependency | null> {
    const installedPath = this.resolvePackageDir(alias, requesterDir)

    if (!installedPath) {
      if (!isOptional) {
        log.debug({ alias, requesterDir }, "bun collector could not locate dependency")
      }
      return null
    }

    // Resolve symlinks to get the actual path
    const resolvedPath = await this.resolvePath(installedPath)

    // Check if we've already processed this dependency (by resolved path)
    const cached = this.dependencyCacheByPath.get(resolvedPath)
    if (cached) {
      log.debug({ name: cached.name, version: cached.version, path: resolvedPath }, "using cached dependency")
      return cached
    }

    const pkgJsonPath = path.join(resolvedPath, "package.json")

    // Check if package.json exists
    if (!(await this.existsMemoized(pkgJsonPath))) {
      log.warn({ alias, path: resolvedPath }, "package.json not found for dependency")
      return null
    }

    // Use memoized require to load package.json
    const manifest = this.requireMemoized(pkgJsonPath)
    const packageName = manifest.name ?? alias
    const manifestDependencies = manifest.dependencies ?? {}
    const manifestOptionalDependencies = manifest.optionalDependencies ?? {}

    // Create a temporary placeholder to prevent infinite recursion
    const placeholder: BunDependency = {
      name: packageName,
      version: manifest.version ?? "0.0.0",
      path: resolvedPath,
      manifestDependencies,
      manifestOptionalDependencies,
    }
    this.dependencyCacheByPath.set(resolvedPath, placeholder)

    log.debug({ name: packageName, version: placeholder.version, path: resolvedPath }, "loading dependency children")

    // Recursively resolve children
    const childMaps = await this.resolveChildren(resolvedPath, {
      manifestDependencies,
      manifestOptionalDependencies
    })

    // Create the final dependency object
    const dependency: BunDependency = {
      name: packageName,
      version: manifest.version ?? "0.0.0",
      path: resolvedPath,
      manifestDependencies,
      manifestOptionalDependencies,
      dependencies: Object.keys(childMaps.dependencies ?? {}).length > 0 ? childMaps.dependencies : undefined,
      optionalDependencies: Object.keys(childMaps.optionalDependencies ?? {}).length > 0 ? childMaps.optionalDependencies : undefined,
    }

    // Update cache with final dependency
    this.dependencyCacheByPath.set(resolvedPath, dependency)

    log.debug({ name: packageName, version: dependency.version, childCount: Object.keys(dependency.dependencies || {}).length }, "dependency loaded")

    return dependency
  }

  /**
   * Finds the installed location of a dependency using Node.js module resolution
   */
  // private findInstalledDependency(basedir: string, dependencyName: string): string | null {
  //   const cacheKey = `${dependencyName}::${basedir}`

  //   // Check if we've already resolved this
  //   if (this.cache.requireResolve.has(cacheKey)) {
  //     return this.cache.requireResolve.get(cacheKey)!
  //   }

  //   try {
  //     // Create a require function from the perspective of the basedir
  //     // This ensures proper module resolution based on the requesting package's location
  //     const requireStartingFile = path.join(path.resolve(basedir), "__fake_starting_file__.js")
  //     const localizedRequire = createRequire(requireStartingFile)

  //     // Resolve the package.json to find the package root
  //     const packageJsonPath = localizedRequire.resolve(path.join(dependencyName, "package.json"))
  //     const result = path.dirname(packageJsonPath)

  //     // Cache the result
  //     this.cache.requireResolve.set(cacheKey, result)

  //     return result
  //   } catch (e: any) {
  //     if (e?.code === "MODULE_NOT_FOUND") {
  //       // Cache null result to avoid repeated failed lookups
  //       this.cache.requireResolve.set(cacheKey, null)
  //       return null
  //     }
  //     // Re-throw unexpected errors
  //     log.error({ dependencyName, basedir, error: e.message }, "unexpected error resolving dependency")
  //     throw e
  //   }
  // }
}