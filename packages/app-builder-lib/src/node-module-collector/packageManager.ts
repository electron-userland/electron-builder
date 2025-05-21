import * as path from "path"
import * as fs from "fs"

export enum PM {
  NPM = "npm",
  YARN = "yarn",
  PNPM = "pnpm",
  YARN_BERRY = "yarn-berry",
}

function detectPackageManagerByEnv(): PM {
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

  // return default
  return PM.NPM
}

export function getPackageManagerCommand(pm: PM) {
  let cmd = pm
  if (pm === PM.YARN_BERRY || process.env.FORCE_YARN === "true") {
    cmd = PM.YARN
  }
  return `${cmd}${process.platform === "win32" ? ".cmd" : ""}`
}

export function detectPackageManager(cwd: string) {
  const isYarnLockFileExists = fs.existsSync(path.join(cwd, "yarn.lock"))
  const isPnpmLockFileExists = fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))
  const isNpmLockFileExists = fs.existsSync(path.join(cwd, "package-lock.json"))

  if (isYarnLockFileExists && !isPnpmLockFileExists && !isNpmLockFileExists) {
    // check if yarn is berry
    const pm = detectPackageManagerByEnv()
    if (pm === PM.YARN_BERRY) {
      return PM.YARN_BERRY
    }
    return PM.YARN
  }

  if (isPnpmLockFileExists && !isYarnLockFileExists && !isNpmLockFileExists) {
    return PM.PNPM
  }

  if (isNpmLockFileExists && !isYarnLockFileExists && !isPnpmLockFileExists) {
    return PM.NPM
  }
  // if there are no lock files or multiple lock files, return the package manager from env
  return detectPackageManagerByEnv()
}
