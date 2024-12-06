// copy from https://github.com/egoist/detect-package-manager/blob/main/src/index.ts
// and merge https://github.com/egoist/detect-package-manager/pull/9 to support Monorepo
import { resolve, dirname } from "path"
import { exec, exists } from "builder-util"

export type PM = "npm" | "yarn" | "pnpm" | "bun"

const cache = new Map()
const globalInstallationCache = new Map<string, boolean>()
const lockfileCache = new Map<string, PM>()

/**
 * Check if a global pm is available
 */
function hasGlobalInstallation(pm: PM): Promise<boolean> {
  const key = `has_global_${pm}`
  if (globalInstallationCache.has(key)) {
    return Promise.resolve(globalInstallationCache.get(key)!)
  }

  return exec(pm, ["--version"])
    .then(res => {
      return /^\d+.\d+.\d+$/.test(res)
    })
    .then(value => {
      globalInstallationCache.set(key, value)
      return value
    })
    .catch(() => false)
}

function getTypeofLockFile(cwd = process.cwd()): Promise<PM> {
  const key = `lockfile_${cwd}`
  if (lockfileCache.has(key)) {
    return Promise.resolve(lockfileCache.get(key)!)
  }

  return Promise.all([
    exists(resolve(cwd, "yarn.lock")),
    exists(resolve(cwd, "package-lock.json")),
    exists(resolve(cwd, "pnpm-lock.yaml")),
    exists(resolve(cwd, "bun.lockb")),
  ]).then(([isYarn, _, isPnpm, isBun]) => {
    let value: PM

    if (isYarn) {
      value = "yarn"
    } else if (isPnpm) {
      value = "pnpm"
    } else if (isBun) {
      value = "bun"
    } else {
      value = "npm"
    }

    cache.set(key, value)
    return value
  })
}

export const detect = async ({ cwd, includeGlobalBun }: { cwd?: string; includeGlobalBun?: boolean } = {}) => {
  let type = await getTypeofLockFile(cwd)
  if (type) {
    return type
  }

  let tmpCwd = cwd || "."
  for (let i = 1; i <= 5; i++) {
    tmpCwd = dirname(tmpCwd)
    type = await getTypeofLockFile(tmpCwd)
    if (type) {
      return type
    }
  }

  if (await hasGlobalInstallation("yarn")) {
    return "yarn"
  }
  if (await hasGlobalInstallation("pnpm")) {
    return "yarn"
  }

  if (includeGlobalBun && (await hasGlobalInstallation("bun"))) {
    return "bun"
  }
  return "npm"
}

export function getPackageManagerVersion(pm: PM) {
  return exec(pm, ["--version"]).then(res => res.trim())
}

export function clearCache() {
  return cache.clear()
}
