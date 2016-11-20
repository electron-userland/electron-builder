import { PlatformPackager } from "../platformPackager"
import { Arch, Platform } from "../metadata"
import { tar, archive } from "./archive"
import * as path from "path"
import { log } from "../util/log"
import BluebirdPromise from "bluebird-lst-c"

const archiveTargets = new Set(["zip", "7z", "tar.xz", "tar.lz", "tar.gz", "tar.bz2"])
export const DEFAULT_TARGET = "default"
export const DIR_TARGET = "dir"

export abstract class Target {
  constructor(public readonly name: string, public readonly isAsyncSupported: boolean = true) {
  }

  abstract build(appOutDir: string, arch: Arch): Promise<any>

  finishBuild(): Promise<any> {
    return BluebirdPromise.resolve()
  }
}

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
  async build(appOutDir: string, arch: Arch): Promise<any> {
    // no build
  }
}

class ArchiveTarget extends Target {
  constructor(name: string, private outDir: string, private readonly packager: PlatformPackager<any>) {
    super(name)
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    const packager = this.packager
    const isMac = packager.platform === Platform.MAC
    const outDir = this.outDir

    const format = this.name
    log(`Building ${isMac ? "macOS " : ""}${format}`)

    // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
    const outFile = (() => {
      switch (packager.platform) {
        case Platform.MAC:
          return path.join(appOutDir, packager.generateName2(format, "mac", false))
        case Platform.WINDOWS:
          return path.join(outDir, packager.generateName(format, arch, false, "win"))
        case Platform.LINUX:
          return path.join(outDir, packager.generateName(format, arch, true))
        default:
          throw new Error(`Unknown platform: ${packager.platform}`)
      }
    })()

    const dirToArchive = isMac ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`) : appOutDir
    if (format.startsWith("tar.")) {
      await tar(packager.devMetadata.build.compression, format, outFile, dirToArchive, isMac)
    }
    else {
      await archive(packager.devMetadata.build.compression, format, outFile, dirToArchive)
    }

    packager.dispatchArtifactCreated(outFile, isMac ? packager.generateName2(format, "mac", true) : packager.generateName(format, arch, true, packager.platform === Platform.WINDOWS ? "win" : null))
  }
}