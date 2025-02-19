export interface NodeModuleInfo {
  name: string
  version: string
  dir: string
  dependencies?: Array<NodeModuleInfo>
}

export type ParsedDependencyTree = {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly workspaces?: string[] // we only use this at root level
}

export interface DependencyTree extends Omit<Dependency<DependencyTree, DependencyTree>, "optionalDependencies"> {
  readonly implicitDependenciesInjected: boolean
}

// Note: `PnpmDependency` and `NpmDependency` include the output of `JSON.parse(...)` of `pnpm list` and `npm list` respectively
// This object has a TON of info - a majority, if not all, of each dependency's package.json
// We extract only what we need when constructing DependencyTree in `extractProductionDependencyTree`
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PnpmDependency extends Dependency<PnpmDependency, PnpmDependency> {}
export interface NpmDependency extends Dependency<NpmDependency, string> {
  // implicit dependencies
  readonly _dependencies?: {
    [packageName: string]: string
  }
}

export type Dependency<T, V> = Dependencies<T, V> & ParsedDependencyTree

export type Dependencies<T, V> = {
  readonly dependencies?: {
    [packageName: string]: T
  }
  readonly optionalDependencies?: {
    [packageName: string]: V
  }
}

export interface DependencyGraph {
  [packageNameAndVersion: string]: PackageDependencies
}

interface PackageDependencies {
  readonly dependencies: string[]
}
