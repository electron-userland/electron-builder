import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { detectPackageManagerByFile, detectPackageManagerByEnv, PM, getPackageManagerCommand, detectYarnBerry } from "./packageManager"
import { NodeModuleInfo } from "./types"
import { TmpDir } from "temp-file"
import * as path from "path"
import * as fs from "fs-extra"
import { execSync } from "child_process"
import { isEmptyOrSpaces, spawn } from "builder-util"

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

export function detectPackageManager(searchPaths: string[]): { pm: PM; packageManager: string | undefined; resolvedDirectory: string | undefined } {
  let pm: PM | null = null

  const resolveIfYarn = (pm: PM) => (pm === PM.YARN ? detectYarnBerry() : pm)

  for (const dir of searchPaths) {
    const packageJsonPath = path.join(dir, "package.json")
    const packageManager = fs.existsSync(packageJsonPath) ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))?.packageManager : undefined
    if (packageManager) {
      const [pm] = packageManager.split("@")
      if (Object.values(PM).includes(pm as PM)) {
        return { pm: pm as PM, packageManager, resolvedDirectory: dir }
      }
    }

    pm = detectPackageManagerByFile(dir)
    if (pm) {
      return { pm: resolveIfYarn(pm), resolvedDirectory: dir, packageManager: undefined }
    }
  }

  // if no lockfile, then just check for a package.json where the last node_modules dir was found
  // for (const dir of searchPaths) {
  //   const traversal = workspaceRootTraversalSearch(dir)
  //   if (traversal && traversal.isWorkspace && traversal.lastNodeModulesDir) {
  //     return { pm: PM.NPM, resolvedDirectory: traversal.lastNodeModulesDir }
  //   }
  // }

  pm = detectPackageManagerByEnv()
  // const cwd = process.env.npm_package_json ? path.dirname(process.env.npm_package_json) : (process.env.INIT_CWD ?? process.cwd())
  // if (pm) {
  //   return { pm: resolveIfYarn(pm), resolvedDirectory: cwd }
  // }

  // Default to npm
  return { pm: resolveIfYarn(pm || PM.NPM), resolvedDirectory: undefined, packageManager: undefined }
}


export async function findWorkspaceRoot(pm: PM, cwd: string): Promise<string | undefined> {
  let command: { command: string; args: string[] } | undefined

  switch (pm) {
    case PM.PNPM:
      command = { command: "pnpm", args: ["root", "-w"] }
      break

    case PM.YARN_BERRY:
      command = { command: "yarn", args: ["config", "get", "workspaceRoot"] }
      break

    case PM.YARN: {
      // verify yarn v1.x before using “workspaces info”
      const version = execSync("yarn -v", { encoding: "utf8", cwd }).trim()
      if (!version.startsWith("1.")) {
        // fallback if not Yarn 1
        return await findNearestWithWorkspacesField(cwd)
      }

      command = { command: "yarn", args: ["workspaces", "info", "--silent"] }
      break
    }

    case PM.BUN:
      command = { command: "bun", args: ["pm", "ls", "--json"] }
      break

    case PM.NPM:
    default:
      command = { command: "npm", args: ["prefix", "-w"] }
      break
  }

  let output: string | undefined
  try {
    output = await spawn(command.command, command.args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    }).then(it => it.trim())
  } catch {
    return await findNearestWithWorkspacesField(cwd)
  }

  if (!output) {
    return undefined
  }

  if (pm === PM.YARN) {
    try {
      JSON.parse(output) // if JSON valid, workspace detected
      return await findNearestWithWorkspacesField(cwd)
    } catch {
      return undefined
    }
  }

  if (pm === PM.BUN) {
    try {
      const json = JSON.parse(output)
      if (Array.isArray(json) && json.length > 0) {
        return await findNearestWithWorkspacesField(cwd)
      }
    } catch {
      return undefined
    }
  }

  return output
}

async function findNearestWithWorkspacesField(dir: string): Promise<string | undefined> {
  let current = dir
  while (true) {
    const pkgPath = path.join(current, "package.json")
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"))
      if (pkg.workspaces) return current
    } catch {
      // ignore
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return undefined
}
export { PM, getPackageManagerCommand }
