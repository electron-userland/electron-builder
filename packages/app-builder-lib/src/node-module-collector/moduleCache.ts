import { exists, log } from "builder-util"
import { PackageJson } from "./types"
import * as fs from "fs-extra"

// Type aliases for clarity
type PackageJsonCache = Record<string, Promise<PackageJson>>
type RealPathCache = Record<string, Promise<string>>
type ExistsCache = Record<string, Promise<boolean>>
type LstatCache = Record<string, Promise<fs.Stats>>
type RequireResolveCache = Record<string, Promise<{ entry: string; packageDir: string } | null>>

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
  private readonly requireResolveMap: Map<string, { entry: string; packageDir: string } | null> = new Map()

  constructor() {
    this.packageJson = this.createAsyncProxy(this.packageJsonMap, (key: string) => this.transformKey("packageJson", key))
    this.realPath = this.createAsyncProxy(this.realPathMap, (key: string) => this.transformKey("realPath", key))
    this.exists = this.createAsyncProxy(this.existsMap, (key: string) => this.transformKey("exists", key))
    this.lstat = this.createAsyncProxy(this.lstatMap, (key: string) => this.transformKey("lstat", key))
    this.requireResolve = this.createAsyncProxy(this.requireResolveMap, (key: string) => this.transformKey("requireResolve", key))
  }

  // this allows dot-notation access while still supporting async retrieval
  // e.g., cache.packageJson[somePath] returns Promise<PackageJson>
  private createAsyncProxy<T>(map: Map<string, T>, compute: (key: string) => Promise<T>): Record<string, Promise<T>> {
    return new Proxy({} as Record<string, Promise<T>>, {
      async get(_, key: string) {
        if (map.has(key)) {
          return Promise.resolve(map.get(key)!)
        }
        return await compute(key).then(value => {
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

  async transformKey(key: string, path: string): Promise<any> {
    switch (key) {
      case "exists":
        return await exists(path)
      case "packageJson":
        return await fs.readJson(path)
      case "realPath":
        try {
          const stats = await this.lstat[path]
          if (stats.isSymbolicLink()) {
            const resolved = this.realPath[path]
            this.realPath[path] = resolved
            return resolved
          } else {
            this.realPath[path] = Promise.resolve(path)
            return path
          }
        } catch (error: any) {
          log.debug({ filePath: path, message: error.message || error.stack }, "error resolving path")
          this.realPath[path] = Promise.resolve(path)
          return path
        }
      case "lstat":
        return await fs.lstat(path)
      case "requireResolve":
        return require.resolve(path)
    }
  }
}
