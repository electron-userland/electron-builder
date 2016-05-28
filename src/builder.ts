import { Packager, normalizePlatforms } from "./packager"
import { PackagerOptions } from "./platformPackager"
import { PublishOptions, Publisher, GitHubPublisher } from "./gitHubPublisher"
import { executeFinally } from "./promise"
import { Promise as BluebirdPromise } from "bluebird"
import { InfoRetriever } from "./repositoryInfo"
import { log } from "./util"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export async function createPublisher(packager: Packager, options: BuildOptions, repoSlug: InfoRetriever, isPublishOptionGuessed: boolean = false): Promise<Publisher | null> {
  const info = await repoSlug.getInfo(packager)
  if (info == null) {
    if (isPublishOptionGuessed) {
      return null
    }

    log("Cannot detect repository by .git/config")
    throw new Error("Please specify 'repository' in the dev package.json ('" + packager.devPackageFile + "')")
  }
  else {
    return new GitHubPublisher(info.user, info.project, packager.metadata.version, options.githubToken!, options.publish !== "onTagOrDraft")
  }
}

export interface BuildOptions extends PackagerOptions, PublishOptions {
}

export async function build(originalOptions?: BuildOptions): Promise<void> {
  const options: BuildOptions = Object.assign({
    cscLink: process.env.CSC_LINK,
    cscKeyPassword: process.env.CSC_KEY_PASSWORD,
    githubToken: process.env.GH_TOKEN || process.env.GH_TEST_TOKEN,
  }, originalOptions)

  options.platform = normalizePlatforms(options.platform)

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
