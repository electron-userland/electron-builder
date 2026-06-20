import { exists, isEmptyOrSpaces, log, LogLevel } from "builder-util"
import { PackageJson } from "./types.js"
import fs from "fs-extra"
import * as path from "path"
import * as semver from "semver"

// Tolerant package.json read for the node-module collectors: swallows ALL errors (not just ENOENT) to
// null, since the collectors intentionally skip unreadable entries (e.g. cross-drive Windows junctions
// whose failures are not ENOENT). Distinct from builder-util's orNullIfFileNotExist, which rethrows non-ENOENT.
export function readJsonOrNull<T = any>(file: string): Promise<T | null> {
  return fs.readJson(file).catch(() => null)
}

export enum LogMessageByKey {
  PKG_DUPLICATE_REF = "duplicate dependency references",
  PKG_DUPLICATE_REF_UNRESOLVED = "unresolved duplicate dependency references",
  PKG_NOT_FOUND = "cannot find path for dependency",
  PKG_NOT_ON_DISK = "dependency not found on disk",
  PKG_SELF_REF = "self-referential dependencies",
  PKG_OPTIONAL_NOT_INSTALLED = "missing optional dependencies",
  PKG_OPTIONAL_PLATFORM_NOT_INSTALLED = "platform-specific optional dependencies not bundled — add them to your project's optionalDependencies if your app requires them (pnpm 10+ does not auto-install transitive platform binaries)",
  PKG_COLLECTOR_OUTPUT = "collector stderr output",
  PKG_VERSION_OVERRIDDEN = "dependencies resolved to a version outside the declared range (installed version accepted — likely resolved via package manager overrides)",
  PKG_INCOMPATIBLE_PLATFORM = "excluded platform-incompatible dependencies (package.json `cpu`/`os` does not match the target arch/platform)",
}
export const logMessageLevelByKey: Record<LogMessageByKey, LogLevel> = {
  [LogMessageByKey.PKG_DUPLICATE_REF]: "info",
  [LogMessageByKey.PKG_DUPLICATE_REF_UNRESOLVED]: "warn",
  [LogMessageByKey.PKG_NOT_FOUND]: "warn",
  [LogMessageByKey.PKG_NOT_ON_DISK]: "warn",
  [LogMessageByKey.PKG_SELF_REF]: "debug",
  [LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED]: "info",
  [LogMessageByKey.PKG_OPTIONAL_PLATFORM_NOT_INSTALLED]: "warn",
  [LogMessageByKey.PKG_COLLECTOR_OUTPUT]: "warn",
  [LogMessageByKey.PKG_VERSION_OVERRIDDEN]: "debug",
  [LogMessageByKey.PKG_INCOMPATIBLE_PLATFORM]: "info",
}

export type Package = { packageDir: string; packageJson: PackageJson }

// Type aliases for clarity
type JsonCache = Record<string, Promise<PackageJson | null>>
type RealPathCache = Record<string, Promise<string>>
type ExistsCache = Record<string, Promise<boolean>>
type LstatCache = Record<string, Promise<fs.Stats | null>>
type PackageCache = Record<string, Promise<Package | null>>
type LogSummaryCache = Record<LogMessageByKey, string[]>

export class ModuleManager {
  /** Cache for package.json contents (readJson) */
  readonly json: JsonCache
  /** Cache for resolved real paths (if symlink, realpath; otherwise resolve) */
  readonly realPath: RealPathCache
  /** Cache for file/directory existence checks */
  readonly exists: ExistsCache
  /** Cache for lstat results */
  readonly lstat: LstatCache
  /** Cache for package lookups (key: "packageName||fromDir||semverRange"). Use helper function `versionedCacheKey` */
  readonly packageData: PackageCache
  /** For logging purposes, just track all dependencies for each key */
  readonly logSummary: LogSummaryCache

  private readonly jsonMap: Map<string, PackageJson | null> = new Map()
  private readonly realPathMap: Map<string, string> = new Map()
  private readonly existsMap: Map<string, boolean> = new Map()
  private readonly lstatMap: Map<string, fs.Stats | null> = new Map()
  private readonly packageDataMap: Map<string, Package | null> = new Map()
  private readonly logSummaryMap: Map<LogMessageByKey, string[]> = new Map()

  constructor() {
    this.logSummary = this.createLogSummarySyncProxy()

    this.exists = this.createAsyncProxy(this.existsMap, (p: string) => exists(p))
    this.json = this.createAsyncProxy(this.jsonMap, (p: string) => readJsonOrNull(p))
    this.lstat = this.createAsyncProxy(this.lstatMap, (p: string) => fs.lstat(p).catch(() => null))
    this.packageData = this.createAsyncProxy(this.packageDataMap, (p: string) => this.locatePackageVersionFromCacheKey(p).catch(() => null))
    this.realPath = this.createAsyncProxy(this.realPathMap, async (p: string) => {
      const filePath = path.resolve(p)
      const stat = await this.lstat[filePath]
      return stat?.isSymbolicLink() ? fs.realpath(filePath) : filePath
    })
  }

  private createLogSummarySyncProxy(): LogSummaryCache {
    return new Proxy({} as LogSummaryCache, {
      get: (_, key: LogMessageByKey) => {
        if (!this.logSummaryMap.has(key)) {
          this.logSummaryMap.set(key, [])
        }
        return this.logSummaryMap.get(key)!
      },
      set: (_, key: LogMessageByKey, value: string[]) => {
        this.logSummaryMap.set(key, value)
        return true
      },
      has: (_, key: LogMessageByKey) => {
        return this.logSummaryMap.has(key)
      },
      // Add these to make Object.entries() work
      ownKeys: _ => {
        return Array.from(this.logSummaryMap.keys())
      },
      getOwnPropertyDescriptor: (_, key) => {
        if (this.logSummaryMap.has(key as LogMessageByKey)) {
          return {
            enumerable: true,
            configurable: true,
          }
        }
        return undefined
      },
    })
  }

  // this allows dot-notation access while still supporting async retrieval
  // e.g., cache.packageJson[somePath] returns Promise<PackageJson>
  private createAsyncProxy<T>(map: Map<string, T>, compute: (key: string) => T | Promise<T>): Record<string, Promise<T>> {
    return new Proxy({} as Record<string, Promise<T>>, {
      async get(_, key: string) {
        if (map.has(key)) {
          return Promise.resolve(map.get(key)!)
        }
        return await Promise.resolve(compute(key)).then(value => {
          map.set(key, value)
          return value
        })
      },
      set(_, key: string, value: T) {
        map.set(key, value)
        return true
      },
      has(_, key: string) {
        return map.has(key)
      },
    })
  }

  versionedCacheKey(pkg: { name: string; path: string; semver?: string }): string {
    return [pkg.name, pkg.path, pkg.semver || ""].join("||")
  }

  protected async locatePackageVersionFromCacheKey(key: string): Promise<Package | null> {
    const [name, fromDir, semverRange] = key.split("||")
    const result = await this.locatePackageVersion({ parentDir: fromDir, pkgName: name, requiredRange: semverRange })
    if (result == null) {
      return null
    }
    return { ...result, packageDir: await this.realPath[result.packageDir] }
  }

  public async locatePackageVersion({
    parentDir,
    pkgName,
    requiredRange,
    skipDownwardSearch = false,
    skipOverrideFallback = false,
  }: {
    /**
     * The directory to start searching from. Typed optional because pnpm JSON output can omit
     * the `path` field at runtime even when the TypeScript type says `string`. An undefined
     * parentDir is treated as "package not found" rather than a crash.
     */
    parentDir?: string
    /**
     * The package name to locate. Typed optional for the same reason as parentDir: the pnpm
     * list JSON can omit `name`/`from` fields (e.g. when the root package.json has no name),
     * producing an undefined pkgName at runtime despite the TypeScript type.
     */
    pkgName?: string
    requiredRange?: string
    /**
     * When true, skip the BFS-based `downwardSearch`. Use for layouts that are guaranteed flat
     * (e.g. pnpm's `.pnpm` virtual store), where the downward walk burns thousands of `readdir`
     * / `lstat` calls and finds nothing.
     */
    skipDownwardSearch?: boolean
    /**
     * When true, return null instead of falling back to an out-of-range (override) version.
     * Callers that search several locations use this to find a range-satisfying version in any
     * location before settling for an override version from the first location searched.
     */
    skipOverrideFallback?: boolean
  }): Promise<Package | null> {
    if (!parentDir || !pkgName) {
      return null
    }

    const found = await this.searchForPackage(parentDir, pkgName, requiredRange, skipDownwardSearch)
    if (found) {
      return found
    }

    // Second pass: find any installed version of the package when the declared-range search
    // returns nothing. This handles package manager `overrides` (Bun, npm, pnpm, Yarn) that
    // resolve a transitive dependency to a version intentionally outside its declared range.
    // File-system results are already cached, so this pass costs only JS overhead.
    if (requiredRange && !skipOverrideFallback) {
      const overrideResult = await this.searchForPackage(parentDir, pkgName, undefined, skipDownwardSearch)
      if (overrideResult) {
        log.debug(
          { pkg: pkgName, declared: requiredRange, installed: overrideResult.packageJson.version },
          "accepting installed package version that doesn't satisfy the declared range"
        )
        this.logSummary[LogMessageByKey.PKG_VERSION_OVERRIDDEN].push(`${pkgName}@${overrideResult.packageJson.version} (declared ${requiredRange})`)
        return overrideResult
      }
    }

    return null
  }

  private async searchForPackage(parentDir: string, pkgName: string, requiredRange: string | undefined, skipDownwardSearch: boolean): Promise<Package | null> {
    // 1) check direct parent node_modules/pkgName first
    const direct = path.join(path.resolve(parentDir), "node_modules", pkgName, "package.json")
    if (await this.exists[direct]) {
      const json = await this.json[direct]
      if (json && this.semverSatisfies(json.version, requiredRange)) {
        return { packageDir: path.dirname(direct), packageJson: json }
      }
    }

    // 2) upward hoisted search, then 3) downward non-hoisted search
    const upward = await this.upwardSearch(parentDir, pkgName, requiredRange)
    if (upward) {
      return upward
    }
    if (skipDownwardSearch) {
      return null
    }
    return (await this.downwardSearch(parentDir, pkgName, requiredRange)) || null
  }

  private semverSatisfies(found: string, range?: string): boolean {
    if (isEmptyOrSpaces(range) || range === "*") {
      return true
    }

    if (range === found) {
      return true
    }

    if (semver.validRange(range) == null) {
      // ignore, we can't verify non-semver ranges
      // e.g. git urls, file:, patch:, etc. Example:
      // "@ai-sdk/google": "patch:@ai-sdk/google@npm%3A2.0.43#~/.yarn/patches/@ai-sdk-google-npm-2.0.43-689ed559b3.patch"
      log.debug({ found, range }, "unable to validate semver version range, assuming match")
      return true
    }

    try {
      return semver.satisfies(found, range)
    } catch {
      // fallback: simple equality or basic prefix handling (^, ~)
      if (range.startsWith("^") || range.startsWith("~")) {
        const r = range.slice(1)
        return r === found
      }
      // if range is like "8.x" or "8.*" match major
      const m = range.match(/^(\d+)[.(*|x)]*/)
      const fm = found.match(/^(\d+)\./)
      if (m && fm) {
        return m[1] === fm[1]
      }
      return false
    }
  }

  /**
   * Upward search (hoisted)
   */
  private async upwardSearch(parentDir: string, pkgName: string, requiredRange?: string): Promise<Package | null> {
    let current = path.resolve(parentDir)
    const root = path.parse(current).root
    while (true) {
      const candidate = path.join(current, "node_modules", pkgName, "package.json")
      if (await this.exists[candidate]) {
        const json = await this.json[candidate]
        if (json && this.semverSatisfies(json.version, requiredRange)) {
          return { packageDir: path.dirname(candidate), packageJson: json }
        }
        // otherwise keep searching upward (we may find a different hoisted version)
      }
      if (current === root) {
        break
      }
      const parent = path.dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
    return null
  }

  /**
   * Breadth-first downward search from parentDir/node_modules
   * Looks for node_modules/\*\/node_modules/pkgName (and deeper)
   */
  private async downwardSearch(parentDir: string, pkgName: string, requiredRange?: string, maxExplored = 2000, maxDepth = 6): Promise<Package | null> {
    const start = path.join(path.resolve(parentDir), "node_modules")
    if (!(await this.exists[start]) || !(await this.lstat[start])?.isDirectory()) {
      return null
    }

    const visited = new Set<string>()
    const queue: Array<{ dir: string; depth: number }> = [{ dir: start, depth: 0 }]
    let explored = 0

    while (queue.length > 0) {
      const { dir, depth } = queue.shift()!
      if (explored++ > maxExplored) {
        break
      }
      if (depth > maxDepth) {
        continue
      }
      let entries: string[]
      try {
        entries = await fs.readdir(dir)
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.startsWith(".")) {
          continue
        }
        const entryPath = path.join(dir, entry)
        if (entry.startsWith("@")) {
          const found = await this.processScope(entryPath, pkgName, requiredRange, depth, visited, queue)
          if (found) {
            return found
          }
          continue
        }
        const found = await this.processEntry(entryPath, pkgName, requiredRange, depth, visited, queue)
        if (found) {
          return found
        }
      }
    }

    return null
  }

  /** Handle a non-scoped entry directory inside a node_modules folder. */
  private async processEntry(
    entryPath: string,
    pkgName: string,
    requiredRange: string | undefined,
    depth: number,
    visited: Set<string>,
    queue: Array<{ dir: string; depth: number }>
  ): Promise<Package | null> {
    const stat = await this.lstat[entryPath]
    if (!stat?.isDirectory()) {
      return null
    }

    // Check entry/node_modules/pkgName (nested dep under a package)
    const nested = path.join(entryPath, "node_modules", pkgName, "package.json")
    if (await this.exists[nested]) {
      const json = await this.json[nested]
      if (json && this.semverSatisfies(json.version, requiredRange)) {
        return { packageDir: path.dirname(nested), packageJson: json }
      }
    }

    // Check entry/pkgName directly (some flat layouts place pkgName as a sibling)
    const direct = path.join(entryPath, pkgName, "package.json")
    if (await this.exists[direct]) {
      const json = await this.json[direct]
      if (json && this.semverSatisfies(json.version, requiredRange)) {
        return { packageDir: path.dirname(direct), packageJson: json }
      }
    }

    await this.enqueueIfExists(path.join(entryPath, "node_modules"), depth, visited, queue)
    return null
  }

  /** Handle a scoped-package directory (@scope) inside a node_modules folder. */
  private async processScope(
    scopePath: string,
    pkgName: string,
    requiredRange: string | undefined,
    depth: number,
    visited: Set<string>,
    queue: Array<{ dir: string; depth: number }>
  ): Promise<Package | null> {
    if (!(await this.exists[scopePath]) || !(await this.lstat[scopePath])?.isDirectory()) {
      return null
    }
    let scopeEntries: string[]
    try {
      scopeEntries = await fs.readdir(scopePath)
    } catch {
      return null
    }
    for (const sc of scopeEntries) {
      const scPath = path.join(scopePath, sc)
      const candidatePkgJson = path.join(scPath, "node_modules", pkgName, "package.json")
      if (await this.exists[candidatePkgJson]) {
        const json = await this.json[candidatePkgJson]
        if (json && this.semverSatisfies(json.version, requiredRange)) {
          return { packageDir: path.dirname(candidatePkgJson), packageJson: json }
        }
      }
      await this.enqueueIfExists(path.join(scPath, "node_modules"), depth, visited, queue)
    }
    return null
  }

  /** Enqueue a node_modules directory for BFS only if it exists on disk and hasn't been visited. */
  private async enqueueIfExists(nmPath: string, depth: number, visited: Set<string>, queue: Array<{ dir: string; depth: number }>): Promise<void> {
    if (!visited.has(nmPath) && (await this.exists[nmPath]) && (await this.lstat[nmPath])?.isDirectory()) {
      visited.add(nmPath)
      queue.push({ dir: nmPath, depth: depth + 1 })
    }
  }
}
