import { CancellationToken, GithubOptions, githubUrl, HttpError, newError, parseXml, ReleaseNoteInfo, UpdateInfo, XElement } from "builder-util-runtime"
import * as semver from "semver"
import { URL } from "url"
import { AppUpdater } from "../AppUpdater"
import { ResolvedUpdateFileInfo } from "../main"
import { getChannelFilename, newBaseUrl, newUrlFromBase } from "../util"
import { parseUpdateInfo, Provider, ProviderRuntimeOptions, resolveFiles } from "./Provider"

const hrefRegExp = /\/tag\/([^/]+)$/

interface GithubUpdateInfo extends UpdateInfo {
  tag: string
}
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

export class GitHubProvider extends BaseGitHubProvider<GithubUpdateInfo> {
  constructor(protected readonly options: GithubOptions, private readonly updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    super(options, "github.com", runtimeOptions)
  }

  async getLatestVersion(): Promise<GithubUpdateInfo> {
    const cancellationToken = new CancellationToken()

    const feedXml: string = (await this.httpRequest(
      newUrlFromBase(`${this.basePath}.atom`, this.baseUrl),
      {
        accept: "application/xml, application/atom+xml, text/xml, */*",
      },
      cancellationToken
    ))!

    const feed = parseXml(feedXml)
    // noinspection TypeScriptValidateJSTypes
    let latestRelease = feed.element("entry", false, `No published versions on GitHub`)
    let tag: string | null
    try {
      if (this.updater.allowPrerelease) {
        // noinspection TypeScriptValidateJSTypes
        tag = hrefRegExp.exec(latestRelease.element("link").attribute("href"))![1]
      } else {
        tag = await this.getLatestTagName(cancellationToken)
        for (const element of feed.getElements("entry")) {
          // noinspection TypeScriptValidateJSTypes
          if (hrefRegExp.exec(element.element("link").attribute("href"))![1] === tag) {
            latestRelease = element
            break
          }
        }
      }
    } catch (e) {
      throw newError(`Cannot parse releases feed: ${e.stack || e.message},\nXML:\n${feedXml}`, "ERR_UPDATER_INVALID_RELEASE_FEED")
    }

    if (tag == null) {
      throw newError(`No published versions on GitHub`, "ERR_UPDATER_NO_PUBLISHED_VERSIONS")
    }

    const channelFile = getChannelFilename(this.getDefaultChannelName())
    const channelFileUrl = newUrlFromBase(this.getBaseDownloadPath(tag, channelFile), this.baseUrl)
    const requestOptions = this.createRequestOptions(channelFileUrl)
    let rawData: string
    try {
      rawData = (await this.executor.request(requestOptions, cancellationToken))!
    } catch (e) {
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
    return {
      tag: tag,
      ...result,
    }
  }

  private async getLatestTagName(cancellationToken: CancellationToken): Promise<string | null> {
    const options = this.options
    // do not use API for GitHub to avoid limit, only for custom host or GitHub Enterprise
    const url =
      options.host == null || options.host === "github.com"
        ? newUrlFromBase(`${this.basePath}/latest`, this.baseUrl)
        : new URL(`${this.computeGithubBasePath(`/repos/${options.owner}/${options.repo}/releases`)}/latest`, this.baseApiUrl)
    try {
      const rawData = await this.httpRequest(url, { Accept: "application/json" }, cancellationToken)
      if (rawData == null) {
        return null
      }

      const releaseInfo: GithubReleaseInfo = JSON.parse(rawData)
      return releaseInfo.tag_name
    } catch (e) {
      throw newError(`Unable to find latest version on GitHub (${url}), please ensure a production release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
    }
  }

  private get basePath(): string {
    return `/${this.options.owner}/${this.options.repo}/releases`
  }

  resolveFiles(updateInfo: GithubUpdateInfo): Array<ResolvedUpdateFileInfo> {
    // still replace space to - due to backward compatibility
    return resolveFiles(updateInfo, this.baseUrl, p => this.getBaseDownloadPath(updateInfo.tag, p.replace(/ /g, "-")))
  }

  private getBaseDownloadPath(tag: string, fileName: string): string {
    return `${this.basePath}/download/${tag}/${fileName}`
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
    const versionRelease = /\/tag\/v?([^/]+)$/.exec(release.element("link").attribute("href"))![1]
    if (semver.lt(currentVersion, versionRelease)) {
      releaseNotes.push({
        version: versionRelease,
        note: getNoteValue(release),
      })
    }
  }
  return releaseNotes.sort((a, b) => semver.rcompare(a.version, b.version))
}
