import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { debug, isEmptyOrSpaces, asArray} from "electron-builder-util"
import { Publisher, PublishOptions, getResolvedPublishConfig } from "./publisher"
import BluebirdPromise from "bluebird-lst-c"
import { GitHubPublisher } from "./gitHubPublisher"
import { PublishConfiguration, GithubOptions, BintrayOptions, GenericServerOptions, VersionInfo, UpdateInfo } from "electron-builder-http/out/publishOptions"
import { log } from "electron-builder-util/out/log"
import { BintrayPublisher } from "./BintrayPublisher"
import { BuildInfo, ArtifactCreated } from "../packagerApi"
import { Platform } from "electron-builder-core"
import { safeDump } from "js-yaml"
import { writeFile, outputJson, createReadStream } from "fs-extra-p"
import * as path from "path"
import { ArchiveTarget } from "../targets/ArchiveTarget"
import { throwError } from "electron-builder-util/out/promise"
import isCi from "is-ci"
import * as url from "url"
import { PlatformSpecificBuildOptions } from "../metadata"
import { createHash } from "crypto"

export class PublishManager {
  private readonly nameToPublisher = new Map<string, Publisher | null>()

  readonly publishTasks: Array<Promise<any>> = []
  private readonly errors: Array<Error> = []

  private isPublishOptionGuessed = false
  private isPublish = false

  constructor(packager: Packager, private readonly publishOptions: PublishOptions) {
    if (publishOptions.publish === undefined) {
      if (process.env.npm_lifecycle_event === "release") {
        publishOptions.publish = "always"
      }
      else if (isAuthTokenSet() ) {
        const tag = process.env.TRAVIS_TAG || process.env.APPVEYOR_REPO_TAG_NAME || process.env.CIRCLE_TAG
        if (!isEmptyOrSpaces(tag)) {
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
      // todo if token set as option
      if (isAuthTokenSet()) {
        this.isPublish = true
      }
      else if (isCi) {
        log(`CI detected, publish is set to ${publishOptions.publish}, but neither GH_TOKEN nor BT_TOKEN is not set, so artifacts will be not published`)
      }
    }

    packager.addAfterPackHandler(async event => {
      if (!(event.electronPlatformName == "darwin" || event.packager.platform === Platform.WINDOWS)) {
        return
      }

      const packager = event.packager
      const publishConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, null))
      if (publishConfigs == null || publishConfigs.length === 0) {
        return
      }

      await writeFile(path.join(packager.getResourcesDir(event.appOutDir), "app-update.yml"), safeDump(publishConfigs[0]))
    })

    packager.artifactCreated(event => this.addTask(this.artifactCreated(event)))
  }

  private async artifactCreated(event: ArtifactCreated) {
    const packager = event.packager
    const target = event.target
    const publishConfigs = event.publishConfig == null ? await getPublishConfigs(packager, target == null ? null : (<any>packager.config)[target.name]) : [event.publishConfig]

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
      publisher = createPublisher(buildInfo, publishConfig, this.publishOptions, this.isPublishOptionGuessed)
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
    if (!(publishConfig.provider === "generic" || isGitHub)) {
      continue
    }

    const version = packager.appInfo.version
    const channel = (<GenericServerOptions>publishConfig).channel || "latest"
    if (packager.platform === Platform.MAC) {
      const updateInfoFile = isGitHub ? path.join(outDir, "github", `${channel}-mac.json`) : path.join(outDir, `${channel}-mac.json`)
      await (<any>outputJson)(updateInfoFile, <VersionInfo>{
        version: version,
        url: computeDownloadUrl(publishConfig, packager.generateName2("zip", "mac", isGitHub), version)
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
        githubArtifactName: githubArtifactName,
        path: path.basename(event.file!),
        sha2: sha2,
      }))

      const githubPublishConfig = publishConfigs.find(it => it.provider === "github")
      if (githubPublishConfig != null) {
        // to preserve compatibility with old electron-auto-updater (< 0.10.0), we upload file with path specific for GitHub
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

      const genericPublishConfig = publishConfigs.find(it => it.provider === "generic")
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

function createPublisher(buildInfo: BuildInfo, publishConfig: PublishConfiguration, options: PublishOptions, isPublishOptionGuessed: boolean = false): Publisher | null {
  const version = buildInfo.metadata.version!
  if (publishConfig.provider === "github") {
    const githubInfo: GithubOptions = publishConfig
    log(`Creating Github Publisher — owner: ${githubInfo.owner}, project: ${githubInfo.repo}, version: ${version}`)
    return new GitHubPublisher(githubInfo, version, options, isPublishOptionGuessed)
  }
  if (publishConfig.provider === "bintray") {
    const bintrayInfo: BintrayOptions = publishConfig
    log(`Creating Bintray Publisher — user: ${bintrayInfo.user || bintrayInfo.owner}, owner: ${bintrayInfo.owner},  package: ${bintrayInfo.package}, repository: ${bintrayInfo.repo}, version: ${version}`)
    return new BintrayPublisher(bintrayInfo, version, options)
  }
  return null
}

function isAuthTokenSet() {
  return !isEmptyOrSpaces(process.env.GH_TOKEN) || !isEmptyOrSpaces(process.env.BT_TOKEN)
}

function computeDownloadUrl(publishConfig: PublishConfiguration, fileName: string, version: string) {
  if (publishConfig.provider === "generic") {
    const baseUrl = url.parse((<GenericServerOptions>publishConfig).url)
    return url.format(Object.assign({}, baseUrl, {pathname: path.posix.resolve(baseUrl.pathname || "/", fileName)}))
  }
  else {
    const gh = <GithubOptions>publishConfig
    return `https://github.com${`/${gh.owner}/${gh.repo}/releases`}/download/v${version}/${fileName}`
  }
}

export function getPublishConfigs(packager: PlatformPackager<any>, targetSpecificOptions: PlatformSpecificBuildOptions | null | undefined): Promise<Array<PublishConfiguration>> | null {
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
    // triple equals - if explicitly set to null
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
  }

  //await getResolvedPublishConfig(packager.info, {provider: repositoryInfo.type}, false)
  return BluebirdPromise.map(asArray(publishers), it => typeof it === "string" ? getResolvedPublishConfig(packager.info, {provider: <any>it}, true) : it)
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