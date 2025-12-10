import { exists, log } from "builder-util"
import { PackageJson } from "./types.js"
import * as fs from "fs-extra"
import { resolve } from "path"

// Type aliases for clarity
type PackageJsonCache = Record<string, Promise<PackageJson>>
type RealPathCache = Record<string, Promise<string>>
type ExistsCache = Record<string, Promise<boolean>>
type LstatCache = Record<string, Promise<fs.Stats>>
type RequireResolveCache = Record<string, Promise<string | null>>

export class ModuleCache {
  /** Cache for package.json contents (readJson/require) */
  readonly packageJson: PackageJsonCache
  /** Cache for resolved real paths (realpath) */
  readonly realPath: RealPathCache
  /** Cache for file/directory existence checks */
  readonly exists: ExistsCache
  /** Cache for lstat results */
  readonly lstat: LstatCache
  /** Cache for require.resolve results (key: "packageName::fromDir") */
  readonly requireResolve: RequireResolveCache

  private readonly packageJsonMap: Map<string, PackageJson> = new Map()
  private readonly realPathMap: Map<string, string> = new Map()
  private readonly existsMap: Map<string, boolean> = new Map()
  private readonly lstatMap: Map<string, fs.Stats> = new Map()
  private readonly requireResolveMap: Map<string, string | null> = new Map()

  constructor() {
    this.packageJson = this.createAsyncProxy(this.packageJsonMap, (path: string) => fs.readJson(path))
    this.exists = this.createAsyncProxy(this.existsMap, (path: string) => exists(path))
    this.lstat = this.createAsyncProxy(this.lstatMap, (path: string) => fs.lstat(path))
    this.requireResolve = this.createAsyncProxy(this.requireResolveMap, (path: string) => require.resolve(path))
    this.realPath = this.createAsyncProxy(this.realPathMap, async (path: string) => {
      const p = resolve(path)
      try {
        const stats = await this.lstat[p]
        if (stats.isSymbolicLink()) {
          return await fs.realpath(p)
        }
        return p
      } catch (error: any) {
        log.debug({ filePath: p, message: error.message || error.stack }, "error resolving path")
      }
      return p
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
}
