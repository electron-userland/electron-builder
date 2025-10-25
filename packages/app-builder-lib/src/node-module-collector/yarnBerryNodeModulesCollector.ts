import { exists, log } from "builder-util"
import * as fs from "fs-extra"
import { access } from "fs/promises"
import { load } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency, ResolveModuleOptions } from "./types"

export class YarnBerryNodeModulesCollector extends NpmNodeModulesCollector {
  public readonly installOptions = {
    manager: PM.YARN_BERRY,
    lockfile: "yarn.lock",
  }
  protected readonly isPnP = new Lazy<boolean>(async () => this.detectPnP(this.rootDir))

  // Only Yarn v1 uses CLI. We use pnp.cjs for PnP and manual tree build for Yarn Berry node_modules linker.
  // If those fail, then we fallback to npm query. That will fail if using corepack though, so we attempt to manually build the tree.
  protected async getDependenciesTree(): Promise<NpmDependency> {
    if (await this.isPnP.value) {
      log.debug(null, "using Yarn PnP for dependency tree extraction")
      // Yarn PnP
      // Reference: https://yarnpkg.com/features/pnp
      // Note: .pnp.cjs is not always in the project root (can be in workspace root instead)
      // So we explicitly specify the path here to avoid issues.
      const pnpFile = path.join(this.rootDir, ".pnp.cjs")
      const tree = this.getYarnPnPTree(this.rootDir, pnpFile)
      if (tree) {
        return tree
      }
      log.warn({ pnpFile }, "Yarn PnP file not found or failed to load, falling back to npm collector")
    }

    try {
      return await super.getDependenciesTree(PM.NPM)
    } catch (error: any) {
      log.debug({ error: error.message }, "failed to extract Yarn dependencies via npm-compatible CLI")
    }
    // Yarn Berry node_modules linker fallback. (Slower due to system ops, so we only use it as a fallback)
    log.info(null, "unable to process dependency tree, falling back to using manual node_modules traversal for Yarn v2+.")
    return await this.buildNodeModulesTreeManually(this.rootDir)
  }

  protected async extractProductionDependencyGraph(tree: NpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }
    const productionDeps = Object.entries(tree.dependencies || {}).map(async ([, dependency]) => {
      const childDependencyId = this.moduleKeyGenerator(dependency)
      const dep = {
        ...dependency,
        name: dependency.name,
        path: await this.resolveModuleDir({ pkg: dependency.name, base: dependency.path, virtualPath: undefined }),
      }
      await this.extractProductionDependencyGraph(dep, childDependencyId)
      return childDependencyId
    })
    this.productionGraph[dependencyId] = { dependencies: await Promise.all(productionDeps) }
  }

  protected async resolveModuleDir(options: ResolveModuleOptions): Promise<string> {
    const { pkg, base, isOptionalDependency = false } = options
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
    try {
      await access(searchPath)
      return searchPath
    } catch {
      throw new Error(`Cannot resolve module ${pkg} from ${base}${isOptionalDependency ? " (optional dependency)" : ""}`)
    }
  }

  private getYarnPnPTree(cwd: string, pnpPath: string): NpmDependency | undefined {
    try {
      const pnpApi = require(pnpPath)
      const topLocator = pnpApi.topLevel
      const visited = new Set<string>()

      const buildNode = (locator: any): NpmDependency => {
        const info = pnpApi.getPackageInformation(locator)
        const dir = info?.packageLocation ? path.resolve(info.packageLocation) : path.resolve(cwd)
        if (dir.includes("virtual:")) {
          log.error({ dir, locator }, "unable to extract file(s) from Yarn PnP virtual package")
          throw new Error(
            `Cannot resolve Yarn PnP virtual package [${locator.name}@${locator.reference}] at [${dir}], please force hoisted node_modules installation instead of PnP`
          )
        }

        const node: NpmDependency = { name: locator.name, version: locator.reference, path: dir, dependencies: {}, resolved: dir }

        if (!info?.packageDependencies) {
          return node
        }

        for (const [depName, ref] of info.packageDependencies) {
          if (!ref) {
            continue
          }
          const key = `${depName}@${ref}`
          if (visited.has(key)) {
            continue
          }
          visited.add(key)
          const depLocator = pnpApi.getLocator(depName, ref)
          node.dependencies![depName] = buildNode(depLocator)
        }
        return node
      }

      return buildNode(topLocator)
    } catch (err: any) {
      log.error({ message: err.message }, "Yarn PnP extraction error")
    }
    return undefined
  }

  private async detectPnP(rootDir: string): Promise<boolean> {
    try {
      if ((await exists(path.join(rootDir, ".pnp.cjs"))) || (await exists(path.join(rootDir, ".pnp.js")))) {
        return true
      }
      const rcPath = path.join(rootDir, ".yarnrc.yml")
      if (await exists(rcPath)) {
        const cfg: any = load(await fs.readFile(rcPath, "utf-8"))
        if (cfg?.nodeLinker === "pnp") {
          return true
        }
      }
    } catch {
      // ignore
    }
    return false
  }
}
