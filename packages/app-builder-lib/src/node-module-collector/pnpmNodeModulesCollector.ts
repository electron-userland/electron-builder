import { log } from "builder-util"
import * as fs from "fs-extra"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { PM } from "./packageManager"
import { Dependency, PnpmDependency } from "./types"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  public readonly installOptions = {
    manager: PM.PNPM,
    lockfile: "pnpm-lock.yaml",
  }

  protected getArgs(): string[] {
    return ["list", "--prod", "--json", "--depth", "Infinity"]
  }

  protected async extractProductionDependencyGraph(tree: PnpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }

    let packageJson: Dependency<string, string>
    try {
      // use .from instead of .name for pnpm
      const dependencyPath = await this.resolveModuleDir({ pkg: tree.from, base: tree.path, virtualPath: tree.resolved })
      const packageJsonPath = path.join(dependencyPath, "package.json")
      // Attempt to extract the production dependency graph
      if (!(await fs.pathExists(packageJsonPath))) {
        log.warn({ packageJsonPath }, "package.json not found for module, skipping production dependency extraction")
        this.productionGraph[dependencyId] = { dependencies: [] }
        return
      }
      packageJson = require(packageJsonPath)
    } catch (error: any) {
      log.error({ error: error.message }, "node module collector threw error extracting production dependency graph")
      throw error
    }
    const prodDependencies = { ...packageJson.dependencies, ...packageJson.optionalDependencies }

    const allDeps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    this.productionGraph[dependencyId] = { dependencies: [] }
    const deps = Object.entries(allDeps)
      .filter(([packageName, dependency]) => {
        // First check if it's in production dependencies
        if (!prodDependencies[packageName]) {
          return false
        }

        // Then check if optional dependency path exists
        if (packageJson.optionalDependencies?.[packageName] && !fs.existsSync(dependency.path)) {
          log.debug({ packageName, version: dependency.version, path: dependency.path }, `optional dependency path doesn't exist`)
          return false
        }

        return true
      })
      .map(async ([, dependency]) => {
        const packageId = this.moduleKeyGenerator(dependency)
        await this.extractProductionDependencyGraph(dependency, packageId)
        return packageId
      })

    const dependencies = await Promise.all(deps)
    this.productionGraph[dependencyId] = { dependencies }
  }

  protected moduleKeyGenerator(pkg: PnpmDependency): string {
    // use .from instead of .name for pnpm
    return `${pkg.from}@${pkg.version}`
  }

  protected async collectAllDependencies(tree: PnpmDependency): Promise<void> {
    const collect = async (deps: PnpmDependency["dependencies"] | PnpmDependency["optionalDependencies"] = {}) => {
      for (const [, value] of Object.entries(deps)) {
        let p: string
        try {
          p = await this.resolveModuleDir({ pkg: value.from, base: value.path, virtualPath: value.resolved })
        } catch {
          // ignore. optional dependency may not be installed (we throw in resolveModuleDir in this case)
          continue
        }
        const m = {
          ...value,
          // use .from instead of .name for pnpm
          name: value.from,
          path: p,
        }
        const moduleKey = this.moduleKeyGenerator(m)
        if (this.allDependencies.has(moduleKey)) {
          continue
        }
        this.allDependencies.set(moduleKey, m)
        await this.collectAllDependencies(m)
      }
    }
    // Collect regular dependencies
    await collect(tree.dependencies)
    // Collect optional dependencies if they exist
    await collect(tree.optionalDependencies)
  }

  protected async resolveModuleDir(options: { pkg: string; base: string; virtualPath: string | undefined }): Promise<string> {
    if (options.base === this.rootDir) {
      return options.base
    }
    return await super.resolveModuleDir(options)
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<PnpmDependency> {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return Promise.resolve(dependencyTree[0])
  }
}
