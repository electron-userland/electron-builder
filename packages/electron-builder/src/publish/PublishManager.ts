import { hashFile } from "asar-integrity"
import BluebirdPromise from "bluebird-lst"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { BintrayOptions, GenericServerOptions, GithubOptions, githubUrl, PublishConfiguration, PublishProvider, S3Options, s3Url, UpdateInfo, VersionInfo } from "electron-builder-http/out/publishOptions"
import { asArray, debug, isEmptyOrSpaces, isPullRequest, Lazy, safeStringifyJson } from "electron-builder-util"
import { log, warn } from "electron-builder-util/out/log"
import { throwError } from "electron-builder-util/out/promise"
import { HttpPublisher, PublishContext, Publisher, PublishOptions } from "electron-publish"
import { BintrayPublisher } from "electron-publish/out/BintrayPublisher"
import { GitHubPublisher } from "electron-publish/out/gitHubPublisher"
import { MultiProgress } from "electron-publish/out/multiProgress"
import { ensureDir, outputJson, writeFile } from "fs-extra-p"
import isCi from "is-ci"
import { safeDump } from "js-yaml"
import * as path from "path"
import { prerelease } from "semver"
import { WriteStream as TtyWriteStream } from "tty"
import * as url from "url"
import { Arch, Platform, Target } from "../core"
import { PlatformSpecificBuildOptions } from "../metadata"
import { Packager } from "../packager"
import { ArtifactCreated, BuildInfo } from "../packagerApi"
import { PlatformPackager } from "../platformPackager"
import { WinPackager } from "../winPackager"

const publishForPrWarning = "There are serious security concerns with PUBLISH_FOR_PULL_REQUEST=true (see the  CircleCI documentation (https://circleci.com/docs/1.0/fork-pr-builds/) for details)" +
  "\nIf you have SSH keys, sensitive env vars or AWS credentials stored in your project settings and untrusted forks can make pull requests against your repo, then this option isn't for you."

export class PublishManager implements PublishContext {
  private readonly nameToPublisher = new Map<string, Publisher | null>()

  readonly publishTasks: Array<Promise<any>> = []
  private readonly errors: Array<Error> = []

  private readonly isPublish: boolean

  readonly progress = (<TtyWriteStream>process.stdout).isTTY ? new MultiProgress() : null

  constructor(packager: Packager, private readonly publishOptions: PublishOptions, readonly cancellationToken: CancellationToken) {
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
        if (!event.targets.some(it => isSuitableWindowsTarget(it))) {
          return
        }
      }
      else {
        return
      }

      const publishConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, null, event.arch), event.arch)
      if (publishConfigs == null || publishConfigs.length === 0) {
        return
      }

      let publishConfig = publishConfigs[0]

      if (packager.platform === Platform.WINDOWS) {
        const winPackager = <WinPackager>packager
        if (winPackager.isForceCodeSigningVerification) {
          const publisherName = await winPackager.computedPublisherName.value
          if (publisherName != null) {
            publishConfig = Object.assign({publisherName: publisherName}, publishConfig)
          }
        }
      }

      await writeFile(path.join(packager.getResourcesDir(event.appOutDir), "app-update.yml"), safeDump(publishConfig))
    })

    packager.artifactCreated(event => this.addTask(this.artifactCreated(event)))
  }

  private async artifactCreated(event: ArtifactCreated) {
    const packager = event.packager
    const target = event.target
    const publishConfigs = event.publishConfig == null ? await getPublishConfigs(packager, target == null ? null : target.options, event.arch) : [event.publishConfig]

    if (debug.enabled) {
      debug(`artifactCreated: ${safeStringifyJson(event, new Set(["packager"]))},\npublishConfigs: ${safeStringifyJson(publishConfigs)},\nisPublish: ${this.isPublish}`)
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
        if (this.cancellationToken.cancelled) {
          debug(`${eventFile} is not published: cancelled`)
          break
        }

        const publisher = this.getOrCreatePublisher(publishConfig, packager.info)
        if (publisher == null) {
          debug(`${eventFile} is not published: publisher is null, ${safeStringifyJson(publishConfig)}`)
          continue
        }

        if (eventFile == null) {
          this.addTask((<HttpPublisher>publisher).uploadData(event.data!, event.safeArtifactName!))
        }
        else {
          this.addTask(publisher.upload(eventFile!, event.safeArtifactName))
        }
      }
    }

    if (target != null && eventFile != null && !this.cancellationToken.cancelled) {
      if ((packager.platform === Platform.MAC && target.name === "zip") ||
        (packager.platform === Platform.WINDOWS && isSuitableWindowsTarget(target) && eventFile.endsWith(".exe"))) {
        this.addTask(writeUpdateInfo(event, publishConfigs))
      }
    }
  }

  private addTask(promise: Promise<any>) {
    if (this.cancellationToken.cancelled) {
      return
    }

    this.publishTasks.push(promise
      .catch(it => {
        debug(`Publish error: ${it.toString()}`)
        this.errors.push(it)
      }))
  }

  private getOrCreatePublisher(publishConfig: PublishConfiguration, buildInfo: BuildInfo): Publisher | null {
    let publisher = this.nameToPublisher.get(publishConfig.provider)
    if (publisher == null) {
      publisher = createPublisher(this, buildInfo.metadata.version!, publishConfig, this.publishOptions)
      this.nameToPublisher.set(publishConfig.provider, publisher)
      log(`Publishing to ${publisher}`)
    }
    return publisher
  }

  cancelTasks() {
    for (const task of this.publishTasks) {
      if ("cancel" in task) {
        (<any>task).cancel()
      }
    }
    this.publishTasks.length = 0
    this.nameToPublisher.clear()
  }

  async awaitTasks() {
    const checkErrors = () => {
      if (this.errors.length > 0) {
        this.cancelTasks()
        throwError(this.errors)
        return
      }
    }

    checkErrors()

    const publishTasks = this.publishTasks
    let list = publishTasks.slice()
    publishTasks.length = 0
    while (list.length > 0) {
      await BluebirdPromise.all(list)
      checkErrors()
      if (publishTasks.length === 0) {
        break
      }
      else {
        list = publishTasks.slice()
        publishTasks.length = 0
      }
    }
  }
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

async function writeUpdateInfo(event: ArtifactCreated, _publishConfigs: Array<PublishConfiguration>) {
  const packager = event.packager
  const publishConfigs = await getPublishConfigsForUpdateInfo(packager, _publishConfigs, event.arch)
  if (publishConfigs == null || publishConfigs.length === 0) {
    return
  }

  const target = event.target!
  let outDir = target.outDir
  if (target.name.startsWith("nsis-")) {
    outDir = path.join(outDir, target.name)
    await ensureDir(outDir)
  }

  const version = packager.appInfo.version
  const sha2 = new Lazy(() => hashFile(event.file!, "sha256", "hex"))
  const sha512 = new Lazy(() => hashFile(event.file!, "sha512", "base64"))
  const isMac = packager.platform === Platform.MAC

  for (const publishConfig of publishConfigs) {
    if (publishConfig.provider === "bintray") {
      continue
    }

    const channel = (<GenericServerOptions>publishConfig).channel || "latest"
    const createdFiles = new Set<string>()

    if (isMac) {
      const isGitHub = publishConfig.provider === "github"
      // backward compatibility - write json file
      const updateInfoFile = isGitHub ? path.join(outDir, "github", `${channel}-mac.json`) : path.join(outDir, `${channel}-mac.json`)
      await (<any>outputJson)(updateInfoFile, <VersionInfo>{
        version: version,
        releaseDate: new Date().toISOString(),
        url: computeDownloadUrl(publishConfig, packager.generateName2("zip", "mac", isGitHub), packager),
      }, {spaces: 2})

      packager.info.dispatchArtifactCreated({
        file: updateInfoFile,
        arch: null,
        packager: packager,
        target: null,
        publishConfig: publishConfig,
      })
    }

    const updateInfoFile = path.join(outDir, `${channel}${isMac ? "-mac" : ""}.yml`)
    if (!createdFiles.has(updateInfoFile)) {
      createdFiles.add(updateInfoFile)
      const info = <UpdateInfo>{
        version: version,
        releaseDate: new Date().toISOString(),
        githubArtifactName: event.safeArtifactName,
        path: path.basename(event.file!),
        sha512: await sha512.value,
      }

      if (packager.platform === Platform.WINDOWS) {
        // backward compatibility
        (<any>info).sha2 = await sha2.value
      }
      await writeFile(updateInfoFile, safeDump(info))
    }

    // artifact should be uploaded only to designated publish provider
    packager.info.dispatchArtifactCreated({
      file: updateInfoFile,
      arch: null,
      packager: packager,
      target: null,
      publishConfig: publishConfig,
    })
  }
}

export function createPublisher(context: PublishContext, version: string, publishConfig: PublishConfiguration, options: PublishOptions): Publisher | null {
  if (debug.enabled) {
    debug(`create publisher: ${safeStringifyJson(publishConfig)}`)
  }

  const provider = publishConfig.provider
  switch (provider) {
    case "github":
      return new GitHubPublisher(context, publishConfig, version, options)

    case "bintray":
      return new BintrayPublisher(context, publishConfig, version, options)
    
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

    default:
      return require(`electron-publisher-${provider}`).default
  }
}

export function computeDownloadUrl(publishConfig: PublishConfiguration, fileName: string | null, packager: PlatformPackager<any>) {
  if (publishConfig.provider === "generic") {
    const baseUrlString = (<GenericServerOptions>publishConfig).url
    if (fileName == null) {
      return baseUrlString
    }

    const baseUrl = url.parse(baseUrlString)
    return url.format(Object.assign({}, baseUrl, {pathname: path.posix.resolve(baseUrl.pathname || "/", encodeURI(fileName))}))
  }

  let baseUrl
  if (publishConfig.provider === "s3") {
    baseUrl = s3Url((<S3Options>publishConfig))
  }
  else {
    const gh = <GithubOptions>publishConfig
    baseUrl = `${githubUrl(gh)}/${gh.owner}/${gh.repo}/releases/download/${gh.vPrefixedTagName === false ? "" : "v"}${packager.appInfo.version}`
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
  return await (<Promise<Array<PublishConfiguration>>>BluebirdPromise.map(asArray(publishers), it => getResolvedPublishConfig(packager, typeof it === "string" ? {provider: it} : it, arch)))
}

function isSuitableWindowsTarget(target: Target) {
  return target.name === "nsis" || target.name.startsWith("nsis-")
}

function getCiTag() {
  const tag = process.env.TRAVIS_TAG || process.env.APPVEYOR_REPO_TAG_NAME || process.env.CIRCLE_TAG || process.env.BITRISE_GIT_TAG || process.env.CI_BUILD_TAG
  return tag != null && tag.length > 0 ? tag : null
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

async function getResolvedPublishConfig(packager: PlatformPackager<any>, options: PublishConfiguration, arch: Arch | null, errorIfCannot: boolean = true): Promise<PublishConfiguration | null> {
  options = Object.assign(Object.create(null), options)
  expandPublishConfig(options, packager, arch)

  let channelFromAppVersion: string | null = null
  if ((<any>options).channel == null && packager.config.detectUpdateChannel !== false) {
    const prereleaseInfo = prerelease(packager.appInfo.version)
    if (prereleaseInfo != null && prereleaseInfo.length > 0) {
      channelFromAppVersion = prereleaseInfo[0]
    }
  }

  const provider = options.provider
  if (provider === "generic") {
    const o = <GenericServerOptions>options
    if (o.url == null) {
      throw new Error(`Please specify "url" for "generic" update server`)
    }

    if (channelFromAppVersion != null) {
      (<any>o).channel = channelFromAppVersion
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
  
  let owner = isGithub ? (<GithubOptions>options).owner : (<BintrayOptions>options).owner
  let project = isGithub ? (<GithubOptions>options).repo : (<BintrayOptions>options).package

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

    const message = `Cannot detect repository by .git/config. Please specify "repository" in the package.json (https://docs.npmjs.com/files/package.json#repository).\nPlease see https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts`
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
    if ((<GithubOptions>options).token != null && !(<GithubOptions>options).private) {
      warn('"token" specified in the github publish options. It should be used only for [setFeedURL](module:electron-updater/out/AppUpdater.AppUpdater+setFeedURL).')
    }
    return Object.assign({owner, repo: project}, options)
  }
  else {
    return Object.assign({owner, package: project}, options)
  }
}