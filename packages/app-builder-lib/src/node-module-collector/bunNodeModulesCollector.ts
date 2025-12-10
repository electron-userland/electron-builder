import { log } from "builder-util"
<<<<<<< HEAD
<<<<<<< HEAD
import { PM } from "./packageManager.js"
import { TraversedDependency } from "./types.js"
import { TraversalNodeModulesCollector } from "./traversalNodeModulesCollector.js"
=======
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector.js.js"
import { PM } from "./packageManager.js.js"
import { NpmDependency } from "./types.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector.js"
import { PM } from "./packageManager.js"
import { NpmDependency } from "./types.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

export class BunNodeModulesCollector extends TraversalNodeModulesCollector {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

  protected async getDependenciesTree(pm: PM): Promise<TraversedDependency> {
    log.info(null, "note: bun does not support any CLI for dependency tree extraction, utilizing file traversal collector instead")
    return super.getDependenciesTree(pm)
  }
}
