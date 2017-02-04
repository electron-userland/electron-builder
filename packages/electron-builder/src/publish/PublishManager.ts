import BluebirdPromise from "bluebird-lst-c"
import { createHash } from "crypto"
import { Platform, Arch } from "electron-builder-core"
import { BintrayOptions, GenericServerOptions, GithubOptions, S3Options, PublishConfiguration, UpdateInfo, VersionInfo } from "electron-builder-http/out/publishOptions"
import { asArray, debug, isEmptyOrSpaces } from "electron-builder-util"
import { log } from "electron-builder-util/out/log"
import { throwError } from "electron-builder-util/out/promise"
import { createReadStream, outputJson, writeFile } from "fs-extra-p"
import isCi from "is-ci"
import { safeDump } from "js-yaml"
import * as path from "path"
import * as url from "url"
import { Macros, PlatformSpecificBuildOptions } from "../metadata"
import { Packager } from "../packager"
import { ArtifactCreated, BuildInfo } from "../packagerApi"
import { PlatformPackager } from "../platformPackager"
import { ArchiveTarget } from "../targets/ArchiveTarget"
import { BintrayPublisher } from "./BintrayPublisher"
import { GitHubPublisher } from "./gitHubPublisher"
import { S3Publisher } from "./s3Publisher"
import { getCiTag, getResolvedPublishConfig, Publisher, PublishOptions } from "./publisher"

export class PublishManager {
  private readonly nameToPublisher = new Map<string, Publisher | null>()

  readonly publishTasks: Array<Promise<any>> = []
  private readonly errors: Array<Error> = []

  private isPublishOptionGuessed = false
  private isPublish = false

  constructor(packager: Packager, private readonly publishOptions: PublishOptions) {
    if (!isPullRequest()) {
      if (publishOptions.publish === undefined) {
        if (process.env.npm_lifecycle_event === "release") {
          publishOptions.publish = "always"
        }
        else {
          const tag = getCiTag()
          if (tag != null) {
            log(`Tag ${tag} is defined, so artifacts will be published`)
            publishOptions.publish = "onTag"
            this.isPublishOptionGuessed = true
          }
          else if (isCi) {
            log("CI detected, so artifacts will be published if draft release exists")
            publishOptions.publish = "onTagOrDraft"
            this.isPublishOptionGuessed = true
          }
        }
      }

      if (publishOptions.publish != null && publishOptions.publish !== "never") {
        this.isPublish = publishOptions.publish !== "onTag" || getCiTag() != null
      }
    }
    else if (publishOptions.publish !== "never") {
      log("Current build is a part of pull request, publishing will be skipped")
    }

    packager.addAfterPackHandler(async event => {
      if (!(event.electronPlatformName == "darwin" || event.packager.platform === Platform.WINDOWS)) {
        return
      }

      const packager = event.packager
      const publishConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, null, false))
      if (publishConfigs == null || publishConfigs.length === 0) {
        return
      }

      let publishConfig = publishConfigs[0]
      if ((<GenericServerOptions>publishConfig).url != null) {
        publishConfig = Object.assign({}, publishConfig, {url: expandPattern((<GenericServerOptions>publishConfig).url, {os: packager.platform.buildConfigurationKey, arch: Arch[Arch.x64]})})
      }
      await writeFile(path.join(packager.getResourcesDir(event.appOutDir), "app-update.yml"), safeDump(publishConfig))
    })

    packager.artifactCreated(event => this.addTask(this.artifactCreated(event)))
  }

  private async artifactCreated(event: ArtifactCreated) {
    const packager = event.packager
    const target = event.target
    const publishConfigs = event.publishConfig == null ? await getPublishConfigs(packager, target == null ? null : (<any>packager.config)[target.name], !this.isPublishOptionGuessed) : [event.publishConfig]

    if (publishConfigs == null) {
      if (this.isPublish) {
        debug(`${event.file} is not published: no publish configs`)
      }
      return
    }

    if (this.isPublish) {
      for (const publishConfig of publishConfigs) {
        const publisher = this.getOrCreatePublisher(publishConfig, packager.info)
        if (publisher != null) {
          if (event.file == null) {
            this.addTask(publisher.uploadData(event.data!, event.artifactName!))
          }
          else {
            this.addTask(publisher.upload(event.file!, event.artifactName))
          }
        }
      }
    }

    if (target != null && event.file != null) {
      if ((packager.platform === Platform.MAC && target.name === "zip") || (packager.platform === Platform.WINDOWS && target.name === "nsis")) {
        this.addTask(writeUpdateInfo(event, publishConfigs))
      }
    }
  }

  private addTask(promise: Promise<any>) {
    this.publishTasks.push(promise
      .catch(it => this.errors.push(it)))
  }

  getOrCreatePublisher(publishConfig: PublishConfiguration, buildInfo: BuildInfo): Publisher | null {
    let publisher = this.nameToPublisher.get(publishConfig.provider)
    if (publisher == null) {
      publisher = createPublisher(buildInfo, publishConfig, this.publishOptions)
      this.nameToPublisher.set(publishConfig.provider, publisher)
    }
    return publisher
  }

  cancelTasks() {
    for (const task of this.publishTasks) {
      if ("cancel" in task) {
        (<any>task).cancel()
      }
    }
  }

  async awaitTasks() {
    if (this.errors.length > 0) {
      this.cancelTasks()
      throwError(this.errors)
      return
    }

    const publishTasks = this.publishTasks
    let list = publishTasks.slice()
    publishTasks.length = 0
    while (list.length > 0) {
      await BluebirdPromise.all(list)
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

async function getPublishConfigsForUpdateInfo(packager: PlatformPackager<any>, publishConfigs: Array<PublishConfiguration> | null): Promise<Array<PublishConfiguration> | null> {
  if (publishConfigs === null) {
    return null
  }

  if (publishConfigs.length === 0) {
    // https://github.com/electron-userland/electron-builder/issues/925#issuecomment-261732378
    // default publish config is github, file should be generated regardless of publish state (user can test installer locally or manage the release process manually)
    const repositoryInfo = await packager.info.repositoryInfo
    if (repositoryInfo != null && repositoryInfo.type === "github") {
      const resolvedPublishConfig = await getResolvedPublishConfig(packager.info, {provider: repositoryInfo.type}, false)
      if (resolvedPublishConfig != null) {
        return [resolvedPublishConfig]
      }
    }
  }
  return publishConfigs
}

async function writeUpdateInfo(event: ArtifactCreated, _publishConfigs: Array<PublishConfiguration>) {
  const packager = event.packager
  const publishConfigs = await getPublishConfigsForUpdateInfo(packager, _publishConfigs)
  if (publishConfigs == null || publishConfigs.length === 0) {
    return
  }
  const outDir = (<ArchiveTarget>event.target).outDir

  for (const publishConfig of publishConfigs) {
    const isGitHub = publishConfig.provider === "github"
    if (!(publishConfig.provider === "generic" || publishConfig.provider === "s3" || isGitHub)) {
      continue
    }

    const version = packager.appInfo.version
    const channel = (<GenericServerOptions>publishConfig).channel || "latest"
    if (packager.platform === Platform.MAC) {
      const updateInfoFile = isGitHub ? path.join(outDir, "github", `${channel}-mac.json`) : path.join(outDir, `${channel}-mac.json`)
      await (<any>outputJson)(updateInfoFile, <VersionInfo>{
        version: version,
        releaseDate: new Date().toISOString(),
        url: computeDownloadUrl(publishConfig, packager.generateName2("zip", "mac", isGitHub), version, {
          os: Platform.MAC.buildConfigurationKey,
          arch: Arch[Arch.x64]
        }),
      }, {spaces: 2})

      packager.info.dispatchArtifactCreated({
        file: updateInfoFile,
        packager: packager,
        target: null,
        publishConfig: publishConfig,
      })
    }
    else {
      const githubArtifactName = `${packager.appInfo.name}-Setup-${version}.exe`
      const sha2 = await sha256(event.file!)
      const updateInfoFile = path.join(outDir, `${channel}.yml`)
      await writeFile(updateInfoFile, safeDump(<UpdateInfo>{
        version: version,
        releaseDate: new Date().toISOString(),
        githubArtifactName: githubArtifactName,
        path: path.basename(event.file!),
        sha2: sha2,
      }))

      const githubPublishConfig = publishConfigs.find(it => it.provider === "github")
      if (githubPublishConfig != null) {
        // to preserve compatibility with old electron-updater (< 0.10.0), we upload file with path specific for GitHub
        packager.info.dispatchArtifactCreated({
          data: new Buffer(safeDump(<UpdateInfo>{
            version: version,
            path: githubArtifactName,
            sha2: sha2,
          })),
          artifactName: `${channel}.yml`,
          packager: packager,
          target: null,
          publishConfig: githubPublishConfig,
        })
      }

      const genericPublishConfig = publishConfigs.find(it => it.provider === "generic" ||  it.provider === "s3")
      if (genericPublishConfig != null) {
        packager.info.dispatchArtifactCreated({
          file: updateInfoFile,
          packager: packager,
          target: null,
          publishConfig: genericPublishConfig,
        })
      }
      break
    }
  }
}

function createPublisher(buildInfo: BuildInfo, publishConfig: PublishConfiguration, options: PublishOptions): Publisher | null {
  const version = buildInfo.metadata.version!
  if (publishConfig.provider === "github") {
    const githubInfo: GithubOptions = publishConfig
    log(`Creating Github Publisher — owner: ${githubInfo.owner}, project: ${githubInfo.repo}, version: ${version}`)
    return new GitHubPublisher(githubInfo, version, options)
  }
  if (publishConfig.provider === "bintray") {
    const bintrayInfo: BintrayOptions = publishConfig
    log(`Creating Bintray Publisher — user: ${bintrayInfo.user || bintrayInfo.owner}, owner: ${bintrayInfo.owner},  package: ${bintrayInfo.package}, repository: ${bintrayInfo.repo}, version: ${version}`)
    return new BintrayPublisher(bintrayInfo, version, options)
  }
  if (publishConfig.provider === "s3") {
    const s3Info: S3Options = publishConfig
    log(`Creating S3 Publisher — bucket: ${s3Info.bucket}, version: ${version}`)
    return new S3Publisher(s3Info)
  }
  return null
}

function computeDownloadUrl(publishConfig: PublishConfiguration, fileName: string, version: string, macros: Macros) {
  if (publishConfig.provider === "generic") {
    const baseUrl = url.parse(expandPattern((<GenericServerOptions>publishConfig).url, macros))
    return url.format(Object.assign({}, baseUrl, {pathname: path.posix.resolve(baseUrl.pathname || "/", encodeURI(fileName))}))
  }
  else if (publishConfig.provider === "s3") {
    const bucket = (<S3Options>publishConfig).bucket
    return `https://s3.amazonaws.com/${bucket}/${fileName}`
  }
  else {
    const gh = <GithubOptions>publishConfig
    return `https://github.com${`/${gh.owner}/${gh.repo}/releases`}/download/v${version}/${encodeURI(fileName)}`
  }
}

function expandPattern(pattern: string, macros: Macros): string {
  return pattern
    .replace(/\$\{os}/g, macros.os)
    .replace(/\$\{arch}/g, macros.arch)
}

export function getPublishConfigs(packager: PlatformPackager<any>, targetSpecificOptions: PlatformSpecificBuildOptions | null | undefined, errorIfCannot: boolean): Promise<Array<PublishConfiguration>> | null {
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

    if (publishers == null && !isEmptyOrSpaces(process.env.GH_TOKEN)) {
      publishers = [{provider: "github"}]
    }
    // if both tokens are set — still publish to github (because default publisher is github)
    if (publishers == null && !isEmptyOrSpaces(process.env.BT_TOKEN)) {
      publishers = [{provider: "bintray"}]
    }
    // if both tokens are set — still publish to github (because default publisher is github)
    if (publishers == null && !isEmptyOrSpaces(process.env.S3_TOKEN) && !isEmptyOrSpaces(process.env.S3_SECRET)) {
      publishers = [{provider: "s3"}]
    }
  }

  return BluebirdPromise.map(asArray(publishers), it => getResolvedPublishConfig(packager.info, typeof it === "string" ? {provider: it} : it, errorIfCannot))
}

function sha256(file: string) {
  return new BluebirdPromise<string>((resolve, reject) => {
    const hash = createHash("sha256")
    hash
      .on("error", reject)
      .setEncoding("hex")

    createReadStream(file)
      .on("error", reject)
      .on("end", () => {
        hash.end()
        resolve(<string>hash.read())
      })
      .pipe(hash, {end: false})
  })
}

function isPullRequest() {
  // TRAVIS_PULL_REQUEST is set to the pull request number if the current job is a pull request build, or false if it’s not.
  function isSet(value: string) {
    return value != null && value !== "false"
  }

  return isSet(process.env.TRAVIS_PULL_REQUEST) || isSet(process.env.CI_PULL_REQUEST) || isSet(process.env.CI_PULL_REQUESTS)
}
