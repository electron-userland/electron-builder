import { exists, log } from "builder-util"
import * as fs from "fs-extra"
import * as path from "path"
import * as which from "which"

export enum PM {
  PNPM = "pnpm",
  YARN = "yarn",
  YARN_BERRY = "yarn-berry",
  BUN = "bun",
  NPM = "npm",
  TRAVERSAL = "traversal",
}

// Cache for resolved paths
const pmPathCache: Record<PM, string | null | undefined> = {
  [PM.NPM]: undefined,
  [PM.YARN]: undefined,
  [PM.PNPM]: undefined,
  [PM.YARN_BERRY]: undefined,
  [PM.BUN]: undefined,
  [PM.TRAVERSAL]: undefined,
}

function resolveCommand(pm: PM): string {
  const fallback = pm === PM.YARN_BERRY ? "yarn" : pm

  if (process.platform !== "win32") {
    return fallback
  }

  try {
    return which.sync(fallback)
  } catch {
    // If `which` fails (not found), still return the fallback string
    return fallback
  }
}

export function getPackageManagerCommand(pm: PM) {
  if (pmPathCache[pm] !== undefined) {
    return pmPathCache[pm]!
  }

  const resolved = resolveCommand(pm)
  pmPathCache[pm] = resolved
  return resolved
}

type PackageManagerSetup = {
  pm: PM
  corepackConfig: string | undefined
  resolvedDirectory: string | undefined
  detectionMethod: string
}

export async function detectPackageManager(searchPaths: string[]): Promise<PackageManagerSetup> {
  let pm: PM | null = null
  const dedupedPaths = Array.from(new Set(searchPaths)) // reduce file operations, dedupe paths since primary use case has projectDir === appDir

  const resolveIfYarn = (pm: PM, version: string, cwd: string) => (pm === PM.YARN ? detectYarnBerry(cwd, version) : pm)

  for (const dir of dedupedPaths) {
    const packageJsonPath = path.join(dir, "package.json")
    const packageManager = (await exists(packageJsonPath)) ? (await fs.readJson(packageJsonPath, "utf8"))?.packageManager : undefined
    if (packageManager) {
      const [pm, version] = packageManager.split("@")
      if (Object.values(PM).includes(pm as PM)) {
        const resolvedPackageManager = await resolveIfYarn(pm as PM, version, dir)
        return { pm: resolvedPackageManager, corepackConfig: packageManager, resolvedDirectory: dir, detectionMethod: "packageManager field" }
      }
    }

    pm = await detectPackageManagerByFile(dir)
    if (pm) {
      const resolvedPackageManager = await resolveIfYarn(pm, "", dir)
      return { pm: resolvedPackageManager, resolvedDirectory: dir, corepackConfig: undefined, detectionMethod: "lock file" }
    }
  }

  pm = detectPackageManagerByEnv() || PM.NPM
  const cwd = process.env.npm_package_json ? path.dirname(process.env.npm_package_json) : (process.env.INIT_CWD ?? process.cwd())
  const resolvedPackageManager = await resolveIfYarn(pm, "", cwd)
  log.info({ resolvedPackageManager, detected: cwd }, "packageManager not detected by file, falling back to environment detection")
  return { pm: resolvedPackageManager, resolvedDirectory: undefined, corepackConfig: undefined, detectionMethod: "process environment" }
}

function detectPackageManagerByEnv(): PM | null {
  const priorityChecklist = [(key: string) => process.env.npm_config_user_agent?.includes(key), (key: string) => process.env.npm_execpath?.includes(key)]

  const pms = Object.values(PM).filter(pm => pm !== PM.YARN_BERRY)
  for (const checker of priorityChecklist) {
    for (const pm of pms) {
      if (checker(pm)) {
        return pm
      }
    }
  }
  return null
}

async function detectPackageManagerByFile(dir: string): Promise<PM | null> {
  const has = (file: string) => exists(path.join(dir, file))

  const detected: PM[] = []
  if (await has("yarn.lock")) {
    detected.push(PM.YARN)
  }
  if (await has("pnpm-lock.yaml")) {
    detected.push(PM.PNPM)
  }
  if (await has("package-lock.json")) {
    detected.push(PM.NPM)
  }
  if ((await has("bun.lock")) || (await has("bun.lockb"))) {
    detected.push(PM.BUN)
  }

  if (detected.length === 1) {
    return detected[0]
  }

  return null
}

async function detectYarnBerry(cwd: string, version: string): Promise<PM.YARN | PM.YARN_BERRY> {
  const checkBerry = () => {
    try {
      if (parseInt(version.split(".")[0]) > 1) {
        return PM.YARN_BERRY
      }
    } catch (_error) {
      log.debug({ error: _error }, "cannot determine yarn version, assuming yarn v1")
      // If `yarn` is not found or another error occurs, fall back to the regular Yarn since we're already determined in a Yarn project
    }
    return undefined
  }

  if (version === "latest" || version === "berry") {
    return PM.YARN_BERRY
  }

  if (version.length > 0) {
    return checkBerry() ?? PM.YARN
  }

  const lockPath = path.join(cwd, "yarn.lock")
  if (!(await exists(lockPath))) {
    return checkBerry() ?? PM.YARN
  }
  // Read the first few lines of yarn.lock to determine the version
  const firstBytes = (await fs.readFile(lockPath, "utf8")).split("\n").slice(0, 10).join("\n")

  // Yarn v2+ (Berry) has a "__metadata:" block near the top
  if (firstBytes.includes("__metadata:")) {
    return PM.YARN_BERRY
  }

  // Yarn v1 format is classic semi-YAML with comment header
  if (firstBytes.includes("DO NOT EDIT THIS FILE DIRECTLY.")) {
    return PM.YARN
  }

  return checkBerry() ?? PM.YARN
}
