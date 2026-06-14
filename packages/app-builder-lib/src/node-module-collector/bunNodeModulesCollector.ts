import { log } from "builder-util"
import { PM } from "./packageManager.js"
import { TraversedDependency } from "./types.js"
import { TraversalNodeModulesCollector } from "./traversalNodeModulesCollector.js"

export class BunNodeModulesCollector extends TraversalNodeModulesCollector {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

  protected async getDependenciesTree(pm: PM): Promise<TraversedDependency> {
    log.info(null, "note: bun does not support any CLI for dependency tree extraction, utilizing file traversal collector instead")
    return super.getDependenciesTree(pm)
  }
}
