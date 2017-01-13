import { Packager } from "../packager"
import { getPublishConfigs, PlatformPackager } from "../platformPackager"
import { debug, isEmptyOrSpaces } from "electron-builder-util"
import { Publisher, PublishOptions, getResolvedPublishConfig } from "./publisher"
import BluebirdPromise from "bluebird-lst-c"
import { GitHubPublisher } from "./gitHubPublisher"
import { PublishConfiguration, GithubOptions, BintrayOptions, GenericServerOptions, VersionInfo } from "electron-builder-http/out/publishOptions"
import { log } from "electron-builder-util/out/log"
import { BintrayPublisher } from "./BintrayPublisher"
import { BuildInfo, ArtifactCreated } from "../packagerApi"
import { Platform } from "electron-builder-core"
import { safeDump } from "js-yaml"
import { writeFile, writeJson } from "fs-extra-p"
import * as path from "path"
import { ArchiveTarget } from "../targets/ArchiveTarget"
import { throwError } from "electron-builder-util/out/promise"
import isCi from "is-ci"
import * as url from "url"

export class PublishManager {
  private readonly nameToPublisher = new Map<string, Promise<Publisher>>()

  readonly publishTasks: Array<Promise<any>> = []
  private readonly errors: Array<Error> = []

  private isPublishOptionGuessed = false

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

    let isPublish = false
    if (publishOptions.publish != null && publishOptions.publish !== "never") {
      // todo if token set as option
      if (isAuthTokenSet()) {
        isPublish = true
      }
      else if (isCi) {
        log(`CI detected, publish is set to ${publishOptions.publish}, but neither GH_TOKEN nor BT_TOKEN is not set, so artifacts will be not published`)
      }
    }

    packager.addAfterPackHandler(async event => {
      if (event.electronPlatformName != "darwin") {
        return
      }

      const packager = event.packager
      const publishConfigs = await getPublishConfigsForUpdateInfo(packager, getPublishConfigs(packager, null))
      if (publishConfigs == null || publishConfigs.length === 0) {
        return
      }

      await writeFile(path.join(packager.getMacOsResourcesDir(event.appOutDir), "app-update.yml"), safeDump(publishConfigs[0]))
    })

    packager.artifactCreated(event => {
      const packager = event.packager
      const target = event.target
      const publishConfigs = event.publishConfig == null ? getPublishConfigs(packager, target == null ? null : (<any>packager.config)[target.name]) : [event.publishConfig]

      if (isPublish) {
        if (publishConfigs == null) {
          debug(`${event.file} is not published: no publish configs`)
          return
        }

        for (const publishConfig of publishConfigs) {
          const publisher = this.getOrCreatePublisher(publishConfig, packager.info)
          if (publisher != null) {
            this.addTask(publisher
              .then(it => {
                if (it == null) {
                  return null
                }

                if (event.file == null) {
                  return it.uploadData(event.data!, event.artifactName!)
                }
                else {
                  return it.upload(event.file!, event.artifactName)
                }
              }))
          }
        }
      }

      if (publishConfigs != null && packager.platform === Platform.MAC && target != null && target.name === "zip") {
        this.addTask(writeUpdateInfo(event, publishConfigs))
      }
    })
  }

  private addTask(promise: Promise<any>) {
    this.publishTasks.push(promise
      .catch(it => this.errors.push(it)))
  }

  getOrCreatePublisher(publishConfig: PublishConfiguration, buildInfo: BuildInfo): Promise<Publisher | null> {
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

  await writeMac(packager, (<ArchiveTarget>event.target).outDir, publishConfigs)
}

async function writeMac(packager: PlatformPackager<any>, outDir: string, publishConfigs: Array<PublishConfiguration>) {
  for (const publishConfig of publishConfigs) {
    if (!(publishConfig.provider === "generic" || publishConfig.provider === "github")) {
      continue
    }

    const channel = (<GenericServerOptions>publishConfig).channel || "latest"
    const updateInfoFile = path.join(outDir, `${channel}-mac.json`)

    await writeJson(updateInfoFile, <VersionInfo>{
      version: packager.appInfo.version,
      url: computeDownloadUrl(publishConfig, packager.generateName2("zip", "mac", true), packager.appInfo.version)
    }, {spaces: 2})

    packager.info.dispatchArtifactCreated({
      file: updateInfoFile,
      packager: packager,
      target: null,
    })

    break
  }
}

// visible only for tests
// call only from this file or from tests
export async function createPublisher(buildInfo: BuildInfo, publishConfig: PublishConfiguration, options: PublishOptions, isPublishOptionGuessed: boolean = false): Promise<Publisher | null> {
  const config = await getResolvedPublishConfig(buildInfo, publishConfig, isPublishOptionGuessed)
  if (config == null) {
    return null
  }

  const version = buildInfo.metadata.version!
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