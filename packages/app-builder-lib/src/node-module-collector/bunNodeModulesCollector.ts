import { ELECTRON_BUILDER_SIGNALS, log } from "builder-util"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PM } from "./packageManager"
import { NpmDependency } from "./types"

export class BunNodeModulesCollector extends NpmNodeModulesCollector {
  public readonly installOptions = { manager: PM.BUN, lockfile: "bun.lock" }

  protected async getDependenciesTree(_pm: PM): Promise<NpmDependency> {
    log.info(ELECTRON_BUILDER_SIGNALS.COLLECT_FILES, null, "bun does not support any CLI for dependency tree extraction, falling back to NPM node module collector")
    return super.getDependenciesTree(PM.NPM)
  }

  protected isProdDependency(packageName: string, tree: NpmDependency): boolean {
    return tree.dependencies?.[packageName] != null || tree.optionalDependencies?.[packageName] != null
  }
}
