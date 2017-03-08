import { Arch, archFromString, DEFAULT_TARGET, DIR_TARGET, Platform, Target, TargetConfig } from "electron-builder-core"
import { addValue, asArray } from "electron-builder-util"
import { PlatformSpecificBuildOptions } from "../metadata"
import { PlatformPackager } from "../platformPackager"
import { ArchiveTarget } from "./ArchiveTarget"

const archiveTargets = new Set(["zip", "7z", "tar.xz", "tar.lz", "tar.gz", "tar.bz2"])

export function computeArchToTargetNamesMap(raw: Map<Arch, string[]>, options: PlatformSpecificBuildOptions, platform: Platform): Map<Arch, string[]> {
  const result = new Map(raw)
  const defaultArch = platform === Platform.MAC ? "x64" : process.arch
  for (const target of asArray(options.target).map<TargetConfig>(it => typeof it === "string" ? {target: it} : it)) {
    let name = target.target
    let archs = target.arch
    const suffixPos = name.lastIndexOf(":")
    if (suffixPos > 0) {
      name = target.target.substring(0, suffixPos)
      if (archs == null) {
        archs = target.target.substring(suffixPos + 1)
      }
    }

    for (const arch of asArray(archs || defaultArch)) {
      addValue(result, archFromString(arch), name)
    }
  }

  if (result.size === 0) {
    result.set(archFromString(defaultArch), [])
  }

  return result
}

export function createTargets(nameToTarget: Map<String, Target>, rawList: Array<string>, outDir: string, packager: PlatformPackager<any>, cleanupTasks: Array<() => Promise<any>>): Array<Target> {
  const result: Array<Target> = []

  const mapper = (name: string, factory: (outDir: string) => Target) => {
    let target = nameToTarget.get(name)
    if (target == null) {
      target = factory(outDir)
      nameToTarget.set(name, target)
    }
    result.push(target)
  }

  const targets = normalizeTargets(rawList, packager.defaultTarget)
  packager.createTargets(targets, mapper, cleanupTasks)
  return result
}

function normalizeTargets(targets: Array<string>, defaultTarget: Array<string>): Array<string> {
  const list: Array<string> = []
  for (const t of targets) {
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
  else if (target === DIR_TARGET) {
    return new NoOpTarget(DIR_TARGET)
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