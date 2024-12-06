import { Lazy } from "lazy-val"
import { executeAppBuilderAsJson } from "./appBuilder"

export function createLazyProductionDeps<T extends boolean>(projectDir: string, excludedDependencies: Array<string> | null, flatten: T) {
  return new Lazy(async () => {
    const args = ["node-dep-tree", "--dir", projectDir]
    if (flatten) args.push("--flatten")
    if (excludedDependencies != null) {
      for (const name of excludedDependencies) {
        args.push("--exclude-dep", name)
      }
    }
    return executeAppBuilderAsJson<Array<T extends true ? NodeModuleInfo : NodeModuleDirInfo>>(args)
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
  readonly dependencies?: Array<NodeModuleInfo>
}
