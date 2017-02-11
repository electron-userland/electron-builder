import { PlatformPackager } from "../platformPackager"
import { Arch, Target } from "electron-builder-core"
import { ArchiveTarget } from "./ArchiveTarget"

const archiveTargets = new Set(["zip", "7z", "tar.xz", "tar.lz", "tar.gz", "tar.bz2"])
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

  const targets = normalizeTargets(rawList == null || rawList.length === 0 ? packager.platformSpecificBuildOptions.target : rawList, packager.defaultTarget)
  packager.createTargets(targets, mapper, cleanupTasks)
  return result
}

function normalizeTargets(targets: Array<string> | string | null | undefined, defaultTarget: Array<string>): Array<string> {
  if (targets == null) {
    return defaultTarget
  }

  const list: Array<string> = []
  for (const t of (Array.isArray(targets) ? targets : [targets])) {
    const name = t.toLowerCase().trim()
    if (name === DEFAULT_TARGET) {
      list.push(...defaultTarget)
    }
    else {
      list.push(name)
    }
  }
  return list
}

export function createCommonTarget(target: string, outDir: string, packager: PlatformPackager<any>): Target {
  if (archiveTargets.has(target)) {
    return new ArchiveTarget(target, outDir, packager)
  }
  else if (target === "dir") {
    return new NoOpTarget("dir")
  }
  else {
    throw new Error(`Unknown target: ${target}`)
  }
}

export class NoOpTarget extends Target {
  get outDir(): string {
    throw new Error("NoOpTarget")
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    // no build
  }
}