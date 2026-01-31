import { Nullish } from "builder-util-runtime"
import { TmpDir } from "temp-file"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector.js"
import { detectPackageManager, getPackageManagerCommand, PM } from "./packageManager.js"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector.js"
import { NodeModuleInfo } from "./types.js"
import { YarnBerryNodeModulesCollector } from "./yarnBerryNodeModulesCollector.js"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector.js"
import { BunNodeModulesCollector } from "./bunNodeModulesCollector.js"
import { Lazy } from "lazy-val"
import { spawn, log, exists, isEmptyOrSpaces } from "builder-util"
import * as fs from "fs-extra"
import * as path from "path"
import { TraversalNodeModulesCollector } from "./traversalNodeModulesCollector.js"

export { getPackageManagerCommand, PM }

export function getCollectorByPackageManager(pm: PM, rootDir: string, tempDirManager: TmpDir) {
  switch (pm) {
    case PM.PNPM:
      return new PnpmNodeModulesCollector(rootDir, tempDirManager)
    case PM.YARN:
      return new YarnNodeModulesCollector(rootDir, tempDirManager)
    case PM.YARN_BERRY:
      return new YarnBerryNodeModulesCollector(rootDir, tempDirManager)
    case PM.BUN:
      return new BunNodeModulesCollector(rootDir, tempDirManager)
    case PM.NPM:
      return new NpmNodeModulesCollector(rootDir, tempDirManager)
    case PM.TRAVERSAL:
      return new TraversalNodeModulesCollector(rootDir, tempDirManager)
  }
}

export function getNodeModules(
  pm: PM,
  {
    rootDir,
    tempDirManager,
    packageName,
  }: {
    rootDir: string
    tempDirManager: TmpDir
    packageName: string
  }
): Promise<NodeModuleInfo[]> {
  const collector = getCollectorByPackageManager(pm, rootDir, tempDirManager)
  return collector.getNodeModules({ packageName })
}

export const determinePackageManagerEnv = ({ projectDir, appDir, workspaceRoot }: { projectDir: string; appDir: string; workspaceRoot: string | Nullish }) =>
  new Lazy(async () => {
    const availableDirs = [workspaceRoot, projectDir, appDir].filter((it): it is string => !isEmptyOrSpaces(it))
    const pm = await detectPackageManager(availableDirs)
    const root = await findWorkspaceRoot(pm.pm, projectDir)
    if (root != null) {
      // re-detect package manager from workspace root, this seems particularly necessary for pnpm workspaces
      const actualPm = await detectPackageManager([root])
      log.info(
        { pm: actualPm.pm, config: actualPm.corepackConfig, resolved: actualPm.resolvedDirectory, projectDir },
        `detected workspace root for project using ${actualPm.detectionMethod}`
      )
      return {
        pm: actualPm.pm,
        workspaceRoot: Promise.resolve(actualPm.resolvedDirectory),
      }
    }
    return {
      pm: pm.pm,
      workspaceRoot: Promise.resolve(pm.resolvedDirectory),
    }
  })

async function findWorkspaceRoot(pm: PM, cwd: string): Promise<string | undefined> {
  let command: { command: string; args: string[] }

  switch (pm) {
    case PM.PNPM:
      command = { command: "pnpm", args: ["--workspace-root", "exec", "pwd"] }
      break
    case PM.YARN_BERRY:
      command = { command: "yarn", args: ["workspaces", "list", "--json"] }
      break
    case PM.YARN: {
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

  const output = await spawn(command.command, command.args, { cwd, stdio: ["ignore", "pipe", "ignore"] })
    .then(async it => {
      const out: string | undefined = it?.trim()
      if (!out) {
        return undefined
      }
      if (pm === PM.YARN) {
        JSON.parse(out) // if JSON valid, workspace detected
        return findNearestPackageJsonWithWorkspacesField(cwd)
      } else if (pm === PM.BUN) {
        const json = JSON.parse(out)
        if (Array.isArray(json) && json.length > 0) {
          return findNearestPackageJsonWithWorkspacesField(cwd)
        }
      } else if (pm === PM.YARN_BERRY) {
        const lines = out
          .split("\n")
          .map(l => l.trim())
          .filter(Boolean)
        for (const line of lines) {
          const parsed = JSON.parse(line)
          if (parsed.location != null) {
            const potential = path.resolve(cwd, parsed.location)
            return (await exists(potential)) ? findNearestPackageJsonWithWorkspacesField(potential) : undefined
          }
        }
      }
      return out.length === 0 || out === "undefined" ? undefined : out
    })
    .catch(() => findNearestPackageJsonWithWorkspacesField(cwd))
  return output
}

async function findNearestPackageJsonWithWorkspacesField(dir: string): Promise<string | undefined> {
  let current = dir
  while (true) {
    const pkgPath = path.join(current, "package.json")
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"))
      if (pkg.workspaces) {
        log.debug({ path: current }, "identified workspace root")
        return current
      }
    } catch {
      // ignore
    }
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return undefined
}
