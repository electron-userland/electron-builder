export interface NodeModuleInfo {
  name: string
  version: string
  dir: string
  dependencies?: Array<NodeModuleInfo>
}

export interface DependencyTree {
  readonly version?: string
  readonly name?: string
  readonly from?: string
  readonly workspaces?: string[]
  readonly path: string
  dependencies: {
    [packageName: string]: DependencyTree
  }
  // for npm list --json
  _dependencies?: {
    [packageName: string]:  string 
  }
  optionalDependencies?: {
    [packageName: string]: DependencyTree
  }
  peerDependencies?: {
    [packageName: string]: DependencyTree
  }
}

export interface Dependency {
  dependencies?: {
    [packageName: string]: string 
  }
  optionalDependencies?: {
    [packageName: string]: string 
  }
}

export interface DependencyGraph {
  [packageNameAndVersion: string]: PackageDependencies
}

interface PackageDependencies {
  dependencies?: string[]
}
