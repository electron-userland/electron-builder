import { BintrayOptions, GenericServerOptions, GithubOptions, PublishConfiguration, S3Options } from "electron-builder-http/out/publishOptions"
import { warn } from "electron-builder-util/out/log"
import { BuildInfo } from "../packagerApi"

export async function getResolvedPublishConfig(packager: BuildInfo, publishConfig: PublishConfiguration, errorIfCannot: boolean = true): Promise<PublishConfiguration | null> {
  const provider = publishConfig.provider
  if (provider === "generic") {
    if ((<GenericServerOptions>publishConfig).url == null) {
      throw new Error(`Please specify "url" for "generic" update server`)
    }
    return publishConfig
  }

  if (provider === "s3") {
    if ((<S3Options>publishConfig).bucket == null) {
      throw new Error(`Please specify "bucket" for "s3" update server`)
    }
    return publishConfig
  }

  async function getInfo() {
    const info = await packager.repositoryInfo
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

  let owner = publishConfig.owner
  let project = provider === "github" ? (<GithubOptions>publishConfig).repo : (<BintrayOptions>publishConfig).package

  if (provider === "github" && owner == null && project != null) {
    const index = project.indexOf("/")
    if (index > 0) {
      const repo = project
      project = repo.substring(0, index)
      owner = repo.substring(index + 1)
    }
  }

  if (!owner || !project) {
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

  if (provider === "github") {
    return Object.assign({owner, repo: project}, publishConfig)
  }
  else if (provider === "bintray") {
    return Object.assign({owner, package: project}, publishConfig)
  }
  else {
    throw new Error(`Unknown publish provider: ${provider}`)
  }
}

export function getCiTag() {
  const tag = process.env.TRAVIS_TAG || process.env.APPVEYOR_REPO_TAG_NAME || process.env.CIRCLE_TAG || process.env.CI_BUILD_TAG
  return tag != null && tag.length > 0 ? tag : null
}