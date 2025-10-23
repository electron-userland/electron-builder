import { PM } from "./packageManager"
import { YarnDependency } from "./types"
import { log } from "builder-util"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { NPM_LIST_ARGS } from "./npmNodeModulesCollector"
import * as path from "path"
import * as fs from "fs-extra"
import { access } from "fs/promises"

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
      if (isPnP) {
        log.info({ isPnP }, "expecting node_modules linker for non-PnP. Will attempt falling back to npm query if error.")
      }
      return await super.getDependenciesTree(PM.NPM)
    } catch (error: any) {
      log.debug({ error: error.message }, "failed to extract Yarn dependencies tree")
    }
    // Yarn Berry node_modules linker fallback. (Slower due to system ops, so we only use it as a fallback)
    log.info(null, "unable to process dependency tree, falling back to using manual node_modules traversal for Yarn v2+.")
    return await this.buildNodeModulesTreeManually(this.rootDir)
  }

  protected async resolveModuleDir(options: { pkg: string; base: string; virtualPath: string | undefined }): Promise<string> {
    const { pkg, base } = options
    try {
      return await super.resolveModuleDir(options)
    } catch (error: any) {
      // fallback: Yarn2 virtual packages
      const unpluggedDir = path.join(base, ".yarn/unplugged")
      const matches = await fs.readdir(unpluggedDir).catch(() => [])
      const found = matches.find(name => name.startsWith(`${pkg}-npm-`))
      if (found) {
        return path.join(unpluggedDir, found, "node_modules", pkg)
      }
      log.debug({ pkg, base, error: error.message }, "failed to resolve module dir, falling back to default resolution")
    }
    // Yarn Berry PnP does not use node_modules, so we resolve directly to the package directory.
    const searchPath = path.join(this.rootDir, "node_modules", pkg)
    // validate path exists or throw early (we'd rather exit early than have dependencies silently not-found)
    await access(searchPath)
    return searchPath
  }

  /**
   * Builds a dependency tree using only package.json dependencies and optionalDependencies.
   * This skips devDependencies and does not walk the node_modules filesystem.
   */
  private async buildNodeModulesTreeManually(baseDir: string): Promise<YarnDependency> {
    const visited = new Set<string>()

    const buildFromPackage = async (pkgDir: string): Promise<YarnDependency> => {
      const pkgPath = path.join(pkgDir, "package.json")
      const pkg = await fs.readJson(pkgPath)
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
          const depDir = await this.resolveModuleDir({ pkg: depName, base: pkgDir, virtualPath: undefined })
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
