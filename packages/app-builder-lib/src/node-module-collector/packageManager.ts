import * as path from "path"
import * as fs from "fs"
import * as which from "which"
import { execSync } from "child_process"

export enum PM {
  NPM = "npm",
  YARN = "yarn",
  PNPM = "pnpm",
  YARN_BERRY = "yarn-berry",
}

// Cache for resolved paths
const pmPathCache: Record<PM, string | null | undefined> = {
  [PM.NPM]: undefined,
  [PM.YARN]: undefined,
  [PM.PNPM]: undefined,
  [PM.YARN_BERRY]: undefined,
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

export function detectPackageManagerByEnv(): PM | null {
  const pms = [PM.YARN, PM.NPM, PM.PNPM]

  const packageJsonPath = path.join(process.cwd(), "package.json")
  const packageManager = fs.existsSync(packageJsonPath) ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))?.packageManager : undefined

  const priorityChecklist = [
    (key: string) => process.env.npm_config_user_agent?.includes(key),
    (key: string) => process.env.npm_execpath?.includes(key),
    (key: string) => packageManager?.startsWith(`${key}@`),
  ]

  for (const checker of priorityChecklist) {
    for (const pm of pms) {
      if (checker(pm)) {
        return pm
      }
    }
  }
  return null
}

export function detectPackageManagerByLockfile(cwd: string): PM | null {
  const has = (file: string) => fs.existsSync(path.join(cwd, file))

  const yarn = has("yarn.lock")
  const pnpm = has("pnpm-lock.yaml")
  const npm = has("package-lock.json")

  const detected: PM[] = []
  if (yarn) detected.push(PM.YARN)
  if (pnpm) detected.push(PM.PNPM)
  if (npm) detected.push(PM.NPM)

  if (detected.length === 1) {
    return detected[0]
  }

  return null
}

export function detectYarnBerry() {
  // yarn --version
  const version = execSync("yarn --version").toString().trim()
  if (parseInt(version.split(".")[0]) > 1) return PM.YARN_BERRY
  return PM.YARN
}
