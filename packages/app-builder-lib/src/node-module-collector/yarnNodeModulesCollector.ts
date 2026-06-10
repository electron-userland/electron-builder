import { NpmNodeModulesCollector } from "./npmNodeModulesCollector.js"
import { PM } from "./packageManager.js"
import { NpmDependency } from "./types.js"

// Yarn Classic (v1) produces a hoisted node_modules structure similar to npm.
// Instead of parsing Yarn's custom NDJSON output, we leverage npm's list command
// which NpmNodeModulesCollector already handles.
export class YarnNodeModulesCollector extends NpmNodeModulesCollector {
  public readonly installOptions = {
    manager: PM.YARN,
    lockfile: "yarn.lock",
  }

  protected async getDependenciesTree(_pm: PM): Promise<NpmDependency> {
    return super.getDependenciesTree(PM.NPM)
  }
}
