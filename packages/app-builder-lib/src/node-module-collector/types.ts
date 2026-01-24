export type PackageJson = {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  workspaces?: string[] | { packages: string[] }
}

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
  readonly workspaces?: string[] | { packages: string[] } // we only use this at root level
}

// Note: `PnpmDependency` and `NpmDependency` include the output of `JSON.parse(...)` of `pnpm list` and `npm list` respectively
// This object has a TON of info - a majority, if not all, of each dependency's package.json
// We extract only what we need when constructing DependencyTree in `extractProductionDependencyTree`
export interface PnpmDependency extends Dependency<PnpmDependency, PnpmDependency> {
  readonly from: string
  readonly resolved: string
}

export interface NpmDependency extends Dependency<NpmDependency, string> {
  readonly resolved?: string
  // implicit dependencies, returned only through `npm list`
  readonly _dependencies?: {
    [packageName: string]: string
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface YarnBerryDependency extends Dependency<YarnBerryDependency, string> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface YarnDependency extends Dependency<YarnDependency, YarnDependency> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TraversedDependency extends Dependency<TraversedDependency, TraversedDependency> {}

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
  [packageNameAndVersion: string]: {
    readonly dependencies: string[]
  }
}
