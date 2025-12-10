import { log } from "builder-util"
import { PM } from "./packageManager"
import { NpmDependency } from "./types"
import { TraversalNodeModulesCollector } from "./traversalNodeModulesCollector"

export class BunNodeModulesCollector extends TraversalNodeModulesCollector {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

  protected async getDependenciesTree(pm: PM): Promise<NpmDependency> {
    log.info(null, "note: bun does not support any CLI for dependency tree extraction, utilizing manual traversal of node_modules")
    return super.getDependenciesTree(pm)
  }
}
