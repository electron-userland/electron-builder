import * as fs from "fs"
import { PackageJson } from "./types"

/**
 * Unified cache for all file system and module resolution operations
 */
export type ModuleCache = {
  /** Cache for package.json contents (readJson/require) */
  packageJson: Map<string, PackageJson>
  /** Cache for resolved real paths (realpath) */
  realPath: Map<string, string>
  /** Cache for file/directory existence checks */
  exists: Map<string, boolean>
  /** Cache for lstat results */
  lstat: Map<string, fs.Stats>
  /** Cache for require.resolve results (key: "packageName::fromDir") */
  requireResolve: Map<string, string | null>
}

/**
 * Creates a new empty ModuleCache instance
 */
export function createModuleCache(): ModuleCache {
  return {
    packageJson: new Map(),
    realPath: new Map(),
    exists: new Map(),
    lstat: new Map(),
    requireResolve: new Map(),
  }
}
