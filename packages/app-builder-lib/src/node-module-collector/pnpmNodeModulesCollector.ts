import { log } from "builder-util"
import * as fs from "fs-extra"
import * as path from "path"
import { NodeModulesCollector } from "./nodeModulesCollector"
import { getPackageManagerCommand, PM } from "./packageManager"
import { Dependency, PnpmDependency } from "./types"
import { Lazy } from "lazy-val"
import * as os from "os"

export class PnpmNodeModulesCollector extends NodeModulesCollector<PnpmDependency, PnpmDependency> {
  public readonly installOptions = {
    manager: PM.PNPM,
    lockfile: "pnpm-lock.yaml",
    lockfileDirs: (workspaceRoot: string) =>
      new Lazy(async () => {
        try {
          const home = os.homedir()
          const defaultStore = path.join(home, ".pnpm-store")
          const rcFile = path.join(home, ".npmrc")

          if (await fs.pathExists(rcFile)) {
            const content = await fs.readFile(rcFile, "utf8")
            const match = content.match(/^store-dir\s*=\s*(.+)$/m)
            if (match) {
              return [path.resolve(match[1])]
            }
          }

          // fallback: look for local virtual store
          const virtualStoreDir = path.join(workspaceRoot, "node_modules", ".pnpm")
          if (await fs.pathExists(virtualStoreDir)) {
            return [virtualStoreDir]
          }

          return [defaultStore]
        } catch (error: any) {
          log.debug({ workspaceRoot, error: error.message, stack: error.stack }, "no store dir detected")
        }
        return []
      }),
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
      const dependencyPath = await this.resolveModuleDir(tree.from, tree.path)
      // Attempt to extract the production dependency graph
      packageJson = require(path.join(dependencyPath, "package.json"))
    } catch (error: any) {
      log.error({ error: error.message, stack: error.stack }, "node module collector threw error extracting production dependency graph")
      throw error
    }
    const prodDependencies = { ...packageJson.dependencies, ...packageJson.optionalDependencies }

    const deps = { ...(tree.dependencies || {}), ...(tree.optionalDependencies || {}) }
    this.productionGraph[dependencyId] = { dependencies: [] }
    const dependencies = Object.entries(deps)
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
      .map(async ([packageName, dependency]) => {
        const childDependencyId = `${packageName}@${dependency.version}`
        await this.extractProductionDependencyGraph(dependency, childDependencyId)
        return childDependencyId
      })

    this.productionGraph[dependencyId] = { dependencies: await Promise.all(dependencies) }
  }

  protected async collectAllDependencies(tree: PnpmDependency): Promise<void> {
    const collect = async (deps: PnpmDependency["dependencies"] | PnpmDependency["optionalDependencies"] = {}) => {
      for (const [, value] of Object.entries(deps)) {
        const module = {
          ...value,
          // use .from instead of .name for pnpm
          name: value.from,
          path: await this.resolveModuleDir(value.from, value.path),
        }
        this.allDependencies.set(this.moduleKeyGenerator(module), module)
        await this.collectAllDependencies(module)
      }
    }
    // Collect regular dependencies
    await collect(tree.dependencies)
    // Collect optional dependencies if they exist
    await collect(tree.optionalDependencies)
  }

  protected async resolveModuleDir(pkg: string, base: string): Promise<string> {
    if (base === this.rootDir) {
      return base
    }
    return await super.resolveModuleDir(pkg, base)
  }

  protected async parseDependenciesTree(jsonBlob: string): Promise<PnpmDependency> {
    const dependencyTree: PnpmDependency[] = JSON.parse(jsonBlob)
    // pnpm returns an array of dependency trees
    return Promise.resolve(dependencyTree[0])
  }
}
