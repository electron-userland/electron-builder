export interface NodeModuleInfo {
  name: string
  version: string
  dir: string
  dependencies?: Array<NodeModuleInfo>
}

export interface DependencyTree extends Dependency<DependencyTree>, ParsedDependencyTree {
  // I hate this, but this needs to be optional to convert NpmDependency=>DependencyTree before this value can get set
  // We can't set this with an initial value due to the need to set it recursively, and this can't be recursively applied beforehand without a `RangeError: Maximum call stack size exceeded`
  circularDependencyDetected?: boolean
}

export interface ParsedDependencyTree {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly workspaces?: string[]
}

export interface NpmDependency extends Dependency<NpmDependency>, ParsedDependencyTree {
  // npm-specific: for `npm list --json` to detect circular dependencies
  // _dependencies?: {
  //   [packageName: string]: NpmDependency
  // }
}

export type Dependency<T> = {
  dependencies?: {
    [packageName: string]: T
  }
  optionalDependencies?: {
    [packageName: string]: T
  }
  peerDependencies?: {
    [packageName: string]: T
  }
  // npm-specific: for `npm list --json` to detect circular dependencies
  _dependencies?: {
    [packageName: string]: T
  }
}

export interface DependencyGraph {
  [packageNameAndVersion: string]: PackageDependencies
}

interface PackageDependencies {
  dependencies: string[]
}
