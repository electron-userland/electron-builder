import { log } from "builder-util"
<<<<<<< HEAD
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
=======
import { PM } from "./packageManager"
import { NpmDependency } from "./types"
import { TraversalNodeModulesCollector } from "./traversalNodeModulesCollector"
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)

export class BunNodeModulesCollector extends TraversalNodeModulesCollector {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

<<<<<<< HEAD
  protected async getDependenciesTree(pm: PM): Promise<TraversedDependency> {
    log.info(null, "note: bun does not support any CLI for dependency tree extraction, utilizing file traversal collector instead")
=======
  protected async getDependenciesTree(pm: PM): Promise<NpmDependency> {
    log.info(null, "note: bun does not support any CLI for dependency tree extraction, utilizing manual traversal of node_modules")
>>>>>>> 850646b29 (move the manual node module traversal to the root abstract class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments. extract fallback node collector (Traversal) to separate class due to differing parsing logic from NPM collector)
    return super.getDependenciesTree(pm)
  }
}
