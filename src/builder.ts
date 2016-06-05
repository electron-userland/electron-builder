import { Packager, normalizePlatforms } from "./packager"
import { PackagerOptions } from "./platformPackager"
import { PublishOptions, Publisher, GitHubPublisher } from "./gitHubPublisher"
import { executeFinally } from "./promise"
import { Promise as BluebirdPromise } from "bluebird"
import { InfoRetriever } from "./repositoryInfo"
import { log, warn, isEmptyOrSpaces } from "./util"
import { Platform, Arch, archFromString } from "./metadata"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export async function createPublisher(packager: Packager, options: BuildOptions, repoSlug: InfoRetriever, isPublishOptionGuessed: boolean = false): Promise<Publisher | null> {
  const info = await repoSlug.getInfo(packager)
  if (info == null) {
    if (isPublishOptionGuessed) {
      return null
    }

    warn("Cannot detect repository by .git/config")
    throw new Error(`Please specify 'repository' in the dev package.json ('${packager.devPackageFile}')`)
  }
  else {
    log(`Creating Github Publisher — user: ${info.user}, project: ${info.project}, version: ${packager.metadata.version}`)
    return new GitHubPublisher(info.user, info.project, packager.metadata.version, options.githubToken!, options.publish!)
  }
}

export interface BuildOptions extends PackagerOptions, PublishOptions {
}

export interface CliOptions extends PackagerOptions, PublishOptions {
  osx?: Array<string>
  linux?: Array<string>
  win?: Array<string>

  arch?: string

  x64?: boolean
  ia32?: boolean

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
      if (args.ia32 && args.x64) {
        return [Arch.x64, Arch.ia32]
      }
      else if (args.ia32) {
        return [Arch.ia32]
      }
      else if (args.x64) {
        return [Arch.x64]
      }
      else {
        return [archFromString(process.arch)]
      }
    }

    let archToType = targets.get(platform)
    if (archToType == null) {
      archToType = new Map<Arch, Array<string>>()
      targets.set(platform, archToType)
    }

    if (types.length === 0) {
      for (let arch of commonArch()) {
        archToType.set(arch, [])
      }
      return
    }

    for (let type of types) {
      let arch: string
      if (platform === Platform.OSX) {
        arch = "x64"
        addValue(archToType, Arch.x64, type)
      }
      else {
        const suffixPos = type.lastIndexOf(":")
        if (suffixPos > 0) {
          addValue(archToType, archFromString(type.substring(suffixPos + 1)), type.substring(0, suffixPos))
        }
        else {
          for (let arch of commonArch()) {
            addValue(archToType, arch, type)
          }
        }
      }
    }
  }

  if (args.osx != null) {
    processTargets(Platform.OSX, args.osx)
  }

  if (args.linux != null) {
    processTargets(Platform.LINUX, args.linux)
  }

  if (args.win != null) {
    processTargets(Platform.WINDOWS, args.win)
  }

  if (targets.size === 0) {
    if (args.platform == null) {
      processTargets(Platform.current(), [])
    }
    else {
      targets = createTargets(normalizePlatforms(args.platform), null, args.arch)
    }
  }

  const result = Object.assign({}, args)
  result.targets = targets

  delete result.osx
  delete result.linux
  delete result.win
  delete result.platform
  delete result.arch

  delete (<any>result)["o"]
  delete (<any>result)["l"]
  delete (<any>result)["w"]
  delete (<any>result)["windows"]
  delete (<any>result)["$0"]
  delete (<any>result)["_"]
  delete (<any>result).version
  delete (<any>result).help

  delete result.ia32
  delete result.x64
  return result
}

export function createTargets(platforms: Array<Platform>, type?: string | null, arch?: string | null): Map<Platform, Map<Arch, Array<string>>> {
  const targets = new Map<Platform, Map<Arch, Array<string>>>()
  for (let platform of platforms) {
    const archs = platform === Platform.OSX ? [Arch.x64] : (arch === "all" ? [Arch.x64, Arch.ia32] : [archFromString(arch == null ? process.arch : arch)])
    const archToType = new Map<Arch, Array<string>>()
    targets.set(platform, archToType)

    for (let arch of archs) {
      archToType.set(arch, type == null ? [] : [type])
    }
  }
  return targets
}

export async function build(rawOptions?: CliOptions): Promise<void> {
  const options = normalizeOptions(rawOptions || {})

  if (options.cscLink === undefined && !isEmptyOrSpaces(process.env.CSC_LINK)) {
    options.cscLink = process.env.CSC_LINK
  }
  if (options.cscKeyPassword === undefined && !isEmptyOrSpaces(process.env.CSC_KEY_PASSWORD)) {
    options.cscKeyPassword = process.env.CSC_KEY_PASSWORD
  }
  if (options.githubToken === undefined && !isEmptyOrSpaces(process.env.GH_TOKEN)) {
    options.githubToken = process.env.GH_TOKEN
  }

  let isPublishOptionGuessed = false
  if (options.publish === undefined) {
    if (process.env.npm_lifecycle_event === "release") {
      options.publish = "always"
    }
    else if (options.githubToken != null) {
      const tag = process.env.TRAVIS_TAG || process.env.APPVEYOR_REPO_TAG_NAME || process.env.CIRCLE_TAG
      if (tag != null && tag.length !== 0) {
        log("Tag %s is defined, so artifacts will be published", tag)
        options.publish = "onTag"
        isPublishOptionGuessed = true
      }
      else if ((process.env.CI || "").toLowerCase() === "true") {
        log("CI detected, so artifacts will be published if draft release exists")
        options.publish = "onTagOrDraft"
        isPublishOptionGuessed = true
      }
    }
  }

  const publishTasks: Array<BluebirdPromise<any>> = []
  const repositoryInfo = new InfoRetriever()
  const packager = new Packager(options, repositoryInfo)
  if (options.publish != null && options.publish !== "never") {
    let publisher: Promise<Publisher> | null = null
    packager.artifactCreated(event => {
      if (publisher == null) {
        publisher = createPublisher(packager, options, repositoryInfo, isPublishOptionGuessed)
      }

      if (publisher) {
        publisher
          .then(it => publishTasks.push(<BluebirdPromise<any>>it.upload(event.file, event.artifactName)))
      }
    })
  }

  await executeFinally(packager.build(), errorOccurred => {
    if (errorOccurred) {
      for (let task of publishTasks) {
        task!.cancel()
      }
      return BluebirdPromise.resolve(null)
    }
    else {
      return BluebirdPromise.all(publishTasks)
    }
  })
}
