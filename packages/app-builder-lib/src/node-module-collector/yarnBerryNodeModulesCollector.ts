import { PM } from "./packageManager"
import { YarnDependency } from "./types"
import { log } from "builder-util"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { NPM_LIST_ARGS } from "./npmNodeModulesCollector"
import * as path from "path"
import * as fs from "fs-extra"

export class YarnBerryNodeModulesCollector extends YarnNodeModulesCollector {
  public readonly installOptions = {
    manager: PM.YARN_BERRY,
    lockfile: "yarn.lock",
  }

  protected getArgs(): string[] {
    // Only Yarn v1 uses CLI. We use pnp.cjs for PnP and manual tree build for Yarn Berry node_modules linker.
    // If those fail, then we fallback to npm query. It will fail if using corepack, so we attempt to manually build the tree.
    return NPM_LIST_ARGS
  }

  protected async getDependenciesTree(): Promise<YarnDependency> {
    try {
      const isPnP = await this.isPnP.value
      log.debug({ isPnP }, "expecting `pnp.cjs` for PnP or node_modules linker for non-PnP. Will attempt falling back to npm query if neither.")
      return await super.getDependenciesTree(PM.NPM)
    } catch (error: any) {
      log.debug({ error: error.message, stack: error.stack }, "failed to extract Yarn dependencies tree")
    }
    // Yarn Berry node_modules linker fallback. (Slower due to system ops, so we only use it as a fallback)
    log.warn(null, "unable to process dependency tree, falling back to using manual node_modules traversal for Yarn v2+.")
    return await this.buildNodeModulesTreeManually(this.rootDir)
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
}
