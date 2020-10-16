import { CancellationToken, GithubOptions, githubUrl, HttpError, newError, parseXml, ReleaseNoteInfo, UpdateInfo, XElement } from "builder-util-runtime"
import * as semver from "semver"
import { URL } from "url"
import { AppUpdater } from "../AppUpdater"
import { getChannelFilename, newBaseUrl, newUrlFromBase, Provider, ResolvedUpdateFileInfo } from "../main"
import { parseUpdateInfo, ProviderRuntimeOptions, resolveFiles } from "./Provider"

const hrefRegExp = /\/tag\/v?([^/]+)$/

export abstract class BaseGitHubProvider<T extends UpdateInfo> extends Provider<T> {
  // so, we don't need to parse port (because node http doesn't support host as url does)
  protected readonly baseUrl: URL
  protected readonly baseApiUrl: URL

  protected constructor(protected readonly options: GithubOptions, defaultHost: string, runtimeOptions: ProviderRuntimeOptions) {
    super({
      ...runtimeOptions,
      /* because GitHib uses S3 */
      isUseMultipleRangeRequest: false,
    })

    this.baseUrl = newBaseUrl(githubUrl(options, defaultHost))
    const apiHost = defaultHost === "github.com" ? "api.github.com" : defaultHost
    this.baseApiUrl = newBaseUrl(githubUrl(options, apiHost))
  }

  protected computeGithubBasePath(result: string): string {
    // https://github.com/electron-userland/electron-builder/issues/1903#issuecomment-320881211
    const host = this.options.host
    return host != null && host !== "github.com" && host !== "api.github.com" ? `/api/v3${result}` : result
  }
}

export class GitHubProvider extends BaseGitHubProvider<UpdateInfo> {
  constructor(protected readonly options: GithubOptions, private readonly updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    super(options, "github.com", runtimeOptions)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const cancellationToken = new CancellationToken()

    const feedXml: string = (await this.httpRequest(newUrlFromBase(`${this.basePath}.atom`, this.baseUrl), {
      accept: "application/xml, application/atom+xml, text/xml, */*",
    }, cancellationToken))!

    const feed = parseXml(feedXml)
    let latestRelease = feed.element("entry", false, `No published versions on GitHub`)
    let version: string | null
    try {
      if (this.updater.allowPrerelease) {
        // noinspection TypeScriptValidateJSTypes
        version = latestRelease.element("link").attribute("href").match(hrefRegExp)!![1]
      }
      else {
        version = await this.getLatestVersionString(cancellationToken)
        for (const element of feed.getElements("entry")) {
          if (element.element("link").attribute("href").match(hrefRegExp)!![1] === version) {
            latestRelease = element
            break
          }
        }
      }
    }
    catch (e) {
      throw newError(`Cannot parse releases feed: ${e.stack || e.message},\nXML:\n${feedXml}`, "ERR_UPDATER_INVALID_RELEASE_FEED")
    }

    if (version == null) {
      throw newError(`No published versions on GitHub`, "ERR_UPDATER_NO_PUBLISHED_VERSIONS")
    }

    const channelFile = getChannelFilename(this.getDefaultChannelName())
    const channelFileUrl = newUrlFromBase(this.getBaseDownloadPath(version, channelFile), this.baseUrl)
    const requestOptions = this.createRequestOptions(channelFileUrl)
    let rawData: string
    try {
      rawData = (await this.executor.request(requestOptions, cancellationToken))!!
    }
    catch (e) {
      if (!this.updater.allowPrerelease && e instanceof HttpError && e.statusCode === 404) {
        throw newError(`Cannot find ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
      }
      throw e
    }

    const result = parseUpdateInfo(rawData, channelFile, channelFileUrl)
    if (result.releaseName == null) {
      result.releaseName = latestRelease.elementValueOrEmpty("title")
    }

    if (result.releaseNotes == null) {
      result.releaseNotes = computeReleaseNotes(this.updater.currentVersion, this.updater.fullChangelog, feed, latestRelease)
    }
    return result
  }

  private async getLatestVersionString(cancellationToken: CancellationToken): Promise<string | null> {
    const options = this.options
    // do not use API for GitHub to avoid limit, only for custom host or GitHub Enterprise
    const url = (options.host == null || options.host === "github.com") ?
      newUrlFromBase(`${this.basePath}/latest`, this.baseUrl) :
      new URL(`${this.computeGithubBasePath(`/repos/${options.owner}/${options.repo}/releases`)}/latest`, this.baseApiUrl)
    try {
      const rawData = await this.httpRequest(url, {Accept: "application/json"}, cancellationToken)
      if (rawData == null) {
        return null
      }

      const releaseInfo: GithubReleaseInfo = JSON.parse(rawData)
      return (releaseInfo.tag_name.startsWith("v")) ? releaseInfo.tag_name.substring(1) : releaseInfo.tag_name
    }
    catch (e) {
      throw newError(`Unable to find latest version on GitHub (${url}), please ensure a production release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
    }
  }

  private get basePath(): string {
    return `/${this.options.owner}/${this.options.repo}/releases`
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    // still replace space to - due to backward compatibility
    return resolveFiles(updateInfo, this.baseUrl, p => this.getBaseDownloadPath(updateInfo.version, p.replace(/ /g, "-")))
  }

  private getBaseDownloadPath(version: string, fileName: string): string {
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

export function computeReleaseNotes(currentVersion: semver.SemVer, isFullChangelog: boolean, feed: XElement, latestRelease: any): string | Array<ReleaseNoteInfo> | null {
  if (!isFullChangelog) {
    return getNoteValue(latestRelease)
  }

  const releaseNotes: Array<ReleaseNoteInfo> = []
  for (const release of feed.getElements("entry")) {
    // noinspection TypeScriptValidateJSTypes
    const versionRelease = release.element("link").attribute("href").match(/\/tag\/v?([^/]+)$/)![1]
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
