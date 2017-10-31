import { CancellationToken, GithubOptions, githubUrl, HttpError, HttpExecutor, parseXml, ReleaseNoteInfo, UpdateInfo, XElement } from "builder-util-runtime"
import * as semver from "semver"
import { URL } from "url"
import { AppUpdater } from "./AppUpdater"
import { FileInfo, getChannelFilename, getDefaultChannelName, isUseOldMacProvider, newBaseUrl, newUrlFromBase, Provider } from "./main"
import { getUpdateFile, parseUpdateInfo } from "./Provider"

export abstract class BaseGitHubProvider<T extends UpdateInfo> extends Provider<T> {
  // so, we don't need to parse port (because node http doesn't support host as url does)
  protected readonly baseUrl: URL

  constructor(protected readonly options: GithubOptions, defaultHost: string, executor: HttpExecutor<any>) {
    super(executor)

    this.baseUrl = newBaseUrl(githubUrl(options, defaultHost))
  }

  protected computeGithubBasePath(result: string) {
    // https://github.com/electron-userland/electron-builder/issues/1903#issuecomment-320881211
    const host = this.options.host
    return host != null && host !== "github.com" && host !== "api.github.com" ? `/api/v3${result}` : result
  }
}

export class GitHubProvider extends BaseGitHubProvider<UpdateInfo> {
  constructor(protected readonly options: GithubOptions, private readonly updater: AppUpdater, executor: HttpExecutor<any>) {
    super(options, "github.com", executor)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const basePath = this.basePath
    const cancellationToken = new CancellationToken()

    const feedXml: string = (await this.httpRequest(newUrlFromBase(`${basePath}.atom`, this.baseUrl), {
      Accept: "application/xml, application/atom+xml, text/xml, */*",
    }, cancellationToken))!

    const feed = parseXml(feedXml)
    const latestRelease = feed.element("entry", false, `No published versions on GitHub`)
    let version: string | null
    try {
      if (this.updater.allowPrerelease) {
        version = latestRelease.element("link").attribute("href").match(/\/tag\/v?([^\/]+)$/)!![1]
      }
      else {
        version = await this.getLatestVersionString(basePath, cancellationToken)
      }
    }
    catch (e) {
      throw new Error(`Cannot parse releases feed: ${e.stack || e.message},\nXML:\n${feedXml}`)
    }

    if (version == null) {
      throw new Error(`No published versions on GitHub`)
    }

    const channelFile = getChannelFilename(getDefaultChannelName())
    const channelFileUrl = newUrlFromBase(this.getBaseDownloadPath(version, channelFile), this.baseUrl)
    const requestOptions = this.createRequestOptions(channelFileUrl)
    let rawData: string
    try {
      rawData = (await this.executor.request(requestOptions, cancellationToken))!!
    }
    catch (e) {
      if (!this.updater.allowPrerelease && e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`Cannot find ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}`)
      }
      throw e
    }

    const result = parseUpdateInfo(rawData, channelFile, channelFileUrl)
    if (isUseOldMacProvider()) {
      (result as any).releaseJsonUrl = `${githubUrl(this.options)}/${requestOptions.path}`
    }

    if (result.releaseName == null) {
      result.releaseName = latestRelease.elementValueOrEmpty("title")
    }

    if (result.releaseNotes == null) {
      result.releaseNotes = computeReleaseNotes(this.updater.currentVersion, this.updater.fullChangelog, feed, latestRelease)
    }
    return result
  }

  private async getLatestVersionString(basePath: string, cancellationToken: CancellationToken): Promise<string | null> {
    const url = newUrlFromBase(`${basePath}/latest`, this.baseUrl)
    try {
      // do not use API to avoid limit
      const rawData = await this.httpRequest(url, {Accept: "application/json"}, cancellationToken)
      if (rawData == null) {
        return null
      }

      const releaseInfo: GithubReleaseInfo = JSON.parse(rawData)
      return (releaseInfo.tag_name.startsWith("v")) ? releaseInfo.tag_name.substring(1) : releaseInfo.tag_name
    }
    catch (e) {
      throw new Error(`Unable to find latest version on GitHub (${url}), please ensure a production release exists: ${e.stack || e.message}`)
    }
  }

  private get basePath() {
    return this.computeGithubBasePath(`/${this.options.owner}/${this.options.repo}/releases`)
  }

  async getUpdateFile(updateInfo: UpdateInfo): Promise<FileInfo> {
    return getUpdateFile(updateInfo, this.baseUrl, p => this.getBaseDownloadPath(updateInfo.version, p))
  }

  private getBaseDownloadPath(version: string, fileName: string) {
    return `${this.basePath}/download/${this.options.vPrefixedTagName === false ? "" : "v"}${version}/${fileName}`
  }
}

interface GithubReleaseInfo {
  readonly tag_name: string
}

function getNoteValue(parent: XElement): string {
  const result = parent.elementValueOrEmpty("content")
  // GitHub reports empty notes as <content>No content.</content>
  return result === "No content." ? "" : result
}

export function computeReleaseNotes(currentVersion: string, isFullChangelog: boolean, feed: XElement, latestRelease: any) {
  if (!isFullChangelog) {
    return getNoteValue(latestRelease)
  }

  const releaseNotes: Array<ReleaseNoteInfo> = []
  for (const release of feed.getElements("entry")) {
    const versionRelease = release.element("link").attribute("href").match(/\/tag\/v?([^\/]+)$/)![1]
    if (semver.lt(currentVersion, versionRelease)) {
      releaseNotes.push({
        version: versionRelease,
        note: getNoteValue(release)
      })
    }
  }
  return releaseNotes
    .sort((a, b) => semver.rcompare(a.version, b.version))
}
