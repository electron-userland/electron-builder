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
  if (process.env.npm_config_user_agent) {
    const userAgent = process.env.npm_config_user_agent
    if (userAgent.includes("pnpm")) return PM.PNPM
    if (userAgent.includes("yarn")) return PM.YARN
    if (userAgent.includes("npm")) return PM.NPM
  }

  if (process.env.npm_execpath) {
    const execPath = process.env.npm_execpath
    if (execPath.includes("pnpm")) return PM.PNPM
    if (execPath.includes("yarn")) return PM.YARN
    if (execPath.includes("npm")) return PM.NPM
  }

  const packageJsonPath = path.join(process.cwd(), "package.json")
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))

    if (packageJson.packageManager) {
      if (packageJson.packageManager.startsWith("pnpm@")) return PM.PNPM
      if (packageJson.packageManager.startsWith("yarn@")) return PM.YARN
      if (packageJson.packageManager.startsWith("npm@")) return PM.NPM
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
