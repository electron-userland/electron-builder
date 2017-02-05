import { BuildInfo } from "../packagerApi"
import { PublishConfiguration, GithubOptions, S3Options, BintrayOptions, GenericServerOptions } from "electron-builder-http/out/publishOptions"

export async function getResolvedPublishConfig(packager: BuildInfo, publishConfig: PublishConfiguration, errorIfCannot: boolean): Promise<PublishConfiguration | null> {
  if (publishConfig.provider === "generic") {
    if ((<GenericServerOptions>publishConfig).url == null) {
      throw new Error(`Please specify "url" for "generic" update server`)
    }
    return publishConfig
  }

  if (publishConfig.provider === "s3") {
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

    if (!errorIfCannot) {
      return null
    }

    throw new Error(`Cannot detect repository by .git/config. Please specify "repository" in the package.json (https://docs.npmjs.com/files/package.json#repository).\nPlease see https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts`)
  }

  let owner = publishConfig.owner
  let project = publishConfig.provider === "github" ? (<GithubOptions>publishConfig).repo : (<BintrayOptions>publishConfig).package
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

  const copy: PublishConfiguration = Object.assign({}, publishConfig)
  if (copy.owner == null) {
    copy.owner = owner
  }

  if (publishConfig.provider === "github") {
    const options = <GithubOptions>copy
    if (options.repo == null) {
      options.repo = project
    }
    return options
  }
  else if (publishConfig.provider === "bintray") {
    const options = <BintrayOptions>copy
    if (options.package == null) {
      options.package = project
    }
    return options
  }
  else {
    return null
  }
}

export function getCiTag() {
  const tag = process.env.TRAVIS_TAG || process.env.APPVEYOR_REPO_TAG_NAME || process.env.CIRCLE_TAG || process.env.CI_BUILD_TAG
  return tag != null && tag.length > 0 ? tag : null
}