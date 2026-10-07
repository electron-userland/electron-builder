import { Nullish } from "builder-util-runtime"
import { TmpDir } from "temp-file"
import { NpmNodeModulesCollector } from "./npmNodeModulesCollector.js"
import { detectPackageManager, getPackageManagerCommand, PM } from "./packageManager.js"
import { PnpmNodeModulesCollector } from "./pnpmNodeModulesCollector.js"
import { YarnBerryNodeModulesCollector } from "./yarnBerryNodeModulesCollector.js"
import { YarnNodeModulesCollector } from "./yarnNodeModulesCollector.js"
import { BunNodeModulesCollector } from "./bunNodeModulesCollector.js"
import { Lazy } from "lazy-val"
import { spawn, log, exists, isEmptyOrSpaces } from "builder-util"
import fs from "fs-extra"
import * as path from "path"
import { TraversalNodeModulesCollector } from "./traversalNodeModulesCollector.js"

export { getPackageManagerCommand, PM, PnpmNodeModulesCollector, YarnNodeModulesCollector, YarnBerryNodeModulesCollector, BunNodeModulesCollector, TraversalNodeModulesCollector }

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

export const determinePackageManagerEnv = ({ projectDir, appDir, workspaceRoot }: { projectDir: string; appDir: string; workspaceRoot: string | Nullish }) =>
  new Lazy(async () => {
    const availableDirs = [workspaceRoot, projectDir, appDir].filter((it): it is string => !isEmptyOrSpaces(it))
    const pm = await detectPackageManager(availableDirs)
    const root = await findWorkspaceRoot(pm.pm, projectDir)
    if (root != null) {
      // re-detect package manager from workspace root, this seems particularly necessary for pnpm workspaces
      const actualPm = await detectPackageManager([root])
      if (actualPm.resolvedDirectory == null) {
        // The root was located from the workspace config (e.g. `pnpm-workspace.yaml`) but carries neither a lockfile nor a
        // `packageManager` field, so detection fell through to the process environment and resolved no directory. Dropping the
        // root here silently confines `@electron/rebuild` to the app dir (#10187), so keep the located directory instead.
        log.warn(
          { root: log.filePath(root), pm: pm.pm, projectDir: log.filePath(projectDir) },
          "workspace root located, but no lockfile or `packageManager` field was found there to re-detect the package manager; using it as-is"
        )
        return {
          pm: pm.pm,
          workspaceRoot: Promise.resolve(root),
        }
      }
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

/** @internal exported for tests */
export async function findWorkspaceRoot(pm: PM, cwd: string): Promise<string | undefined> {
  if (pm === PM.PNPM) {
    // pnpm itself locates the workspace root with a plain upward search for `pnpm-workspace.yaml` (@pnpm/find-workspace-dir), so
    // mirror that on disk instead of shelling out to `pnpm --workspace-root exec pwd`. `pwd` is a POSIX command: on Windows it is
    // either missing (so detection fell back to a `package.json#workspaces` walk, which pnpm workspaces do not use) or resolves to
    // the Git-for-Windows binary, whose MSYS-style `/d/a/repo` output is not a usable path. Either way the root was lost and
    // `@electron/rebuild` never reached native modules stored under the root `node_modules/.pnpm` (#10187).
    const root = await findNearestDir(cwd, dir => exists(path.join(dir, "pnpm-workspace.yaml")))
    if (root != null) {
      log.debug({ path: root }, "identified pnpm workspace root")
      return root
    }
    return findNearestPackageJsonWithWorkspacesField(cwd)
  }

  let command: { command: string; args: string[] }

  switch (pm) {
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
    .catch((error: any) => {
      log.debug({ command: `${command.command} ${command.args.join(" ")}`, error: error?.message ?? error }, "workspace root command failed, falling back to package.json walk")
      return findNearestPackageJsonWithWorkspacesField(cwd)
    })
  return output
}

async function findNearestPackageJsonWithWorkspacesField(dir: string): Promise<string | undefined> {
  const root = await findNearestDir(dir, async current => {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(current, "package.json"), "utf8"))
      return !!pkg.workspaces
    } catch {
      return false
    }
  })
  if (root != null) {
    log.debug({ path: root }, "identified workspace root")
  }
  return root
}

/** Walks from `dir` up to the filesystem root and returns the first directory for which `isRoot` holds. */
async function findNearestDir(dir: string, isRoot: (dir: string) => Promise<boolean>): Promise<string | undefined> {
  let current = dir
  while (true) {
    if (await isRoot(current)) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}
