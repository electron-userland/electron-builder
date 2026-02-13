import { exists, isEmptyOrSpaces, log, LogLevel } from "builder-util"
import { PackageJson } from "./types"
import * as fs from "fs-extra"
import * as path from "path"
import * as semver from "semver"

export enum LogMessageByKey {
  PKG_DUPLICATE_REF = "duplicate dependency references",
  PKG_NOT_FOUND = "cannot find path for dependency",
  PKG_NOT_ON_DISK = "dependency not found on disk",
  PKG_SELF_REF = "self-referential dependencies",
  PKG_OPTIONAL_NOT_INSTALLED = "missing optional dependencies",
  PKG_COLLECTOR_OUTPUT = "collector stderr output",
}
export const logMessageLevelByKey: Record<LogMessageByKey, LogLevel> = {
  [LogMessageByKey.PKG_DUPLICATE_REF]: "info",
  [LogMessageByKey.PKG_NOT_FOUND]: "warn",
  [LogMessageByKey.PKG_NOT_ON_DISK]: "warn",
  [LogMessageByKey.PKG_SELF_REF]: "debug",
  [LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED]: "info",
  [LogMessageByKey.PKG_COLLECTOR_OUTPUT]: "warn",
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
    this.json = this.createAsyncProxy(this.jsonMap, (p: string) => fs.readJson(p).catch(() => null))
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

  public async locatePackageVersion({ parentDir, pkgName, requiredRange }: { parentDir: string; pkgName: string; requiredRange?: string }): Promise<Package | null> {
    // 1) check direct parent node_modules/pkgName first
    const direct = path.join(path.resolve(parentDir), "node_modules", pkgName, "package.json")
    if (await this.exists[direct]) {
      const json = await this.json[direct]
      if (json && this.semverSatisfies(json.version, requiredRange)) {
        return { packageDir: path.dirname(direct), packageJson: json }
      }
    }

    // 2) upward hoisted search, then 3) downward non-hoisted search
    return (await this.upwardSearch(parentDir, pkgName, requiredRange)) || (await this.downwardSearch(parentDir, pkgName, requiredRange)) || null
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
        // handle scoped packages @scope/name
        if (entry.startsWith("@")) {
          // queue the scope directory itself to explore its children
          if ((await this.exists[entryPath]) && (await this.lstat[entryPath])?.isDirectory()) {
            const scopeEntries = await fs.readdir(entryPath)
            for (const sc of scopeEntries) {
              const scPath = path.join(entryPath, sc)
              // check scPath/node_modules/pkgName
              const candidatePkgJson = path.join(scPath, "node_modules", pkgName, "package.json")
              if (await this.exists[candidatePkgJson]) {
                const json = await this.json[candidatePkgJson]
                if (json && this.semverSatisfies(json.version, requiredRange)) {
                  return { packageDir: path.dirname(candidatePkgJson), packageJson: json }
                }
              }
              // enqueue scPath/node_modules to explore further
              const scNodeModules = path.join(scPath, "node_modules")
              if ((await this.exists[scNodeModules]) && (await this.lstat[scNodeModules])?.isDirectory()) {
                if (!visited.has(scNodeModules)) {
                  visited.add(scNodeModules)
                  queue.push({ dir: scNodeModules, depth: depth + 1 })
                }
              }
            }
          }
          continue
        }

        // check for direct candidate: entry/node_modules/pkgName
        try {
          const stat = await this.lstat[entryPath]
          if (!stat?.isDirectory()) {
            continue
          }
        } catch {
          continue
        }

        const candidatePkgJson = path.join(entryPath, "node_modules", pkgName, "package.json")
        if (await this.exists[candidatePkgJson]) {
          const json = await this.json[candidatePkgJson]
          if (json && this.semverSatisfies(json.version, requiredRange)) {
            return { packageDir: path.dirname(candidatePkgJson), packageJson: json }
          }
        }

        // also check entry/node_modules directly for pkgName (some layouts)
        const candidateDirect = path.join(entryPath, pkgName, "package.json")
        if (await this.exists[candidateDirect]) {
          const json = await this.json[candidateDirect]
          if (json && this.semverSatisfies(json.version, requiredRange)) {
            return { packageDir: path.dirname(candidateDirect), packageJson: json }
          }
        }

        // enqueue entry/node_modules for deeper traversal
        const nextNodeModules = path.join(entryPath, "node_modules")
        if ((await this.exists[nextNodeModules]) && (await this.lstat[nextNodeModules])?.isDirectory()) {
          if (!visited.has(nextNodeModules)) {
            visited.add(nextNodeModules)
            queue.push({ dir: nextNodeModules, depth: depth + 1 })
          }
        }
      }
    }

    return null
  }
}
