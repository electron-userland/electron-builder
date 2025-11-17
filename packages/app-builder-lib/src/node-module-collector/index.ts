import { exists, log, spawn } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import * as fs from "fs-extra"
import * as path from "path"
import { TmpDir } from "temp-file"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector"
import { detectYarnBerry as detectIfYarnBerry, detectPackageManagerByEnv, detectPackageManagerByFile, getPackageManagerCommand, PM } from "./packageManager"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector"
import { NodeModuleInfo } from "./types"
import { YarnBerryNodeModulesCollector } from "./yarnBerryNodeModulesCollector"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector"
import { BunNodeModulesCollector } from "./bunNodeModulesCollector"

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
    default:
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

export async function detectPackageManager(searchPaths: string[]): Promise<{ pm: PM; corepackConfig: string | undefined; resolvedDirectory: string | undefined }> {
  let pm: PM | null = null
  const dedupedPaths = Array.from(new Set(searchPaths)) // reduce file operations, dedupe paths since primary use case has projectDir === appDir

  const resolveIfYarn = (pm: PM, version: string, cwd: string) => (pm === PM.YARN ? detectIfYarnBerry(cwd, version) : pm)

  for (const dir of dedupedPaths) {
    const packageJsonPath = path.join(dir, "package.json")
    const packageManager = (await exists(packageJsonPath)) ? (await fs.readJson(packageJsonPath, "utf8"))?.packageManager : undefined
    if (packageManager) {
      const [pm, version] = packageManager.split("@")
      if (Object.values(PM).includes(pm as PM)) {
        const resolvedPackageManager = await resolveIfYarn(pm as PM, version, dir)
        log.debug({ resolvedPackageManager, packageManager, cwd: dir }, "packageManager field detected in package.json")
        return { pm: resolvedPackageManager, corepackConfig: packageManager, resolvedDirectory: dir }
      }
    }

    pm = await detectPackageManagerByFile(dir)
    if (pm) {
      const resolvedPackageManager = await resolveIfYarn(pm, "", dir)
      log.debug({ resolvedPackageManager, cwd: dir }, "packageManager detected by file")
      return { pm: resolvedPackageManager, resolvedDirectory: dir, corepackConfig: undefined }
    }
  }

  pm = detectPackageManagerByEnv() || PM.NPM
  const cwd = process.env.npm_package_json ? path.dirname(process.env.npm_package_json) : (process.env.INIT_CWD ?? process.cwd())
  const resolvedPackageManager = await resolveIfYarn(pm, "", cwd)
  log.debug({ resolvedPackageManager, detected: cwd }, "packageManager not detected by file, falling back to environment detection")
  return { pm: resolvedPackageManager, resolvedDirectory: undefined, corepackConfig: undefined }
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

  log.debug({ root: output || cwd }, output ? "workspace root detected" : "workspace root not detected, using project root")
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
