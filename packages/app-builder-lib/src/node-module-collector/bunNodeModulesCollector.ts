import { log } from "builder-util"
import * as path from "path"
import { sync as resolveSync } from "resolve"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { BunDependency, BunManifest, Dependencies } from "./types"

export class BunNodeModulesCollector extends NodeModulesCollector<BunDependency, BunDependency> {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

  private readonly dependencyCacheByPath = new Map<string, BunDependency>()

  protected async getDependenciesTree(): Promise<BunDependency> {
    const rootManifest = require(path.join(this.rootDir, "package.json"))
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

  protected getArgs(): string[] {
    return []
  }

  protected collectAllDependencies(tree: BunDependency): void {
    const allDeps = [...Object.values(tree.dependencies || {}), ...Object.values(tree.optionalDependencies || {})]

    for (const dependency of allDeps) {
      const key = `${dependency.name}@${dependency.version}`
      if (!this.allDependencies.has(key)) {
        this.allDependencies.set(key, dependency)
        this.collectAllDependencies(dependency)
      }
    }
  }

  protected extractProductionDependencyGraph(tree: BunDependency, dependencyId: string): void {
    if (this.productionGraph[dependencyId]) {
      return
    }

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
        if (manifest[alias]) {
          const childId = `${dep.name}@${dep.version}`
          dependencies.push(childId)
          this.extractProductionDependencyGraph(dep, childId)
        }
      }
    }

    this.productionGraph[dependencyId] = { dependencies }
  }

  protected parseDependenciesTree(jsonBlob: string): BunDependency {
    return JSON.parse(jsonBlob)
  }

  private async resolveChildren(requesterDir: string, manifest: BunManifest): Promise<Dependencies<BunDependency, BunDependency>> {
    const dependencies: Record<string, BunDependency> = {}
    const optionalDependencies: Record<string, BunDependency> = {}

    for (const alias of Object.keys(manifest.manifestDependencies)) {
      const dependency = await this.loadDependency(alias, requesterDir, false)
      if (dependency) {
        dependencies[alias] = dependency
      }
    }

    for (const alias of Object.keys(manifest.manifestOptionalDependencies)) {
      const dependency = await this.loadDependency(alias, requesterDir, true)
      if (dependency) {
        optionalDependencies[alias] = dependency
      }
    }

    return { dependencies, optionalDependencies }
  }

  private async loadDependency(alias: string, requesterDir: string, isOptional: boolean): Promise<BunDependency | null> {
    const installedPath = this.findInstalledDependency(requesterDir, alias)
    if (!installedPath) {
      if (!isOptional) {
        log.debug({ alias, requesterDir }, "bun collector could not locate dependency")
      }
      return null
    }

    // Use resolved path directly - resolve.sync already handles symlinks with preserveSymlinks: false
    const cached = this.dependencyCacheByPath.get(installedPath)
    if (cached) {
      return cached
    }

    const manifest = require(path.join(installedPath, "package.json"))
    const packageName = manifest.name ?? alias
    const manifestDependencies = manifest.dependencies ?? {}
    const manifestOptionalDependencies = manifest.optionalDependencies ?? {}

    // Create a temporary placeholder to prevent infinite recursion
    const placeholder: BunDependency = {
      name: packageName,
      version: manifest.version ?? "0.0.0",
      path: installedPath,
      manifestDependencies,
      manifestOptionalDependencies,
    }
    this.dependencyCacheByPath.set(installedPath, placeholder)

    const childMaps = await this.resolveChildren(installedPath, { manifestDependencies, manifestOptionalDependencies })

    const dependency: BunDependency = {
      name: packageName,
      version: manifest.version ?? "0.0.0",
      path: installedPath,
      manifestDependencies,
      manifestOptionalDependencies,
      dependencies: Object.keys(childMaps.dependencies ?? {}).length > 0 ? childMaps.dependencies : undefined,
      optionalDependencies: Object.keys(childMaps.optionalDependencies ?? {}).length > 0 ? childMaps.optionalDependencies : undefined,
    }

    this.dependencyCacheByPath.set(installedPath, dependency)
    return dependency
  }

  private findInstalledDependency(basedir: string, dependencyName: string): string | null {
    try {
      const packageJsonPath = resolveSync(path.join(dependencyName, "package.json"), {
        basedir,
        preserveSymlinks: false,
        includeCoreModules: false,
      })
      return path.dirname(packageJsonPath)
    } catch (e: any) {
      if (e?.code === "MODULE_NOT_FOUND") {
        return null
      }
      throw e
    }
  }
}
