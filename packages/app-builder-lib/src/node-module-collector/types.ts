export type YarnListJsonLine = { type: "tree"; data: { type: "list"; trees: YarnListTree[] } } | { type: "info" | "warning" | "error"; data: string }

export interface YarnListTree {
  name: string // "pkg@1.2.3"
  children: YarnListTree[]
  shadow?: boolean
}

export type ResolveModuleOptions<T> = {
  dependency: T
  // base: string
  virtualPath?: string // e.g. for file: dependencies or symlinked dependencies
  isOptionalDependency?: boolean
  // cacheKeySuffix?: string
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
  readonly workspaces?: string[] // we only use this at root level
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
  // implicit dependencies
  readonly _dependencies?: {
    [packageName: string]: string
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface YarnBerryDependency extends Dependency<YarnBerryDependency, string> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface YarnDependency extends Dependency<YarnDependency, YarnDependency> {}

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
