import { log } from "builder-util"
import * as path from "path"
import * as fs from "fs"

export interface ResolveFromProjectOptions {
  /** The project directory to resolve from */
  projectDir: string
  /** Module specifier (e.g., "electron-webpack/out/electron-builder.js") */
  moduleSpecifier: string
  /** If true, returns null instead of throwing when module not found */
  optional?: boolean
}

/**
 * Resolves a module from the user's project directory context.
 * This is necessary for pnpm compatibility where modules can only
 * require their direct dependencies.
 *
 * @param options Resolution options
 * @returns The resolved module path, or null if optional and not found
 * @throws Error if module not found and not optional
 */
export function resolveFromProject(options: ResolveFromProjectOptions): string | null {
  const { projectDir, moduleSpecifier, optional = false } = options

  // Build the paths array for resolution
  // Start from project's node_modules and walk up
  const searchPaths: string[] = []
  let currentDir = projectDir
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    const nodeModulesPath = path.join(currentDir, "node_modules")
    if (fs.existsSync(nodeModulesPath)) {
      searchPaths.push(currentDir)
    }
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  // If no paths found, at least try the project directory
  if (searchPaths.length === 0) {
    searchPaths.push(projectDir)
  }

  try {
    const resolved = require.resolve(moduleSpecifier, { paths: searchPaths })
    log.debug({ moduleSpecifier, resolved }, "resolved module from project context")
    return resolved
  } catch (error: any) {
    if (optional) {
      log.debug({ moduleSpecifier, projectDir, error: error.message }, "optional module not found in project")
      return null
    }
    throw new Error(
      `Cannot resolve module "${moduleSpecifier}" from project directory "${projectDir}". ` +
        `This module must be installed in your project. ` +
        `If you're using pnpm, ensure the module is listed in your dependencies. ` +
        `Original error: ${error.message}`
    )
  }
}

/**
 * Checks if a module exists in the user's project context.
 *
 * @param projectDir The project directory
 * @param moduleSpecifier The module to check for
 * @returns true if the module can be resolved
 */
export function moduleExistsInProject(projectDir: string, moduleSpecifier: string): boolean {
  return (
    resolveFromProject({
      projectDir,
      moduleSpecifier,
      optional: true,
    }) !== null
  )
}
