import { log } from "builder-util"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency } from "./types"

export class BunNodeModulesCollector extends NpmNodeModulesCollector {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

  protected async getDependenciesTree(_pm: PM): Promise<NpmDependency> {
    log.info(null, "note: bun does not support any CLI for dependency tree extraction, utilizing NPM node module collector instead")
    return super.getDependenciesTree(PM.NPM)
  }
}
