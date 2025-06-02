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
    return path.basename(which.sync(fallback))
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

export function detectPackageManagerByEnv(): PM {
  const ua = process.env.npm_config_user_agent ?? ""
  const execPath = process.env.npm_execpath?.toLowerCase() ?? ""

  const yarnVersion = process.env.YARN_VERSION
  const isBerry = yarnVersion?.startsWith("2.") || yarnVersion?.startsWith("3.")

  if (ua.includes("pnpm") || execPath.includes("pnpm") || process.env.PNPM_HOME) {
    return PM.PNPM
  }

  if (ua.includes("yarn") || execPath.includes("yarn") || process.env.YARN_REGISTRY) {
    return isBerry || ua.includes("yarn/2") || ua.includes("yarn/3") ? PM.YARN_BERRY : PM.YARN
  }

  if (ua.includes("npm") || execPath.includes("npm") || process.env.npm_package_json) {
    return PM.NPM
  }

  return PM.NPM
}

export function detectPackageManager(cwd: string): PM {
  const has = (file: string) => fs.existsSync(path.join(cwd, file))

  const yarn = has("yarn.lock")
  const pnpm = has("pnpm-lock.yaml")
  const npm = has("package-lock.json")

  const detected: PM[] = []
  if (yarn) detected.push(PM.YARN)
  if (pnpm) detected.push(PM.PNPM)
  if (npm) detected.push(PM.NPM)

  if (detected.length === 1) {
    return detected[0] === PM.YARN ? detectPackageManagerByEnv() : detected[0]
  }

  // fallback: multiple lockfiles or none
  return detectPackageManagerByEnv()
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function hasExtension(file: string): boolean {
  return !!path.extname(file)
}

function getPathExts(): string[] {
  return process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";") : [""]
}

function whichSync(command: string): string {
  const isWindows = process.platform === "win32"
  const pathEnv = process.env.PATH || ""
  const pathExts = getPathExts()
  const pathDirs = pathEnv.split(path.delimiter)

  // If the command contains a path separator, it's a direct path
  if (command.includes(path.sep)) {
    const withExts = isWindows && !hasExtension(command) ? pathExts.map(ext => command + ext) : [command]

    for (const candidate of withExts) {
      if (fs.existsSync(candidate) && isExecutable(candidate)) {
        return path.resolve(candidate)
      }
    }

    throw new Error(`not found: ${command}`)
  }

  // Otherwise search in PATH directories
  for (const dir of pathDirs) {
    if (!dir) continue

    const withExts = isWindows && !hasExtension(command) ? pathExts.map(ext => path.join(dir, command + ext)) : [path.join(dir, command)]

    for (const candidate of withExts) {
      if (fs.existsSync(candidate) && isExecutable(candidate)) {
        return path.resolve(candidate)
      }
    }
  }

  throw new Error(`not found: ${command}`)
}
