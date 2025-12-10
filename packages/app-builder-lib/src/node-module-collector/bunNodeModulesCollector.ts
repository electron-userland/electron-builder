import { log } from "builder-util"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector.js"
import { PM } from "./packageManager.js"
import { NpmDependency } from "./types.js"

export class BunNodeModulesCollector extends NpmNodeModulesCollector {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

  protected async getDependenciesTree(_pm: PM): Promise<NpmDependency> {
    log.info(null, "bun does not support any CLI for dependency tree extraction, falling back to NPM node module collector")
    return super.getDependenciesTree(PM.NPM)
  }

  protected isProdDependency(packageName: string, tree: NpmDependency): boolean {
    return tree.dependencies?.[packageName] != null || tree.optionalDependencies?.[packageName] != null
  }
}
