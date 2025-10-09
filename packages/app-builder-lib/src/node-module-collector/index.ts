import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detectPackageManagerByFile, detectPackageManagerByEnv, PM, getPackageManagerCommand, detectYarnBerry } from "./packageManager"
import { NodeModuleInfo } from "./types"
import { TmpDir } from "temp-file"
import * as path from "path"
import * as fs from "fs-extra"
import { execSync } from "child_process"
import { spawn } from "builder-util"

export async function getCollectorByPackageManager(pm: PM, rootDir: string, tempDirManager: TmpDir) {
  switch (pm) {
    case PM.PNPM:
      if (await PnpmNodeModulesCollector.isPnpmProjectHoisted(rootDir)) {
        return new NpmNodeModulesCollector(rootDir, tempDirManager)
      }
      return new PnpmNodeModulesCollector(rootDir, tempDirManager)
    case PM.YARN:
      return new YarnNodeModulesCollector(rootDir, tempDirManager)
    case PM.NPM:
    case PM.BUN:
    default:
      return new NpmNodeModulesCollector(rootDir, tempDirManager)
  }
}

export async function getNodeModules(pm: PM, rootDir: string, tempDirManager: TmpDir): Promise<NodeModuleInfo[]> {
  const collector = await getCollectorByPackageManager(pm, rootDir, tempDirManager)
  return collector.getNodeModules()
}

export function detectPackageManager(searchPaths: string[]): { pm: PM; resolvedDirectory: string | undefined } {
  let pm: PM | null = null

  const resolveIfYarn = (pm: PM) => (pm === PM.YARN ? detectYarnBerry() : pm)

  for (const dir of searchPaths) {
    pm = detectPackageManagerByFile(dir)
    if (pm) {
      return { pm: resolveIfYarn(pm), resolvedDirectory: dir }
    }
  }

  // if no lockfile, then just check for a package.json where the last node_modules dir was found
  for (const dir of searchPaths) {
    const traversal = workspaceRootTraversalSearch(dir)
    if (traversal && traversal.isWorkspace && traversal.lastNodeModulesDir) {
      return { pm: PM.NPM, resolvedDirectory: traversal.lastNodeModulesDir }
    }
  }

  pm = detectPackageManagerByEnv()
  // const cwd = process.env.npm_package_json ? path.dirname(process.env.npm_package_json) : (process.env.INIT_CWD ?? process.cwd())
  // if (pm) {
  //   return { pm: resolveIfYarn(pm), resolvedDirectory: cwd }
  // }

  // Default to npm
  return { pm: resolveIfYarn(pm || PM.NPM), resolvedDirectory: undefined }
}

/**
 * Finds the workspace root for Bun or Yarn v1 projects.
 *
 * - Detects "workspaces" in package.json
 * - Works for both Bun and Yarn v1
 * - Uses node_modules as a soft stop hint for faster traversal
 * - Returns the path to the root package.json directory
 */
export function workspaceRootTraversalSearch(cwd: string) {
  let dir = cwd
  let lastNodeModulesDir: string | undefined

  while (true) {
    const pkgPath = path.join(dir, "package.json")

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
        // Yarn v1 and Bun both declare workspaces in the same way
        if (pkg.workspaces) {
          return { lastNodeModulesDir: dir, isWorkspace: true }
        }
      } catch {
        // ignore malformed package.json files
      }
    }

    const nodeModulesPath = path.join(dir, "node_modules")
    if (fs.existsSync(nodeModulesPath)) {
      lastNodeModulesDir = dir
    } else if (lastNodeModulesDir) {
      // If we've already passed a node_modules folder, stop searching further up
      break
    }

    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }

  return lastNodeModulesDir ? { lastNodeModulesDir, isWorkspace: false } : undefined
}

export { PM, getPackageManagerCommand }
