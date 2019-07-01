import { Lazy } from "lazy-val"
import { executeAppBuilderAsJson } from "./appBuilder"

export function createLazyProductionDeps(projectDir: string, excludedDependencies: Array<string> | null) {
  return new Lazy(async () => {
    const args = ["node-dep-tree", "--dir", projectDir]
    if (excludedDependencies != null) {
      for (const name of excludedDependencies) {
        args.push("--exclude-dep", name)
      }
    }
    return executeAppBuilderAsJson<Array<any>>(args)
  })
}

export interface NodeModuleDirInfo {
  readonly dir: string
  readonly deps: Array<NodeModuleInfo>
}

export interface NodeModuleInfo {
  readonly name: string
}