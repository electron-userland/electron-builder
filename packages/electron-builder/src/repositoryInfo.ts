import { fromUrl as parseRepositoryUrl, Info } from "hosted-git-info"
import { readFile } from "fs-extra-p"
import { AppMetadata, Metadata, RepositoryInfo } from "./metadata"
import * as path from "path"

export interface RepositorySlug {
  user: string
  project: string
}

export function getRepositoryInfo(metadata?: AppMetadata, devMetadata?: Metadata): Promise<Info | null> {
  return _getInfo(<RepositoryInfo>(devMetadata == null ? null : devMetadata.repository) || (metadata == null ? null : metadata.repository))
}

async function getGitUrlFromGitConfig(): Promise<string | null> {
  let data: string | null = null
  try {
    data = await readFile(path.join(".git", "config"), "utf8")
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

async function _getInfo(repo?: RepositoryInfo | null): Promise<RepositorySlug | null> {
  if (repo != null) {
    return parseRepositoryUrl(typeof repo === "string" ? repo : repo.url)
  }

  let url = process.env.TRAVIS_REPO_SLUG
  if (url == null) {
    const user: string | null = process.env.APPVEYOR_ACCOUNT_NAME || process.env.CIRCLE_PROJECT_USERNAME
    const project: string | null = process.env.APPVEYOR_PROJECT_NAME || process.env.CIRCLE_PROJECT_REPONAME
    if (user != null && project != null) {
      return {
        user: user,
        project: project,
      }
    }

    url = await getGitUrlFromGitConfig()
  }

  return url == null ? null : parseRepositoryUrl(url)
}