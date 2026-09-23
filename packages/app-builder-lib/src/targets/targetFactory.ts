import { addValue, Arch, archFromString, ArchType, asArray } from "builder-util"
import { DEFAULT_TARGET, DIR_TARGET, Platform, Target, TargetConfiguration } from "../core.js"
import { PlatformPackager } from "../platformPackager.js"
import { ArchiveTarget } from "./ArchiveTarget.js"

const archiveTargets = new Set(["zip", "7z", "tar.xz", "tar.lz", "tar.gz", "tar.bz2"])

/**
 * Populates the per-platform arch→target map from a list of CLI/config target specs (e.g. "nsis", "deb:armv7l").
 * The shared scaffolding (get-or-create the platform map + the `target:arch` suffix parsing) is consolidated here;
 * callers inject `commonArch` (how default architectures are resolved) and `setEmptyTypes` (what to do when no
 * target types were given) since those policies differ between the programmatic packager and the CLI.
 */
export function addTargetsForPlatform(
  targets: Map<Platform, Map<Arch, Array<string>>>,
  platform: Platform,
  types: Array<string>,
  commonArch: (currentIfNotSpecified: boolean) => Array<Arch>,
  setEmptyTypes: (archToType: Map<Arch, Array<string>>) => void
): void {
  let archToType = targets.get(platform)
  if (archToType == null) {
    archToType = new Map<Arch, Array<string>>()
    targets.set(platform, archToType)
  }

  if (types.length === 0) {
    setEmptyTypes(archToType)
    return
  }

  for (const type of types) {
    const suffixPos = type.lastIndexOf(":")
    if (suffixPos > 0) {
      addValue(archToType, archFromString(type.substring(suffixPos + 1)), type.substring(0, suffixPos))
    } else {
      for (const arch of commonArch(true)) {
        addValue(archToType, arch, type)
      }
    }
  }
}

export function computeArchToTargetNamesMap(raw: Map<Arch, Array<string>>, platformPackager: PlatformPackager<any>, platform: Platform): Map<Arch, Array<string>> {
  for (const targetNames of raw.values()) {
    if (targetNames.length > 0) {
      // https://github.com/electron-userland/electron-builder/issues/1355
      return raw
    }
  }

  const defaultArchs: Array<ArchType> = raw.size === 0 ? [process.arch as ArchType] : Array.from(raw.keys()).map(it => Arch[it] as ArchType)
  const result = new Map(raw)
  for (const target of asArray(platformPackager.platformOptions.target).map<TargetConfiguration>(it => (typeof it === "string" ? { target: it } : it))) {
    let name = target.target
    let archs = target.arch
    const suffixPos = name.lastIndexOf(":")
    if (suffixPos > 0) {
      name = target.target.substring(0, suffixPos)
      if (archs == null) {
        archs = target.target.substring(suffixPos + 1) as ArchType
      }
    }

    for (const arch of archs == null ? defaultArchs : asArray(archs)) {
      addValue(result, archFromString(arch), name)
    }
  }

  if (result.size === 0) {
    const defaultTarget = platformPackager.defaultTarget
    if (raw.size === 0 && platform === Platform.LINUX && (process.platform === "darwin" || process.platform === "win32")) {
      result.set(Arch.x64, defaultTarget)
      // cannot enable arm because of native dependencies - e.g. keytar doesn't provide pre-builds for arm
      // result.set(Arch.armv7l, ["snap"])
    } else {
      for (const arch of defaultArchs) {
        result.set(archFromString(arch), defaultTarget)
      }
    }
  }

  return result
}

export function createTargets(nameToTarget: Map<string, Target>, rawList: Array<string>, outDir: string, packager: PlatformPackager<any>): Array<Target> {
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
  packager.createTargets(targets, mapper)
  return result
}

function normalizeTargets(targets: Array<string>, defaultTarget: Array<string>): Array<string> {
  const list: Array<string> = []
  for (const t of targets) {
    const name = t.toLowerCase().trim()
    if (name === DEFAULT_TARGET) {
      list.push(...defaultTarget)
    } else {
      list.push(name)
    }
  }
  return list
}

export function createCommonTarget(target: string, outDir: string, packager: PlatformPackager<any>): Target {
  if (archiveTargets.has(target)) {
    return new ArchiveTarget(target, outDir, packager)
  } else if (target === DIR_TARGET) {
    return new NoOpTarget(DIR_TARGET)
  } else {
    throw new Error(`Unknown target: ${target}`)
  }
}

export class NoOpTarget extends Target {
  readonly options = null

  constructor(name: string) {
    super(name)
  }

  get outDir(): string {
    throw new Error("NoOpTarget")
  }

  // eslint-disable-next-line
  async build(appOutDir: string, arch: Arch): Promise<any> {
    // no build
  }
}
