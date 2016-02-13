import { Packager } from "./packager"
import { PackagerOptions } from "./platformPackager"
import { PublishOptions, Publisher, GitHubPublisher } from "./gitHubPublisher"
import { executeFinally } from "./promise"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"
import { InfoRetriever } from "./repositoryInfo"
import { log } from "./util"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

export async function createPublisher(packager: Packager, options: BuildOptions, repoSlug: InfoRetriever, isPublishOptionGuessed: boolean = false): Promise<Publisher> {
  const info = await repoSlug.getInfo(packager)
  if (info == null) {
    if (isPublishOptionGuessed) {
      return null
    }

    log("Cannot detect repository by .git/config")
    throw new Error("Please specify 'repository' in the dev package.json ('" + packager.devPackageFile + "')")
  }
  else {
    return new GitHubPublisher(info.user, info.project, packager.metadata.version, options.githubToken, options.publish !== "onTagOrDraft")
  }
}

export interface BuildOptions extends PackagerOptions, PublishOptions {
}

export function build(options: BuildOptions = {}): Promise<any> {
  if (options.cscLink == null) {
    options.cscLink = process.env.CSC_LINK
  }
  if (options.cscKeyPassword == null) {
    options.cscKeyPassword = process.env.CSC_KEY_PASSWORD
  }

  if (options.githubToken == null) {
    options.githubToken = process.env.GH_TOKEN || process.env.GH_TEST_TOKEN
  }

  const lifecycleEvent = process.env.npm_lifecycle_event
  if (options.dist === undefined) {
    options.dist = lifecycleEvent === "dist" || lifecycleEvent === "build"
  }

  if (options.publish) {
    options.dist = true
  }

  let isPublishOptionGuessed = false
  if (options.publish === undefined) {
    if (lifecycleEvent === "release") {
      options.publish = "always"
    }
    else {
      const tag = process.env.TRAVIS_TAG || process.env.APPVEYOR_REPO_TAG_NAME || process.env.CIRCLE_TAG
      if (tag != null && tag.length !== 0) {
        log("Tag %s is defined, so artifacts will be published", tag)
        options.publish = "onTag"
        isPublishOptionGuessed = true
      }
      else if ((process.env.TRAVIS || process.env.APPVEYOR || process.env.CIRCLECI || "").toLowerCase() === "true") {
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
    let publisher: BluebirdPromise<Publisher> = null
    packager.artifactCreated(path => {
      if (publisher == null) {
        publisher = <BluebirdPromise<Publisher>>createPublisher(packager, options, repositoryInfo, isPublishOptionGuessed)
      }

      if (publisher != null) {
        publisher.then(it => publishTasks.push(<BluebirdPromise<any>>it.upload(path)))
      }
    })
  }
  return executeFinally(packager.build(), error => {
    if (error == null) {
      return Promise.all(publishTasks)
    }
    else {
      for (let task of publishTasks) {
        task.cancel()
      }
      return null
    }
  })
}