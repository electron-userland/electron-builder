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
    case PM.YARN_BERRY:
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

export function detectPackageManager(searchPaths: string[]): { pm: PM; corepackConfig: string | undefined; resolvedDirectory: string | undefined } {
  let pm: PM | null = null

  const resolveIfYarn = (pm: PM, cwd: string) => (pm === PM.YARN ? detectYarnBerry(cwd) : pm)

  for (const dir of searchPaths) {
    const packageJsonPath = path.join(dir, "package.json")
    const packageManager = fs.existsSync(packageJsonPath) ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))?.packageManager : undefined
    if (packageManager) {
      const [pm] = packageManager.split("@")
      if (Object.values(PM).includes(pm as PM)) {
        return { pm: resolveIfYarn(pm as PM, dir), corepackConfig: packageManager, resolvedDirectory: dir }
      }
    }

    pm = detectPackageManagerByFile(dir)
    if (pm) {
      return { pm: resolveIfYarn(pm, dir), resolvedDirectory: dir, corepackConfig: undefined }
    }
  }

  pm = detectPackageManagerByEnv()
  const cwd = process.env.npm_package_json ? path.dirname(process.env.npm_package_json) : (process.env.INIT_CWD ?? process.cwd())
  return { pm: resolveIfYarn(pm || PM.NPM, cwd), resolvedDirectory: undefined, corepackConfig: undefined }
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
      const version = execSync("yarn --version", { encoding: "utf8", cwd }).trim()
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

  const output = await spawn(command.command, command.args, {
    cwd,
    stdio: ["ignore", "pipe", "ignore"],
  })
    .catch(() => findNearestWithWorkspacesField(cwd))
    .then(it => it?.trim())

  if (!output) {
    return undefined
  }

  try {
    const json = JSON.parse(output)
    if (pm === PM.YARN) {
      // if JSON valid, workspace detected
      return await findNearestWithWorkspacesField(cwd)
    } else if (pm === PM.BUN) {
      if (Array.isArray(json) && json.length > 0) {
        return await findNearestWithWorkspacesField(cwd)
      }
    }
  } catch {
    return undefined
  }

  // if (pm === PM.YARN) {
  //   try {
  //     JSON.parse(output) // if JSON valid, workspace detected
  //     return await findNearestWithWorkspacesField(cwd)
  //   } catch {
  //     return undefined
  //   }
  // }

  // if (pm === PM.BUN) {
  //   try {
  //     const json = JSON.parse(output)
  //     if (Array.isArray(json) && json.length > 0) {
  //       return await findNearestWithWorkspacesField(cwd)
  //     }
  //   } catch {
  //     return undefined
  //   }
  // }

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
