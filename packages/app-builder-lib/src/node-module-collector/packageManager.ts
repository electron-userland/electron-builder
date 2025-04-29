import * as path from "path"
import * as fs from "fs"

export enum PM {
  NPM = "npm",
  YARN = "yarn",
  PNPM = "pnpm",
  YARN_BERRY = "yarn-berry",
}

export function detectPackageManager(cwd: string): PM {
  if (process.env.npm_config_user_agent) {
    const userAgent = process.env.npm_config_user_agent

    if (userAgent.includes("pnpm")) {
      return PM.PNPM
    }

    if (userAgent.includes("yarn")) {
      if (userAgent.includes("yarn/")) {
        const version = userAgent.match(/yarn\/(\d+)\./)
        if (version && parseInt(version[1]) >= 2) {
          return PM.YARN_BERRY
        }
      }
      return PM.YARN
    }

    if (userAgent.includes("npm")) {
      return PM.NPM
    }
  }

  if (process.env.npm_execpath) {
    const execPath = process.env.npm_execpath.toLowerCase()

    if (execPath.includes("pnpm")) {
      return PM.PNPM
    }

    if (execPath.includes("yarn")) {
      if (execPath.includes("berry") || process.env.YARN_VERSION?.startsWith("2.") || process.env.YARN_VERSION?.startsWith("3.")) {
        return PM.YARN_BERRY
      }
      return PM.YARN
    }

    if (execPath.includes("npm")) {
      return PM.NPM
    }
  }

  if (process.env.PNPM_HOME) {
    return PM.PNPM
  }

  if (process.env.YARN_REGISTRY) {
    if (process.env.YARN_VERSION?.startsWith("2.") || process.env.YARN_VERSION?.startsWith("3.")) {
      return PM.YARN_BERRY
    }
    return PM.YARN
  }

  if (process.env.npm_package_json) {
    return PM.NPM
  }

  return getPackageManagerCommandByLockFile(cwd)
}

function getPackageManagerCommandByLockFile(cwd: string) {
  const yarnLockFile = path.join(cwd, "yarn.lock")
  const pnpmLockFile = path.join(cwd, "pnpm-lock.yaml")

  if (fs.existsSync(yarnLockFile)) {
    return PM.YARN
  }

  if (fs.existsSync(pnpmLockFile)) {
    return PM.PNPM
  }

  return PM.NPM
}
