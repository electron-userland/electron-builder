import { PlatformPackager, Target } from "../platformPackager"

export const commonTargets = ["dir", "zip", "7z", "tar.xz", "tar.lz", "tar.gz", "tar.bz2"]
export const DEFAULT_TARGET = "default"
export const DIR_TARGET = "dir"

export function createTargets(nameToTarget: Map<String, Target>, rawList: Array<string> | n, outDir: string, packager: PlatformPackager<any>, cleanupTasks: Array<() => Promise<any>>): Array<Target> {
  const result: Array<Target> = []

  const mapper = (name: string, factory: (outDir: string) => Target) => {
    let target = nameToTarget.get(name)
    if (target == null) {
      target = factory(outDir)
      nameToTarget.set(name, target)
    }
    result.push(target)
  }

  const targets = normalizeTargets(rawList == null || rawList.length === 0 ? packager.platformSpecificBuildOptions.target : rawList)
  packager.createTargets(targets == null ? [DEFAULT_TARGET] : targets, mapper, cleanupTasks)
  return result
}

function normalizeTargets(targets: Array<string> | string | null | undefined): Array<string> | null {
  if (targets == null) {
    return null
  }
  else {
    return (Array.isArray(targets) ? targets : [targets]).map(it => it.toLowerCase().trim())
  }
}

export function createCommonTarget(target: string): Target {
  if (!commonTargets.includes(target)) {
    throw new Error(`Unknown target: ${target}`)
  }

  return new Target(target)
}