import BluebirdPromise from "bluebird-lst"
import { Arch, asArray, AsyncTaskManager, isEmptyOrSpaces, isPullRequest, log, safeStringifyJson, warn } from "builder-util"
import { BintrayOptions, CancellationToken, GenericServerOptions, getS3LikeProviderBaseUrl, GithubOptions, githubUrl, PublishConfiguration, PublishProvider } from "builder-util-runtime"
import _debug from "debug"
import { getCiTag, PublishContext, Publisher, PublishOptions } from "electron-publish"
import { BintrayPublisher } from "electron-publish/out/BintrayPublisher"
import { GitHubPublisher } from "electron-publish/out/gitHubPublisher"
import { MultiProgress } from "electron-publish/out/multiProgress"
import { writeFile } from "fs-extra-p"
import isCi from "is-ci"
import { safeDump } from "js-yaml"
import * as path from "path"
import { WriteStream as TtyWriteStream } from "tty"
import * as url from "url"
import { Platform, Target, PlatformSpecificBuildOptions, ArtifactCreated } from "../index"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { WinPackager } from "../winPackager"
import { writeUpdateInfo } from "./updateUnfoBuilder"

const publishForPrWarning = "There are serious security concerns with PUBLISH_FOR_PULL_REQUEST=true (see the  CircleCI documentation (https://circleci.com/docs/1.0/fork-pr-builds/) for details)" +
  "\nIf you have SSH keys, sensitive env vars or AWS credentials stored in your project settings and untrusted forks can make pull requests against your repo, then this option isn't for you."

const debug = _debug("electron-builder:publish")

export class PublishManager implements PublishContext {
  private readonly nameToPublisher = new Map<string, Publisher | null>()

  private readonly taskManager: AsyncTaskManager

  private readonly isPublish: boolean

  readonly progress = (process.stdout as TtyWriteStream).isTTY ? new MultiProgress() : null

  private readonly postponedArtifactCreatedEvents: Array<ArtifactCreated> = []

  constructor(private readonly packager: Packager, private readonly publishOptions: PublishOptions, readonly cancellationToken: CancellationToken) {
    this.taskManager = new AsyncTaskManager(cancellationToken)

    const forcePublishForPr = process.env.PUBLISH_FOR_PULL_REQUEST === "true"
    if (!isPullRequest() || forcePublishForPr) {
      if (publishOptions.publish === undefined) {
        if (process.env.npm_lifecycle_event === "release") {
          publishOptions.publish = "always"
        }
        else {
          const tag = getCiTag()
          if (tag != null) {
            log(`Tag ${tag} is defined, so artifacts will be published`)
            publishOptions.publish = "onTag"
          }
          else if (isCi) {
            log("CI detected, so artifacts will be published if draft release exists")
            publishOptions.publish = "onTagOrDraft"
          }
        }
      }

      const publishPolicy = publishOptions.publish
      this.isPublish = publishPolicy != null && publishOptions.publish !== "never" && (publishPolicy !== "onTag" || getCiTag() != null)
      if (this.isPublish && forcePublishForPr) {
        warn(publishForPrWarning)
      }
    }
    else if (publishOptions.publish !== "never") {
      log("Current build is a part of pull request, publishing will be skipped" +
        "\nSet env PUBLISH_FOR_PULL_REQUEST to true to force code signing." +
        `\n${publishForPrWarning}`)
    }

    packager.addAfterPackHandler(async event => {
      const packager = event.packager
      if (event.electronPlatformName === "darwin") {
        if (!event.targets.some(it => it.name === "zip")) {
          return
        }
      }
      else if (packager.platform === Platform.WINDOWS) {
        if (!event.targets.some(it => isSuitableWindowsTarget(it, null))) {
          return
        }
      }
      else {
        return
      }

      const publishConfig = await getAppUpdatePublishConfiguration(packager, event.arch)
      if (publishConfig != null) {
        await writeFile(path.join(packager.getResourcesDir(event.appOutDir), "app-update.yml"), safeDump(publishConfig))
      }
    })

    packager.artifactCreated(event => this.taskManager.addTask(this.artifactCreated(event)))
  }

  private async artifactCreated(event: ArtifactCreated) {
    const packager = event.packager
    const target = event.target
    const publishConfigs = event.publishConfig == null ? await getPublishConfigs(packager, target == null ? null : target.options, event.arch) : [event.publishConfig]

    if (debug.enabled) {
      debug(`artifactCreated (isPublish: ${this.isPublish}): ${safeStringifyJson(event, new Set(["packager"]))},\n  publishConfigs: ${safeStringifyJson(publishConfigs)}`)
    }

    const eventFile = event.file
    if (publishConfigs == null) {
      if (this.isPublish) {
        debug(`${eventFile} is not published: no publish configs`)
      }
      return
    }

    if (this.isPublish) {
      for (const publishConfig of publishConfigs) {
        if (publishConfig.provider === "generic") {
          continue
        }

        if (this.cancellationToken.cancelled) {
          debug(`${eventFile} is not published: cancelled`)
          break
        }

        const publisher = this.getOrCreatePublisher(publishConfig, packager)
        if (publisher == null) {
          debug(`${eventFile} is not published: publisher is null, ${safeStringifyJson(publishConfig)}`)
          continue
        }

        this.taskManager.addTask(publisher.upload(event))
      }
    }

    if (target != null && eventFile != null && !this.cancellationToken.cancelled) {
      if ((packager.platform === Platform.MAC && target.name === "zip") ||
        (packager.platform === Platform.WINDOWS && isSuitableWindowsTarget(target, event)) ||
        (packager.platform === Platform.LINUX && event.isWriteUpdateInfo)) {
        this.taskManager.addTask(writeUpdateInfo(event, publishConfigs).then(it => this.postponedArtifactCreatedEvents.push(...it)))
      }
    }
  }

  private getOrCreatePublisher(publishConfig: PublishConfiguration, platformPackager: PlatformPackager<any>): Publisher | null {
    // to not include token into cache key
    const providerCacheKey = safeStringifyJson(publishConfig)
    let publisher = this.nameToPublisher.get(providerCacheKey)
    if (publisher == null) {
      publisher = createPublisher(this, platformPackager.info.metadata.version!, publishConfig, this.publishOptions)
      this.nameToPublisher.set(providerCacheKey, publisher)
      log(`Publishing to ${publisher}`)
    }
    return publisher
  }

  cancelTasks() {
    this.taskManager.cancelTasks()
    this.nameToPublisher.clear()
  }

  // noinspection InfiniteRecursionJS
  async awaitTasks(): Promise<void> {
    await this.taskManager.awaitTasks()
    if (!this.cancellationToken.cancelled) {
      if (this.postponedArtifactCreatedEvents.length === 0) {
        return
      }

      const events = this.postponedArtifactCreatedEvents.slice()
      this.postponedArtifactCreatedEvents.length = 0
      for (const event of events) {
        this.packager.dispatchArtifactCreated(event)
      }
      await this.awaitTasks()
    }
  }
}

export async function getAppUpdatePublishConfiguration(packager: PlatformPackager<any>, arch: Arch) {
  const publishConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, null, arch), arch)
  if (publishConfigs == null || publishConfigs.length === 0) {
    return null
  }

  let publishConfig = publishConfigs[0]

  if (packager.platform === Platform.WINDOWS && publishConfig.publisherName == null) {
    const winPackager = packager as WinPackager
    if (winPackager.isForceCodeSigningVerification) {
      const publisherName = await winPackager.computedPublisherName.value
      if (publisherName != null) {
        publishConfig = {...publishConfig, publisherName}
      }
    }
  }
  return publishConfig
}

export async function getPublishConfigsForUpdateInfo(packager: PlatformPackager<any>, publishConfigs: Array<PublishConfiguration> | null, arch: Arch | null): Promise<Array<PublishConfiguration> | null> {
  if (publishConfigs === null) {
    return null
  }

  if (publishConfigs.length === 0) {
    debug("getPublishConfigsForUpdateInfo: no publishConfigs, detect using repository info")
    // https://github.com/electron-userland/electron-builder/issues/925#issuecomment-261732378
    // default publish config is github, file should be generated regardless of publish state (user can test installer locally or manage the release process manually)
    const repositoryInfo = await packager.info.repositoryInfo
    debug(`getPublishConfigsForUpdateInfo: ${safeStringifyJson(repositoryInfo)}`)
    if (repositoryInfo != null && repositoryInfo.type === "github") {
      const resolvedPublishConfig = await getResolvedPublishConfig(packager, {provider: repositoryInfo.type}, arch, false)
      if (resolvedPublishConfig != null) {
        debug(`getPublishConfigsForUpdateInfo: resolve to publish config ${safeStringifyJson(resolvedPublishConfig)}`)
        return [resolvedPublishConfig]
      }
    }
  }
  return publishConfigs
}

export function createPublisher(context: PublishContext, version: string, publishConfig: PublishConfiguration, options: PublishOptions): Publisher | null {
  if (debug.enabled) {
    debug(`Create publisher: ${safeStringifyJson(publishConfig)}`)
  }

  const provider = publishConfig.provider
  switch (provider) {
    case "github":
      return new GitHubPublisher(context, publishConfig as GithubOptions, version, options)

    case "bintray":
      return new BintrayPublisher(context, publishConfig as BintrayOptions, version, options)

    case "generic":
      return null

    default:
      const clazz = requireProviderClass(provider)
      return clazz == null ? null : new clazz(context, publishConfig)
  }
}

function requireProviderClass(provider: string): any | null {
  switch (provider) {
    case "github":
      return GitHubPublisher

    case "bintray":
      return BintrayPublisher

    case "generic":
      return null

    case "spaces":
      return require(`electron-publisher-s3/out/${provider}Publisher`).default

    default:
      return require(`electron-publisher-${provider}`).default
  }
}

export function computeDownloadUrl(publishConfiguration: PublishConfiguration, fileName: string | null, packager: PlatformPackager<any>) {
  if (publishConfiguration.provider === "generic") {
    const baseUrlString = (publishConfiguration as GenericServerOptions).url
    if (fileName == null) {
      return baseUrlString
    }

    const baseUrl = url.parse(baseUrlString)
    return url.format({...baseUrl as url.UrlObject, pathname: path.posix.resolve(baseUrl.pathname || "/", encodeURI(fileName))})
  }

  let baseUrl
  if (publishConfiguration.provider === "github") {
    const gh = publishConfiguration as GithubOptions
    baseUrl = `${githubUrl(gh)}/${gh.owner}/${gh.repo}/releases/download/${gh.vPrefixedTagName === false ? "" : "v"}${packager.appInfo.version}`
  }
  else {
    baseUrl = getS3LikeProviderBaseUrl(publishConfiguration)
  }

  if (fileName == null) {
    return baseUrl
  }
  return `${baseUrl}/${encodeURI(fileName)}`
}

export async function getPublishConfigs(packager: PlatformPackager<any>, targetSpecificOptions: PlatformSpecificBuildOptions | null | undefined, arch: Arch | null): Promise<Array<PublishConfiguration> | null> {
  let publishers

  // check build.nsis (target)
  if (targetSpecificOptions != null) {
    publishers = targetSpecificOptions.publish
    // if explicitly set to null - do not publish
    if (publishers === null) {
      return null
    }
  }

  // check build.win (platform)
  if (publishers == null) {
    publishers = packager.platformSpecificBuildOptions.publish
    if (publishers === null) {
      return null
    }
  }

  if (publishers == null) {
    publishers = packager.config.publish
    if (publishers === null) {
      return null
    }
  }

  if (publishers == null) {
    let serviceName: PublishProvider | null = null
    if (!isEmptyOrSpaces(process.env.GH_TOKEN)) {
      serviceName = "github"
    }
    else if (!isEmptyOrSpaces(process.env.BT_TOKEN)) {
      serviceName = "bintray"
    }

    if (serviceName != null) {
      debug(`Detect ${serviceName} as publish provider`)
      return [(await getResolvedPublishConfig(packager, {provider: serviceName}, arch))!]
    }
  }

  if (publishers == null) {
    return []
  }

  debug(`Explicit publish provider: ${safeStringifyJson(publishers)}`)
  return await (BluebirdPromise.map(asArray(publishers), it => getResolvedPublishConfig(packager, typeof it === "string" ? {provider: it} : it, arch)) as Promise<Array<PublishConfiguration>>)
}

function isSuitableWindowsTarget(target: Target, event: ArtifactCreated | null) {
  if (event != null && !event.isWriteUpdateInfo) {
    return false
  }

  if (target.name === "appx" && target.options != null && (target.options as any).electronUpdaterAware) {
    return true
  }
  return target.name === "nsis" || target.name.startsWith("nsis-")
}

function expandPublishConfig(options: any, packager: PlatformPackager<any>, arch: Arch | null): void {
  for (const name of Object.keys(options)) {
    const value = options[name]
    if (typeof value === "string") {
      const expanded = packager.expandMacro(value, arch == null ? null : Arch[arch])
      if (expanded !== value) {
        options[name] = expanded
      }
    }
  }
}

function isDetectUpdateChannel(packager: PlatformPackager<any>) {
  const value = packager.platformSpecificBuildOptions.detectUpdateChannel
  return value == null ? packager.config.detectUpdateChannel !== false : value
}

async function getResolvedPublishConfig(packager: PlatformPackager<any>, options: PublishConfiguration, arch: Arch | null, errorIfCannot: boolean = true): Promise<PublishConfiguration | GithubOptions | BintrayOptions | null> {
  options = Object.assign(Object.create(null), options)
  expandPublishConfig(options, packager, arch)

  let channelFromAppVersion: string | null = null
  if ((options as any).channel == null && isDetectUpdateChannel(packager)) {
    channelFromAppVersion = packager.appInfo.channel
  }

  const provider = options.provider
  if (provider === "generic") {
    const o = options as GenericServerOptions
    if (o.url == null) {
      throw new Error(`Please specify "url" for "generic" update server`)
    }

    if (channelFromAppVersion != null) {
      (o as any).channel = channelFromAppVersion
    }
    return options
  }

  const providerClass = requireProviderClass(options.provider)
  if (providerClass != null && providerClass.checkAndResolveOptions != null) {
    await providerClass.checkAndResolveOptions(options, channelFromAppVersion)
    return options
  }

  const isGithub = provider === "github"
  if (!isGithub && provider !== "bintray") {
    return options
  }

  let owner = isGithub ? (options as GithubOptions).owner : (options as BintrayOptions).owner
  let project = isGithub ? (options as GithubOptions).repo : (options as BintrayOptions).package

  if (isGithub && owner == null && project != null) {
    const index = project.indexOf("/")
    if (index > 0) {
      const repo = project
      project = repo.substring(0, index)
      owner = repo.substring(index + 1)
    }
  }

  async function getInfo() {
    const info = await packager.info.repositoryInfo
    if (info != null) {
      return info
    }

    const message = `Cannot detect repository by .git/config. Please specify "repository" in the package.json (https://docs.npmjs.com/files/package.json#repository).\nPlease see https://electron.build/configuration/publish`
    if (errorIfCannot) {
      throw new Error(message)
    }
    else {
      warn(message)
      return null
    }
  }

  if (!owner || !project) {
    debug(`Owner or project is not specified explicitly for ${provider}, call getInfo: owner: ${owner}, project: ${project}`)
    const info = await getInfo()
    if (info == null) {
      return null
    }

    if (!owner) {
      owner = info.user
    }
    if (!project) {
      project = info.project
    }
  }

  if (isGithub) {
    if ((options as GithubOptions).token != null && !(options as GithubOptions).private) {
      warn('"token" specified in the github publish options. It should be used only for [setFeedURL](module:electron-updater/out/AppUpdater.AppUpdater+setFeedURL).')
    }
    return {owner, repo: project, ...options}
  }
  else {
    return {owner, package: project, ...options}
  }
}