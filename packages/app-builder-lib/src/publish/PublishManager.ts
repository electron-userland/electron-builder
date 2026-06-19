import {
  Arch,
  asArray,
  AsyncTaskManager,
  derivePublicKeyPem,
  exists,
  InvalidConfigurationError,
  isEmptyOrSpaces,
  isPullRequest,
  loadUpdateSigningKey,
  log,
  safeStringifyJson,
  serializeToYaml,
} from "builder-util"
import {
  BitbucketOptions,
  CancellationToken,
  GenericServerOptions,
  getS3LikeProviderBaseUrl,
  GithubOptions,
  githubTagPrefix,
  githubUrl,
  GitlabOptions,
  KeygenOptions,
  Nullish,
  PublishConfiguration,
  PublishProvider,
  SnapStoreOptions,
} from "builder-util-runtime"
import _debug from "debug"
import {
  BitbucketPublisher,
  getCiTag,
  GitHubPublisher,
  GitlabPublisher,
  KeygenPublisher,
  PublishContext,
  Publisher,
  PublishOptions,
  S3Publisher,
  SnapStorePublisher,
  SpacesPublisher,
  UploadTask,
} from "electron-publish"
import { MultiProgress } from "electron-publish/internal"
import { readFile } from "fs/promises"
import _fsExtra from "fs-extra"
const { outputFile } = _fsExtra
import * as path from "path"
import { WriteStream as TtyWriteStream } from "tty"
import { AppInfo } from "../appInfo.js"
import { Configuration } from "../configuration.js"
import { Platform, Target, TargetSpecificOptions } from "../core.js"
import { ArtifactCreated } from "../packagerApi.js"
import { PlatformSpecificBuildOptions } from "../options/PlatformSpecificBuildOptions.js"
import { Packager } from "../packager.js"
import { PlatformPackager } from "../platformPackager.js"
import { WinPackager } from "../winPackager.js"
import { createUpdateInfoTasks, UpdateInfoFileTask, writeUpdateInfoFiles } from "./updateInfoBuilder.js"
import { resolveModule } from "../util/resolve.js"
import { parseUrl } from "../util/pathManager.js"
import { isPublishForPullRequest } from "../util/flags.js"

const publishForPrWarning =
  "There are serious security concerns with PUBLISH_FOR_PULL_REQUEST=true (see the  CircleCI documentation (https://circleci.com/docs/1.0/fork-pr-builds/) for details)" +
  "\nIf you have SSH keys, sensitive env vars or AWS credentials stored in your project settings and untrusted forks can make pull requests against your repo, then this option isn't for you."

const debug = _debug("electron-builder:publish")

function checkOptions(publishPolicy: any) {
  if (publishPolicy != null && publishPolicy !== "onTag" && publishPolicy !== "onTagOrDraft" && publishPolicy !== "always" && publishPolicy !== "never") {
    if (typeof publishPolicy === "string") {
      throw new InvalidConfigurationError(
        `Expected one of "onTag", "onTagOrDraft", "always", "never", but got ${JSON.stringify(
          publishPolicy
        )}.\nPlease note that publish configuration should be specified under "config"`
      )
    }
  }
}

export class PublishManager implements PublishContext {
  private readonly nameToPublisher = new Map<string, Publisher | null>()

  private readonly taskManager: AsyncTaskManager

  readonly isPublish: boolean = false

  readonly progress = (process.stdout as TtyWriteStream).isTTY ? new MultiProgress() : null

  private readonly updateFileWriteTask: Array<UpdateInfoFileTask> = []

  constructor(
    private readonly packager: Packager,
    private readonly publishOptions: PublishOptions,
    readonly cancellationToken: CancellationToken = packager.cancellationToken
  ) {
    checkOptions(publishOptions.publish)

    this.taskManager = new AsyncTaskManager(cancellationToken)

    const forcePublishForPr = isPublishForPullRequest()
    if (!isPullRequest() || forcePublishForPr) {
      const publishPolicy = publishOptions.publish
      this.isPublish = publishPolicy != null && publishOptions.publish !== "never" && (publishPolicy !== "onTag" || getCiTag() != null)
      if (this.isPublish && forcePublishForPr) {
        log.warn(publishForPrWarning)
      }
    } else if (publishOptions.publish !== "never") {
      log.info(
        {
          reason: "current build is a part of pull request",
          solution: `set env PUBLISH_FOR_PULL_REQUEST to true to force code signing\n${publishForPrWarning}`,
        },
        "publishing will be skipped"
      )
    }

    packager.onAfterPack(async event => {
      const packager = event.packager
      if (event.electronPlatformName === "darwin") {
        if (!event.targets.some(it => it.name === "dmg" || it.name === "zip")) {
          return
        }
      } else if (packager.platform === Platform.WINDOWS) {
        if (!event.targets.some(it => isSuitableWindowsTarget(it))) {
          return
        }
      }

      const publishConfig = await getAppUpdatePublishConfiguration(packager, null, event.arch, this.isPublish)
      if (publishConfig != null) {
        await writeAppUpdateYaml(packager.getResourcesDir(event.appOutDir), publishConfig)
      }
    })

    packager.onArtifactCreated(async event => {
      const publishConfiguration = event.publishConfig
      if (publishConfiguration == null) {
        this.taskManager.addTask(this.artifactCreatedWithoutExplicitPublishConfig(event))
      } else if (this.isPublish) {
        if (debug.enabled) {
          debug(`artifactCreated (isPublish: ${this.isPublish}): ${safeStringifyJson(event, new Set(["packager"]))},\n  publishConfig: ${safeStringifyJson(publishConfiguration)}`)
        }
        await this.scheduleUpload(publishConfiguration, event, this.getAppInfo(event.packager))
      }
    })
  }

  private getAppInfo(platformPackager: PlatformPackager<any> | null) {
    return platformPackager == null ? this.packager.appInfo : platformPackager.appInfo
  }

  async getGlobalPublishConfigurations(): Promise<Array<PublishConfiguration> | null> {
    const publishers = this.packager.config.publish
    return await resolvePublishConfigurations(publishers, null, null, true, this.packager)
  }

  async scheduleUpload(publishConfig: PublishConfiguration, event: UploadTask, appInfo: AppInfo): Promise<void> {
    if (publishConfig.provider === "generic") {
      return
    }

    const publisher = await this.getOrCreatePublisher(publishConfig, appInfo)
    if (publisher == null) {
      log.debug(
        {
          file: log.filePath(event.file),
          reason: "publisher is null",
          publishConfig: safeStringifyJson(publishConfig),
        },
        "not published"
      )
      return
    }

    const providerName = publisher.providerName
    if (this.publishOptions.publish === "onTagOrDraft" && getCiTag() == null && providerName !== "bitbucket" && providerName !== "github") {
      log.info({ file: log.filePath(event.file), reason: "current build is not for a git tag", publishPolicy: "onTagOrDraft" }, `not published to ${providerName}`)
      return
    }

    if (publishConfig.timeout) {
      event.timeout = publishConfig.timeout
    }

    this.taskManager.addTask(publisher.upload(event))
  }

  private async artifactCreatedWithoutExplicitPublishConfig(event: ArtifactCreated) {
    const platformPackager = event.packager
    const target = event.target
    const publishConfigs = await getPublishConfigs(platformPackager, target == null ? null : target.options, event.arch, this.isPublish)

    if (debug.enabled) {
      debug(`artifactCreated (isPublish: ${this.isPublish}): ${safeStringifyJson(event, new Set(["packager"]))},\n  publishConfigs: ${safeStringifyJson(publishConfigs)}`)
    }

    const eventFile = event.file
    if (publishConfigs == null) {
      if (this.isPublish) {
        log.debug({ file: eventFile, reason: "no publish configs" }, "not published")
      }
      return
    }

    if (this.isPublish) {
      for (const publishConfig of publishConfigs) {
        if (this.cancellationToken.cancelled) {
          log.debug({ file: event.file, reason: "cancelled" }, "not published")
          break
        }

        await this.scheduleUpload(publishConfig, event, this.getAppInfo(platformPackager))
      }
    }

    if (
      event.isWriteUpdateInfo &&
      target != null &&
      eventFile != null &&
      !this.cancellationToken.cancelled &&
      (platformPackager.platform !== Platform.WINDOWS || isSuitableWindowsTarget(target))
    ) {
      this.taskManager.addTask(createUpdateInfoTasks(event, publishConfigs).then(it => this.updateFileWriteTask.push(...it)))
    }
  }

  private async getOrCreatePublisher(publishConfig: PublishConfiguration, appInfo: AppInfo): Promise<Publisher | null> {
    // to not include token into cache key
    const providerCacheKey = safeStringifyJson(publishConfig)
    let publisher = this.nameToPublisher.get(providerCacheKey)
    if (publisher == null) {
      publisher = await createPublisher(this, appInfo.version, publishConfig, this.publishOptions, this.packager)
      this.nameToPublisher.set(providerCacheKey, publisher)
      log.info({ publisher: publisher!.toString() }, "publishing")
    }
    return publisher
  }

  // noinspection JSUnusedGlobalSymbols
  cancelTasks() {
    this.taskManager.cancelTasks()
    this.nameToPublisher.clear()
  }

  async awaitTasks(): Promise<void> {
    await this.taskManager.awaitTasks()

    const updateInfoFileTasks = this.updateFileWriteTask
    if (this.cancellationToken.cancelled || updateInfoFileTasks.length === 0) {
      return
    }

    await writeUpdateInfoFiles(updateInfoFileTasks, this.packager)
    await this.taskManager.awaitTasks()
  }
}

export async function getAppUpdatePublishConfiguration(
  packager: PlatformPackager<any>,
  targetSpecificOptions: TargetSpecificOptions | Nullish,
  arch: Arch,
  errorIfCannot: boolean
): Promise<PublishConfiguration | null> {
  const publishConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, null, arch, errorIfCannot), arch)
  if (publishConfigs == null || publishConfigs.length === 0) {
    return null
  }

  const publishConfig = {
    ...publishConfigs[0],
    updaterCacheDirName: packager.appInfo.updaterCacheDirName,
  }

  if (packager.platform === Platform.WINDOWS && publishConfig.publisherName == null) {
    const winPackager = packager as WinPackager
    const publisherName = winPackager.isForceCodeSigningVerification ? await (await winPackager.signingManager.value).computedPublisherName.value : undefined
    if (publisherName != null) {
      publishConfig.publisherName = publisherName
    }
  }

  // Embed the update-manifest verification public key so the updater can verify signed manifests.
  // Explicit publicKey wins; otherwise derive it from the configured signing private key so the
  // user only manages one secret.
  const updateManifestConfig = packager.platformOptions.updateManifest ?? packager.config.updateManifest
  if (updateManifestConfig != null && publishConfig.updateManifestPublicKey == null) {
    if (updateManifestConfig.publicKey) {
      publishConfig.updateManifestPublicKey = updateManifestConfig.publicKey
    } else {
      const signingKeyPem = loadUpdateSigningKey(updateManifestConfig)
      if (signingKeyPem != null) {
        publishConfig.updateManifestPublicKey = derivePublicKeyPem(signingKeyPem)
      }
    }
  }
  return publishConfig
}

export async function writeAppUpdateYaml(resourcesDir: string, publishConfig: PublishConfiguration): Promise<void> {
  await outputFile(path.join(resourcesDir, "app-update.yml"), serializeToYaml(publishConfig))
}

export async function getPublishConfigsForUpdateInfo(
  packager: PlatformPackager<any>,
  publishConfigs: Array<PublishConfiguration> | null,
  arch: Arch | null
): Promise<Array<PublishConfiguration> | null> {
  if (publishConfigs === null) {
    return null
  }

  if (publishConfigs.length === 0) {
    log.debug(null, "getPublishConfigsForUpdateInfo: no publishConfigs, detect using repository info")
    // https://github.com/electron-userland/electron-builder/issues/925#issuecomment-261732378
    // default publish config is github, file should be generated regardless of publish state (user can test installer locally or manage the release process manually)
    const repositoryInfo = await packager.repositoryInfo
    debug(`getPublishConfigsForUpdateInfo: ${safeStringifyJson(repositoryInfo)}`)
    if (repositoryInfo != null && repositoryInfo.type === "github") {
      const resolvedPublishConfig = await getResolvedPublishConfig(packager, { provider: repositoryInfo.type }, arch, false)
      if (resolvedPublishConfig != null) {
        debug(`getPublishConfigsForUpdateInfo: resolve to publish config ${safeStringifyJson(resolvedPublishConfig)}`)
        return [resolvedPublishConfig]
      }
    }
  }
  return publishConfigs
}

async function resolveReleaseBody(packager: Packager): Promise<string | null> {
  const releaseInfo = packager.config.releaseInfo
  if (releaseInfo?.releaseNotes) {
    return releaseInfo.releaseNotes
  }
  if (releaseInfo?.releaseNotesFile) {
    try {
      return await readFile(path.resolve(packager.projectDir, releaseInfo.releaseNotesFile), "utf-8")
    } catch (e: any) {
      log.warn({ file: releaseInfo.releaseNotesFile, error: e.message }, "cannot read release notes file")
      return null
    }
  }
  try {
    return await readFile(path.resolve(packager.projectDir, "release-notes.md"), "utf-8")
  } catch {
    return null
  }
}

export async function createPublisher(
  context: PublishContext,
  version: string,
  publishConfig: PublishConfiguration,
  options: PublishOptions,
  packager: Packager
): Promise<Publisher | null> {
  if (debug.enabled) {
    debug(`Create publisher: ${safeStringifyJson(publishConfig)}`)
  }

  const provider = publishConfig.provider
  switch (provider) {
    case "github": {
      const releaseBody = await resolveReleaseBody(packager)
      const releaseName = packager.config.releaseInfo?.releaseName ?? null
      return new GitHubPublisher(context, publishConfig as GithubOptions, version, options, releaseBody, releaseName)
    }

    case "gitlab": {
      const releaseBody = await resolveReleaseBody(packager)
      const releaseName = packager.config.releaseInfo?.releaseName ?? null
      return new GitlabPublisher(context, publishConfig as GitlabOptions, version, releaseBody, releaseName)
    }

    case "keygen":
      return new KeygenPublisher(context, publishConfig as KeygenOptions, version)

    case "snapStore":
      return new SnapStorePublisher(context, publishConfig as SnapStoreOptions, { cscLink: packager.config.snapcraft?.cscLink, resourcesDir: packager.buildResourcesDir })

    case "generic":
      return null

    default: {
      const clazz = await requireProviderClass(provider, packager)
      return clazz == null ? null : new clazz(context, publishConfig)
    }
  }
}

async function requireProviderClass(provider: string, packager: { buildResourcesDir: string; appInfo: AppInfo }): Promise<any | null> {
  switch (provider) {
    case "github":
      return GitHubPublisher

    case "gitlab":
      return GitlabPublisher

    case "generic":
      return null

    case "keygen":
      return KeygenPublisher

    case "s3":
      return S3Publisher

    case "snapStore":
      return SnapStorePublisher

    case "spaces":
      return SpacesPublisher

    case "bitbucket":
      return BitbucketPublisher

    default: {
      const extensions = ["mjs", "js", "cjs"]
      const template = `electron-publisher-${provider}`
      const name = (ext: string) => `${template}.${ext}`

      const validPublisherFiles = extensions.map(ext => path.join(packager.buildResourcesDir, name(ext)))
      for (const potentialFile of validPublisherFiles) {
        if (await exists(potentialFile)) {
          const module: any = await resolveModule(packager.appInfo.type, potentialFile)
          return module.default || module
        }
      }
      log.error({ path: log.filePath(packager.buildResourcesDir), template, extensionsChecked: extensions }, "unable to find publish provider in build resources")
      throw new InvalidConfigurationError(`Cannot find module for publisher "${provider}" with any extension: ${extensions.join(", ")}`)
    }
  }
}

export function computeDownloadUrl(publishConfiguration: PublishConfiguration, fileName: string | null, packager: PlatformPackager<any>) {
  if (publishConfiguration.provider === "generic") {
    const baseUrlString = (publishConfiguration as GenericServerOptions).url
    if (fileName == null) {
      return baseUrlString
    }

    const baseUrl = parseUrl(baseUrlString)
    const u = new URL(baseUrl?.href ?? baseUrlString)
    u.pathname = path.posix.resolve(u.pathname || "/", encodeURI(fileName))
    return u.href
  }

  let baseUrl
  if (publishConfiguration.provider === "github") {
    const gh = publishConfiguration as GithubOptions
    baseUrl = `${githubUrl(gh)}/${gh.owner}/${gh.repo}/releases/download/${githubTagPrefix(gh)}${packager.appInfo.version}`
  } else {
    baseUrl = getS3LikeProviderBaseUrl(publishConfiguration)
  }

  if (fileName == null) {
    return baseUrl
  }
  return `${baseUrl}/${encodeURI(fileName)}`
}

export async function getPublishConfigs(
  platformPackager: PlatformPackager<any>,
  targetSpecificOptions: PlatformSpecificBuildOptions | Nullish,
  arch: Arch | null,
  errorIfCannot: boolean
): Promise<Array<PublishConfiguration> | null> {
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
    publishers = platformPackager.platformOptions.publish
    if (publishers === null) {
      return null
    }
  }

  if (publishers == null) {
    publishers = platformPackager.config.publish
    if (publishers === null) {
      return null
    }
  }
  return await resolvePublishConfigurations(publishers, platformPackager, arch, errorIfCannot)
}

async function resolvePublishConfigurations(
  publishers: any,
  platformPackager: PlatformPackager<any> | null,
  arch: Arch | null,
  errorIfCannot: boolean,
  fallbackPackager?: Packager
): Promise<Array<PublishConfiguration> | null> {
  if (publishers == null) {
    let serviceName: PublishProvider | null = null
    if (!isEmptyOrSpaces(process.env.GH_TOKEN) || !isEmptyOrSpaces(process.env.GITHUB_TOKEN)) {
      serviceName = "github"
    } else if (!isEmptyOrSpaces(process.env.GITLAB_TOKEN)) {
      serviceName = "gitlab"
    } else if (!isEmptyOrSpaces(process.env.KEYGEN_TOKEN)) {
      serviceName = "keygen"
    } else if (!isEmptyOrSpaces(process.env.BITBUCKET_TOKEN)) {
      serviceName = "bitbucket"
    } else if (!isEmptyOrSpaces(process.env.BT_TOKEN)) {
      throw new Error(
        "Bintray has been sunset and is no longer supported by electron-builder. Ref: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/"
      )
    }

    if (serviceName != null) {
      log.debug(null, `detect ${serviceName} as publish provider`)
      return [(await getResolvedPublishConfig(platformPackager, { provider: serviceName }, arch, errorIfCannot, fallbackPackager))!]
    }
  }

  if (publishers == null) {
    return []
  }

  debug(`Explicit publish provider: ${safeStringifyJson(publishers)}`)
  return (await Promise.all(
    asArray(publishers).map(it => getResolvedPublishConfig(platformPackager, typeof it === "string" ? { provider: it } : it, arch, errorIfCannot, fallbackPackager))
  )) as PublishConfiguration[]
}

function isSuitableWindowsTarget(target: Target) {
  if (target.name === "appx" && target.options != null && (target.options as any).electronUpdaterAware) {
    return true
  }
  return target.name === "nsis" || target.name.startsWith("nsis-")
}

function expandPublishConfig(options: any, platformPackager: PlatformPackager<any> | null, arch: Arch | null): void {
  for (const name of Object.keys(options)) {
    const value = options[name]
    if (typeof value === "string") {
      const archValue = arch == null ? null : Arch[arch]
      const expanded = platformPackager == null ? value : platformPackager.expandMacro(value, archValue)
      if (expanded !== value) {
        options[name] = expanded
      }
    }
  }
}

function isDetectUpdateChannel(platformSpecificConfiguration: PlatformSpecificBuildOptions | null, configuration: Configuration) {
  const value = platformSpecificConfiguration == null ? null : platformSpecificConfiguration.detectUpdateChannel
  return value == null ? configuration.detectUpdateChannel !== false : value
}

async function getResolvedPublishConfig(
  platformPackager: PlatformPackager<any> | null,
  options: PublishConfiguration,
  arch: Arch | null,
  errorIfCannot: boolean,
  fallbackPackager?: Packager
): Promise<PublishConfiguration | GithubOptions | BitbucketOptions | GitlabOptions | null> {
  options = { ...options }
  expandPublishConfig(options, platformPackager, arch)

  const ctx = platformPackager ?? fallbackPackager!
  let channelFromAppVersion: string | null = null
  if ((options as GenericServerOptions).channel == null && isDetectUpdateChannel(platformPackager == null ? null : platformPackager.platformOptions, ctx.config)) {
    channelFromAppVersion = ctx.appInfo.channel
  }

  const provider = options.provider
  if (provider === "generic") {
    const o = options as GenericServerOptions
    if (o.url == null) {
      throw new InvalidConfigurationError(`Please specify "url" for "generic" update server`)
    }

    if (channelFromAppVersion != null) {
      ;(o as any).channel = channelFromAppVersion
    }
    return options
  }

  const providerClass = await requireProviderClass(options.provider, ctx)
  if (providerClass != null && providerClass.checkAndResolveOptions != null) {
    await providerClass.checkAndResolveOptions(options, channelFromAppVersion, errorIfCannot)
    return options
  }

  if (provider === "keygen") {
    return {
      ...options,
      platform: platformPackager?.platform.name,
    } as KeygenOptions
  }

  const isGithub = provider === "github"
  if (!isGithub && provider !== "bitbucket") {
    return options
  }

  let owner = isGithub ? (options as GithubOptions).owner : (options as BitbucketOptions).owner
  let project = isGithub ? (options as GithubOptions).repo : (options as BitbucketOptions).slug

  if (isGithub && owner == null && project != null) {
    const index = project.indexOf("/")
    if (index > 0) {
      const repo = project
      project = repo.substring(0, index)
      owner = repo.substring(index + 1)
    }
  }

  async function getInfo() {
    const info = await ctx.repositoryInfo
    if (info != null) {
      return info
    }

    const message = `Cannot detect repository by .git/config. Please specify "repository" in the package.json (https://docs.npmjs.com/files/package.json#repository).\nPlease see https://electron.build/publish`
    if (errorIfCannot) {
      throw new Error(message)
    } else {
      log.warn(message)
      return null
    }
  }

  if (!owner || !project) {
    log.debug({ reason: "owner or project is not specified explicitly", provider, owner, project }, "calling getInfo")
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
      log.warn('"token" specified in the github publish options. It should be used only for [setFeedURL](module:electron-updater/out/AppUpdater.AppUpdater+setFeedURL).')
    }
    //tslint:disable-next-line:no-object-literal-type-assertion
    return { owner, repo: project, ...options } as GithubOptions
  } else {
    //tslint:disable-next-line:no-object-literal-type-assertion
    return { owner, slug: project, ...options } as BitbucketOptions
  }
}
