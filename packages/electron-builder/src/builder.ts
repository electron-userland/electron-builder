import BluebirdPromise from "bluebird-lst"
import { Arch, archFromString, DIR_TARGET, Platform } from "electron-builder-core"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { addValue, isEmptyOrSpaces } from "electron-builder-util"
import { warn } from "electron-builder-util/out/log"
import { executeFinally } from "electron-builder-util/out/promise"
import { PublishOptions } from "electron-publish"
import { normalizePlatforms, Packager } from "./packager"
import { PackagerOptions } from "./packagerApi"
import { PublishManager } from "./publish/PublishManager"

export interface BuildOptions extends PackagerOptions, PublishOptions {
}

export interface CliOptions extends PackagerOptions, PublishOptions {
  mac?: Array<string>
  linux?: Array<string>
  win?: Array<string>

  arch?: string

  x64?: boolean
  ia32?: boolean
  armv7l?: boolean

  dir?: boolean

  platform?: string

  project?: string
}

export function normalizeOptions(args: CliOptions): BuildOptions {
  if (args.targets != null) {
    return args
  }

  let targets = new Map<Platform, Map<Arch, Array<string>>>()

  function processTargets(platform: Platform, types: Array<string>) {
    function commonArch(currentIfNotSpecified: boolean): Array<Arch> {
      if (platform === Platform.MAC) {
        return args.x64 || currentIfNotSpecified ? [Arch.x64] : []
      }

      const result = Array<Arch>()
      if (args.x64) {
        result.push(Arch.x64)
      }
      if (args.armv7l) {
        result.push(Arch.armv7l)
      }
      if (args.ia32) {
        result.push(Arch.ia32)
      }

      return result.length === 0 && currentIfNotSpecified ? [archFromString(process.arch)] : result
    }

    if (args.platform != null) {
      throw new Error(`--platform cannot be used if --${platform.buildConfigurationKey} is passed`)
    }
    if (args.arch != null) {
      throw new Error(`--arch cannot be used if --${platform.buildConfigurationKey} is passed`)
    }

    let archToType = targets.get(platform)
    if (archToType == null) {
      archToType = new Map<Arch, Array<string>>()
      targets.set(platform, archToType)
    }

    if (types.length === 0) {
      const defaultTargetValue = args.dir ? [DIR_TARGET] : []
      for (const arch of commonArch(args.dir === true)) {
        archToType.set(arch, defaultTargetValue)
      }
      return
    }

    for (const type of types) {
      const suffixPos = type.lastIndexOf(":")
      if (suffixPos > 0) {
        addValue(archToType, archFromString(type.substring(suffixPos + 1)), type.substring(0, suffixPos))
      }
      else {
        for (const arch of commonArch(true)) {
          addValue(archToType, arch, type)
        }
      }
    }
  }

  if (args.mac != null) {
    processTargets(Platform.MAC, args.mac)
  }

  if (args.linux != null) {
    processTargets(Platform.LINUX, args.linux)
  }

  if (args.win != null) {
    processTargets(Platform.WINDOWS, args.win)
  }

  if (targets.size === 0) {
    if (args.platform == null && args.arch == null) {
      processTargets(Platform.current(), [])
    }
    else {
      targets = createTargets(normalizePlatforms(args.platform), args.dir ? DIR_TARGET : null, args.arch)
    }
  }

  const result = Object.assign({}, args)
  result.targets = targets

  delete result.dir
  delete result.mac
  delete result.linux
  delete result.win
  delete result.platform
  delete result.arch

  const r = <any>result
  delete r.em

  delete r.m
  delete r.o
  delete r.l
  delete r.w
  delete r.windows
  delete r.macos
  delete r.$0
  delete r._
  delete r.version
  delete r.help

  delete result.ia32
  delete result.x64
  delete result.armv7l

  if (result.project != null && result.projectDir == null) {
    result.projectDir = result.project
  }
  delete result.project
  return result
}

export function createTargets(platforms: Array<Platform>, type?: string | null, arch?: string | null): Map<Platform, Map<Arch, Array<string>>> {
  const targets = new Map<Platform, Map<Arch, Array<string>>>()
  for (const platform of platforms) {
    const archs = platform === Platform.MAC ? [Arch.x64] : (arch === "all" ? [Arch.x64, Arch.ia32] : [archFromString(arch == null ? process.arch : arch)])
    const archToType = new Map<Arch, Array<string>>()
    targets.set(platform, archToType)

    for (const arch of archs) {
      archToType.set(arch, type == null ? [] : [type])
    }
  }
  return targets
}

export async function build(rawOptions?: CliOptions): Promise<Array<string>> {
  const options = normalizeOptions(rawOptions || {})

  if (options.cscLink === undefined && !isEmptyOrSpaces(process.env.CSC_LINK)) {
    options.cscLink = process.env.CSC_LINK
  }
  if (options.cscInstallerLink === undefined && !isEmptyOrSpaces(process.env.CSC_INSTALLER_LINK)) {
    options.cscInstallerLink = process.env.CSC_INSTALLER_LINK
  }
  if (options.cscKeyPassword === undefined && !isEmptyOrSpaces(process.env.CSC_KEY_PASSWORD)) {
    options.cscKeyPassword = process.env.CSC_KEY_PASSWORD
  }
  if (options.cscInstallerKeyPassword === undefined && !isEmptyOrSpaces(process.env.CSC_INSTALLER_KEY_PASSWORD)) {
    options.cscInstallerKeyPassword = process.env.CSC_INSTALLER_KEY_PASSWORD
  }

  if (options.draft === undefined && !isEmptyOrSpaces(process.env.EP_DRAFT)) {
    options.draft = process.env.EP_DRAFT.toLowerCase() === "true"
  }
  if (options.prerelease === undefined && !isEmptyOrSpaces(process.env.EP_PRELEASE)) {
    options.prerelease = process.env.EP_PRELEASE.toLowerCase() === "true"
  }

  const cancellationToken = new CancellationToken()
  const packager = new Packager(options, cancellationToken)
  // because artifact event maybe dispatched several times for different publish providers
  const artifactPaths = new Set<string>()
  packager.artifactCreated(event => {
    if (event.file != null) {
      artifactPaths.add(event.file)
    }
  })

  const publishManager = new PublishManager(packager, options, cancellationToken)
  const buildPromise = packager.build().then(() => Array.from(artifactPaths))
  process.on("SIGINT", () => {
    warn("Cancelled by SIGINT")
    cancellationToken.cancel()
    publishManager.cancelTasks()
  })

  return await executeFinally(buildPromise, errorOccurred => {
    if (errorOccurred) {
      publishManager.cancelTasks()
      return BluebirdPromise.resolve(null)
    }
    else {
      return publishManager.awaitTasks()
    }
  })
}