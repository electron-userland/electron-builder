import { Packager, normalizePlatforms } from "./packager"
import { PackagerOptions, getPublishConfigs, getResolvedPublishConfig } from "./platformPackager"
import { PublishOptions, Publisher } from "./publish/publisher"
import { GitHubPublisher } from "./publish/gitHubPublisher"
import { executeFinally } from "./util/promise"
import BluebirdPromise from "bluebird-lst-c"
import { isEmptyOrSpaces, debug } from "./util/util"
import { log } from "./util/log"
import { Platform, Arch, archFromString } from "./metadata"
import { DIR_TARGET } from "./targets/targetFactory"
import { BintrayPublisher } from "./publish/BintrayPublisher"
import { PublishConfiguration, GithubOptions, BintrayOptions } from "./options/publishOptions"
import isCi from "is-ci"

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
}

function addValue<K, T>(map: Map<K, Array<T>>, key: K, value: T) {
  const list = map.get(key)
  if (list == null) {
    map.set(key, [value])
  }
  else {
    list.push(value)
  }
}

export function normalizeOptions(args: CliOptions): BuildOptions {
  if (args.targets != null) {
    return args
  }

  let targets = new Map<Platform, Map<Arch, Array<string>>>()

  function processTargets(platform: Platform, types: Array<string>) {
    if (args.platform != null) {
      throw new Error(`--platform cannot be used if --${platform.buildConfigurationKey} is passed`)
    }
    if (args.arch != null) {
      throw new Error(`--arch cannot be used if --${platform.buildConfigurationKey} is passed`)
    }

    function commonArch(): Array<Arch> {
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

      return result.length === 0 ? [archFromString(process.arch)] : result
    }

    let archToType = targets.get(platform)
    if (archToType == null) {
      archToType = new Map<Arch, Array<string>>()
      targets.set(platform, archToType)
    }

    if (types.length === 0) {
      const defaultTargetValue = args.dir ? [DIR_TARGET] : []
      if (platform === Platform.MAC) {
        archToType.set(Arch.x64, defaultTargetValue)
      }
      else {
        for (const arch of commonArch()) {
          archToType.set(arch, defaultTargetValue)
        }
      }
      return
    }

    for (const type of types) {
      let arch: string
      if (platform === Platform.MAC) {
        arch = "x64"
        addValue(archToType, Arch.x64, type)
      }
      else {
        const suffixPos = type.lastIndexOf(":")
        if (suffixPos > 0) {
          addValue(archToType, archFromString(type.substring(suffixPos + 1)), type.substring(0, suffixPos))
        }
        else {
          for (const arch of commonArch()) {
            addValue(archToType, arch, type)
          }
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

  let isPublishOptionGuessed = false
  if (options.publish === undefined) {
    if (process.env.npm_lifecycle_event === "release") {
      options.publish = "always"
    }
    else if (isAuthTokenSet() ) {
      const tag = process.env.TRAVIS_TAG || process.env.APPVEYOR_REPO_TAG_NAME || process.env.CIRCLE_TAG
      if (!isEmptyOrSpaces(tag)) {
        log(`Tag ${tag} is defined, so artifacts will be published`)
        options.publish = "onTag"
        isPublishOptionGuessed = true
      }
      else if (isCi) {
        log("CI detected, so artifacts will be published if draft release exists")
        options.publish = "onTagOrDraft"
        isPublishOptionGuessed = true
      }
    }
  }

  const packager = new Packager(options)
  const publishTasks: Array<BluebirdPromise<any>> = []

  if (options.publish != null && options.publish !== "never") {
    // todo if token set as option
    if (isAuthTokenSet()) {
      publishManager(packager, publishTasks, options, isPublishOptionGuessed)
    }
    else if (isCi) {
      log(`CI detected, publish is set to ${options.publish}, but neither GH_TOKEN nor BT_TOKEN is not set, so artifacts will be not published`)
    }
  }

  const artifactPaths: Array<string> = []
  packager.artifactCreated(event => {
    if (event.file != null) {
      artifactPaths.push(event.file)
    }
  })

  return await executeFinally(packager.build().then(() => artifactPaths), errorOccurred => {
    if (errorOccurred) {
      for (const task of publishTasks) {
        task!.cancel()
      }
      return BluebirdPromise.resolve(null)
    }
    else {
      return BluebirdPromise.all(publishTasks)
    }
  })
}

function isAuthTokenSet() {
  return !isEmptyOrSpaces(process.env.GH_TOKEN) || !isEmptyOrSpaces(process.env.BT_TOKEN)
}

function publishManager(packager: Packager, publishTasks: Array<BluebirdPromise<any>>, options: BuildOptions, isPublishOptionGuessed: boolean) {
  const nameToPublisher = new Map<string, Promise<Publisher>>()

  function getOrCreatePublisher(publishConfig: PublishConfiguration): Promise<Publisher | null> {
    let publisher = nameToPublisher.get(publishConfig.provider)
    if (publisher == null) {
      publisher = createPublisher(packager, publishConfig, options, isPublishOptionGuessed)
      nameToPublisher.set(publishConfig.provider, publisher)
    }
    return publisher
  }

  packager.artifactCreated(event => {
    const publishers = event.publishConfig == null ? getPublishConfigs(event.packager, event.packager.platformSpecificBuildOptions) : [event.publishConfig]
    // if explicitly set to null - do not publish
    if (publishers === null) {
      debug(`${event.file} is not published: publish is set to null`)
      return
    }

    for (const publishConfig of publishers) {
      const publisher = getOrCreatePublisher(publishConfig)
      if (publisher != null) {
        publisher
          .then(it => {
            if (it == null) {
              return null
            }

            if (event.file == null) {
              return publishTasks.push(<BluebirdPromise<any>>it.uploadData(event.data!, event.artifactName!))
            }
            else {
              return publishTasks.push(<BluebirdPromise<any>>it.upload(event.file!, event.artifactName))
            }
          })
      }
    }
  })
}

// visible only for tests
// call only from this file or from tests
export async function createPublisher(packager: Packager, publishConfig: PublishConfiguration | GithubOptions | BintrayOptions, options: PublishOptions, isPublishOptionGuessed: boolean = false): Promise<Publisher | null> {
  const config = await getResolvedPublishConfig(packager, publishConfig, isPublishOptionGuessed)
  if (config == null) {
    return null
  }

  const version = packager.metadata.version!
  if (publishConfig.provider === "github") {
    const githubInfo: GithubOptions = config
    log(`Creating Github Publisher — owner: ${githubInfo.owner}, project: ${githubInfo.repo}, version: ${version}`)
    return new GitHubPublisher(githubInfo, version, options, isPublishOptionGuessed)
  }
  if (publishConfig.provider === "bintray") {
    const bintrayInfo: BintrayOptions = config
    log(`Creating Bintray Publisher — user: ${bintrayInfo.user || bintrayInfo.owner}, owner: ${bintrayInfo.owner},  package: ${bintrayInfo.package}, repository: ${bintrayInfo.repo}, version: ${version}`)
    return new BintrayPublisher(bintrayInfo, version, options)
  }
  return null
}