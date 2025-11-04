import { exists, log } from "builder-util"
import * as fs from "fs-extra"
import { access } from "fs/promises"
import { load } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency, ResolveModuleOptions, YarnDependency } from "./types"

export class YarnBerryNodeModulesCollector extends NpmNodeModulesCollector {
  public readonly installOptions = {
    manager: PM.YARN_BERRY,
    lockfile: "yarn.lock",
  }
  protected readonly isPnP = new Lazy<boolean>(async () => this.detectPnP(this.rootDir))

  // Only Yarn v1 uses CLI. We use pnp.cjs for PnP and manual tree build for Yarn Berry node_modules linker.
  // If those fail, then we fallback to npm query. That will fail if using corepack though, so we attempt to manually build the tree.
  protected async getDependenciesTree(): Promise<NpmDependency> {
    const isPnp = await this.isPnP.value
    if (isPnp) {
      // log.info(null, "using Yarn PnP for dependency tree extraction")
      // // Yarn PnP
      // // Reference: https://yarnpkg.com/features/pnp
      // // Note: .pnp.cjs is not always in the project root (can be in workspace root instead)
      // // So we explicitly specify the path here to avoid issues.
      // const pnpFile = path.join(this.rootDir, ".pnp.cjs")
      // const tree = this.getYarnPnPTree(this.rootDir, pnpFile)
      // if (tree) {
      //   return tree
      // }
      // log.warn({ pnpFile }, "Yarn PnP file not found or failed to load, falling back to npm collector")
      log.warn(null, "Yarn PnP extraction not supported directly due to virtual zip paths, falling back to npm collection")
    }

    try {
      return await super.getDependenciesTree(PM.NPM)
    } catch (error: any) {
      log.info({ error: error.message }, "unable to process dependency tree, falling back to using manual node_modules traversal for yarn berry")
    }
    // Yarn Berry node_modules linker fallback. (Slower due to system ops, so we only use it as a fallback)
    return await this.buildNodeModulesTreeManually(this.rootDir)
  }

  protected async extractProductionDependencyGraph(tree: NpmDependency, dependencyId: string): Promise<void> {
    if (this.productionGraph[dependencyId]) {
      return
    }
    const productionDeps = Object.entries(tree.dependencies || {}).map(async ([, dependency]) => {
      const childDependencyId = this.packageVersionString(dependency)
      const dep = {
        ...dependency,
        name: dependency.name,
        path: this.resolvePath(dependency.path),
      }
      await this.extractProductionDependencyGraph(dep, childDependencyId)
      return childDependencyId
    })
    this.productionGraph[dependencyId] = { dependencies: await Promise.all(productionDeps) }
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
    } catch (error: any) {
      log.warn({ error: error.message }, "failed to detect Yarn PnP configuration")
    }
    return false
  }
}
