import { log } from "builder-util"
import { PM } from "./packageManager"
import { TraversalNodeModulesCollector } from "./traversalNodeModulesCollector"
import { TraversedDependency } from "./types"

export class BunNodeModulesCollector extends TraversalNodeModulesCollector {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

  protected async getDependenciesTree(_pm: PM): Promise<TraversedDependency> {
    log.info(null, "note: bun does not support any CLI for dependency tree extraction, utilizing manual traversal collector instead")
    return super.getDependenciesTree(PM.TRAVERSAL)
  }
}
