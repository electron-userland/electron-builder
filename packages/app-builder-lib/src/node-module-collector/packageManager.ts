import * as path from "path"
import * as fs from "fs"
import * as which from "which"

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

export function detectPackageManagerByEnv(pm: "npm" | "yarn" | "pnpm"): PM | null {
  const ua = process.env.npm_config_user_agent ?? ""
  const execPath = process.env.npm_execpath?.toLowerCase() ?? ""

  const yarnVersion = process.env.YARN_VERSION
  const isBerry = yarnVersion?.startsWith("2.") || yarnVersion?.startsWith("3.")

  switch (pm) {
    case "pnpm":
      return ua.includes("pnpm") || execPath.includes("pnpm") || process.env.PNPM_HOME ? PM.PNPM : null
    case "yarn":
      if (ua.includes("yarn") || execPath.includes("yarn") || process.env.YARN_REGISTRY) {
        return isBerry || ua.includes("yarn/2") || ua.includes("yarn/3") ? PM.YARN_BERRY : PM.YARN
      }
      return null
    case "npm":
      return ua.includes("npm") || execPath.includes("npm") || process.env.npm_package_json ? PM.NPM : null
    default:
      return null
  }
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
    if (detected[0] === PM.YARN) {
      return detectPackageManagerByEnv("yarn") === PM.YARN_BERRY ? PM.YARN_BERRY : PM.YARN
    }
    return detected[0]
  }

  return null
}
