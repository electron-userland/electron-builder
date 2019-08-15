import { orNullIfFileNotExist } from "builder-util/out/promise"
import { readFile } from "fs-extra"
import { fromUrl, Info } from "hosted-git-info"
import * as path from "path"
import { SourceRepositoryInfo } from "../core"
import { Metadata, RepositoryInfo } from ".."

export function getRepositoryInfo(projectDir: string, metadata?: Metadata, devMetadata?: Metadata | null): Promise<SourceRepositoryInfo | null> {
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

  const slug = process.env.TRAVIS_REPO_SLUG || process.env.APPVEYOR_REPO_NAME
  if (slug != null) {
    const splitted = slug.split("/")
    return {
      user: splitted[0],
      project: splitted[1],
    }
  }

  const user = process.env.CIRCLE_PROJECT_USERNAME
  const project = process.env.CIRCLE_PROJECT_REPONAME
  if (user != null && project != null) {
    return {
      user,
      project,
    }
  }

  const url = await getGitUrlFromGitConfig(projectDir)
  return url == null ? null : parseRepositoryUrl(url)
}

function parseRepositoryUrl(url: string): Info {
  const info: any = fromUrl(url)
  if (info != null) {
    delete info.protocols
    delete info.treepath
    delete info.filetemplate
    delete info.bugstemplate
    delete info.gittemplate
    delete info.tarballtemplate
    delete info.sshtemplate
    delete info.sshurltemplate
    delete info.browsetemplate
    delete info.docstemplate
    delete info.httpstemplate
    delete info.shortcuttemplate
    delete info.pathtemplate
    delete info.pathmatch
    delete info.protocols_re
    delete info.committish
    delete info.default
    delete info.opts
    delete info.browsefiletemplate
    delete info.auth
  }
  return info
}