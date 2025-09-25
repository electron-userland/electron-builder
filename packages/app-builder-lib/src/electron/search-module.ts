import * as fs from "fs-extra"
import path from "node:path"

async function shouldContinueSearch(traversedPath: string, rootPath?: string, stopAtPackageJSON?: boolean): Promise<boolean> {
  if (rootPath) {
    return Promise.resolve(traversedPath !== path.dirname(rootPath))
  } else if (stopAtPackageJSON) {
    return fs.existsSync(path.join(traversedPath, "package.json"))
  } else {
    return true
  }
}

type PathGeneratorFunction = (traversedPath: string) => string

async function traverseAncestorDirectories(
  cwd: string,
  pathGenerator: PathGeneratorFunction,
  rootPath?: string,
  maxItems?: number,
  stopAtPackageJSON?: boolean
): Promise<string[]> {
  const paths: string[] = []
  let traversedPath = path.resolve(cwd)

  while (await shouldContinueSearch(traversedPath, rootPath, stopAtPackageJSON)) {
    const generatedPath = pathGenerator(traversedPath)
    if (fs.existsSync(generatedPath)) {
      paths.push(generatedPath)
    }

    const parentPath = path.dirname(traversedPath)
    if (parentPath === traversedPath || (maxItems && paths.length >= maxItems)) {
      break
    }
    traversedPath = parentPath
  }

  return paths
}

/**
 * Find all instances of a given module in node_modules subdirectories while traversing up
 * ancestor directories.
 *
 * @param cwd the initial directory to traverse
 * @param moduleName the Node module name (should work for scoped modules as well)
 * @param rootPath the project's root path. If provided, the traversal will stop at this path.
 */
export async function searchForModule(cwd: string, moduleName: string, rootPath?: string): Promise<string[]> {
  const pathGenerator: PathGeneratorFunction = traversedPath => path.join(traversedPath, "node_modules", moduleName)
  return traverseAncestorDirectories(cwd, pathGenerator, rootPath, undefined, true)
}

/**
 * Find all instances of node_modules subdirectories while traversing up ancestor directories.
 *
 * @param cwd the initial directory to traverse
 * @param rootPath the project's root path. If provided, the traversal will stop at this path.
 */
export async function searchForNodeModules(cwd: string, rootPath?: string): Promise<string[]> {
  const pathGenerator: PathGeneratorFunction = traversedPath => path.join(traversedPath, "node_modules")
  return traverseAncestorDirectories(cwd, pathGenerator, rootPath, undefined, true)
}

/**
 * Determine the root directory of a given project, by looking for a directory with an
 * NPM or yarn lockfile or pnpm lockfile.
 *
 * @param cwd the initial directory to traverse
 */
export async function getProjectRootPath(cwd: string): Promise<string> {
  for (const lockFilename of ["yarn.lock", "package-lock.json", "pnpm-lock.yaml"]) {
    const pathGenerator: PathGeneratorFunction = traversedPath => path.join(traversedPath, lockFilename)
    const lockPaths = await traverseAncestorDirectories(cwd, pathGenerator, undefined, 1)
    if (lockPaths.length > 0) {
      return path.dirname(lockPaths[0])
    }
  }

  return cwd
}
