import { Lazy } from "lazy-val"
import { executeAppBuilderAsJson } from "./appBuilder"

export function createLazyProductionDeps(projectDir: string, excludedDependencies: Array<string> | null, isFlatten: boolean = false) {
  return new Lazy(async () => {
    let args = ["node-dep-tree", "--dir", projectDir]
    if (isFlatten) {
      args = ["node-dep-tree", "--flatten", "--dir", projectDir]
    }
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
  readonly version: string
  readonly dir: string
  readonly conflictDependency: Array<NodeModuleInfo>
}
