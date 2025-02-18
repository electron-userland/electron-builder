export interface NodeModuleInfo {
  name: string
  version: string
  dir: string
  dependencies?: Array<NodeModuleInfo>
}

export interface ParsedDependencyTree {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly workspaces?: string[] // we only use this at root level
}

export interface DependencyTree extends Dependency<DependencyTree>, ParsedDependencyTree {
  implicitDependenciesInjected: boolean
}

export interface NpmDependency extends Dependency<NpmDependency>, ParsedDependencyTree {
  // Output of `JSON.parse(...)` of `npm list` and `pnpm list`
  // This object has a TON of info - a majority, if not all, of the dependency's package.json
  // We extract only what we need when constructing DependencyTree
}

export type Dependency<T> = {
  dependencies?: {
    [packageName: string]: T
  }
  optionalDependencies?: {
    [packageName: string]: string
  }
  peerDependencies?: {
    [packageName: string]: string
  }
  // npm-specific: implicit dependencies from `npm list --json`
  _dependencies?: {
    [packageName: string]: string
  }
}

export interface DependencyGraph {
  [packageNameAndVersion: string]: PackageDependencies
}

interface PackageDependencies {
  dependencies: string[]
}
