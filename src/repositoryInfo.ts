import { fromUrl as parseRepositoryUrl, Info } from "hosted-git-info"
import { readText } from "./promisifed-fs"
import { AppMetadata, Metadata } from "./metadata"
import * as path from "path"

const __awaiter = require("./awaiter")
Array.isArray(__awaiter)

export interface ProjectMetadataProvider {
  metadata: AppMetadata
  devMetadata: Metadata
}

export interface RepositorySlug {
  user: string
  project: string
}

export class InfoRetriever {
  _info: Promise<Info>

  getInfo(provider?: ProjectMetadataProvider): Promise<Info> {
    if (this._info == null) {
      this._info = getInfo(provider)
    }
    return this._info
  }
}

async function getGitUrlFromGitConfig(): Promise<string> {
  let data: string = null
  try {
    data = await readText(path.join(".git", "config"))
  }
  catch (e) {
    if (e.code === "ENOENT") {
      return null
    }

    throw e
  }

  const conf = data.split(/\r?\n/)
  const i = conf.indexOf('[remote "origin"]')
  if (i !== -1) {
    let u = conf[i + 1]
    if (!u.match(/^\s*url =/)) {
      u = conf[i + 2]
    }

    if (u.match(/^\s*url =/)) {
      return u.replace(/^\s*url = /, "")
    }
  }
  return null
}

async function getInfo(provider?: ProjectMetadataProvider): Promise<RepositorySlug> {
  const repo = provider == null ? null : (provider.devMetadata.repository || provider.metadata.repository)
  if (repo == null) {
    let url = process.env.TRAVIS_REPO_SLUG
    if (url == null) {
      const user: string = process.env.APPVEYOR_ACCOUNT_NAME || process.env.CIRCLE_PROJECT_USERNAME
      const project: string = process.env.APPVEYOR_PROJECT_NAME || process.env.CIRCLE_PROJECT_REPONAME
      if (user != null && project != null) {
        return {
          user: user,
          project: project,
        }
      }

      url = await getGitUrlFromGitConfig()
    }

    if (url != null) {
      return parseRepositoryUrl(url)
    }
  }
  else {
    return parseRepositoryUrl(typeof repo === "string" ? repo : repo.url)
  }
  return null
}