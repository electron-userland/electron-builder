import { orNullIfFileNotExist } from "electron-builder-util/out/promise"
import { readFile } from "fs-extra-p"
import { fromUrl as parseRepositoryUrl } from "hosted-git-info"
import * as path from "path"
import { SourceRepositoryInfo } from "../core"
import { Metadata, RepositoryInfo } from "../metadata"

export function getRepositoryInfo(projectDir: string, metadata?: Metadata, devMetadata?: Metadata): Promise<SourceRepositoryInfo | null> {
  return _getInfo(projectDir, (devMetadata == null ? null : devMetadata.repository) || (metadata == null ? null : metadata.repository))
}

async function getGitUrlFromGitConfig(projectDir: string): Promise<string | null> {
  const data = await orNullIfFileNotExist(readFile(path.join(projectDir, ".git", "config"), "utf8"))
  if (data == null) {
    return null
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

async function _getInfo(projectDir: string, repo?: RepositoryInfo | string | null): Promise<SourceRepositoryInfo | null> {
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

    url = await getGitUrlFromGitConfig(projectDir)
  }

  return url == null ? null : parseRepositoryUrl(url)
}