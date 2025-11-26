import { CancellationToken, Nullish } from "builder-util-runtime"
import { TmpDir } from "temp-file"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { detectPackageManager, getPackageManagerCommand, PM } from "./packageManager"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { NodeModuleInfo } from "./types"
import { YarnBerryNodeModulesCollector } from "./yarnBerryNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { BunNodeModulesCollector } from "./bunNodeModulesCollector"
import { Lazy } from "lazy-val"
import { spawn, log, ELECTRON_BUILDER_SIGNALS } from "builder-util"
import * as fs from "fs-extra"
import * as path from "path"

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
  }
}

export function getNodeModules(
  pm: PM,
  {
    rootDir,
    tempDirManager,
    cancellationToken,
    packageName,
  }: {
    rootDir: string
    tempDirManager: TmpDir
    cancellationToken: CancellationToken
    packageName: string
  }
): Promise<NodeModuleInfo[]> {
  const collector = getCollectorByPackageManager(pm, rootDir, tempDirManager)
  return collector.getNodeModules({ cancellationToken, packageName })
}

export const determinePackageManagerEnv = ({ projectDir, appDir, workspaceRoot }: { projectDir: string; appDir: string; workspaceRoot: string | Nullish }) =>
  new Lazy(async () => {
    const availableDirs = [projectDir, appDir, workspaceRoot].filter((it): it is string => it != null)
    const pm = await detectPackageManager(availableDirs)
    const root = await findWorkspaceRoot(pm.pm, projectDir)
    if (root != null) {
      // re-detect package manager from workspace root, this seems particularly necessary for pnpm workspaces
      const actualPm = await detectPackageManager([root])
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
  let command: { command: string; args: string[] } | undefined

  switch (pm) {
    case PM.PNPM:
      command = { command: "pnpm", args: ["--workspace-root", "exec", "pwd"] }
      break

    case PM.YARN_BERRY:
      command = { command: "yarn", args: ["config", "get", "workspaceRoot"] }
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
    .then(it => {
      const out = it?.trim()
      if (pm === PM.YARN) {
        JSON.parse(out) // if JSON valid, workspace detected
        return findNearestWithWorkspacesField(cwd)
      } else if (pm === PM.BUN) {
        const json = JSON.parse(out)
        if (Array.isArray(json) && json.length > 0) {
          return findNearestWithWorkspacesField(cwd)
        }
      }
      return !out?.length || out === "undefined" ? undefined : out
    })
    .catch(() => findNearestWithWorkspacesField(cwd))

  log.debug(ELECTRON_BUILDER_SIGNALS.ALL, { root: output || cwd }, output ? "workspace root detected" : "workspace root not detected, using project root")
  return output
}

async function findNearestWithWorkspacesField(dir: string): Promise<string | undefined> {
  let current = dir
  while (true) {
    const pkgPath = path.join(current, "package.json")
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"))
      if (pkg.workspaces) {
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
