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
  workspaces?: string[]
  dependencies?: {
    [packageName: string]: ParsedDependencyTree
  }
}

class ParsedDependencyTreeDummy implements Required<NpmDependency> {
  name = ""
  version = ""
  path = ""
  workspaces = []
  dependencies = {}
  optionalDependencies = {}
  peerDependencies = {}
  _dependencies = {}
}
export const PARSED_DEPENDENCY_TREE_KEYS = Object.keys(new ParsedDependencyTreeDummy())

export interface DependencyTree extends Dependency<DependencyTree>, Omit<ParsedDependencyTree, "dependencies"> {
  // I hate this, but this needs to be optional to convert NpmDependency=>DependencyTree before this value can get set
  // We can't set this with an initial value due to the need to set it recursively, and this can't be recursively applied beforehand without a `RangeError: Maximum call stack size exceeded`
  circularDependencyDetected: boolean
}

export interface NpmDependency extends Dependency<NpmDependency>, Omit<ParsedDependencyTree, "dependencies"> {
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
  // npm-specific: for `npm list --json` to detect circular dependencies
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
