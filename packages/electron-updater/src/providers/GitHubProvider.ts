import { CancellationToken, GithubOptions, githubUrl, HttpError, newError, parseXml, ReleaseNoteInfo, UpdateInfo, XElement } from "builder-util-runtime"
import * as semver from "semver"
import { URL } from "url"
import { AppUpdater } from "../AppUpdater.js"
import { ResolvedUpdateFileInfo } from "../types.js"
import { getChannelFilename, newBaseUrl, newUrlFromBase } from "../util.js"
import { channelFileNotFoundError, parseUpdateInfo, Provider, ProviderRuntimeOptions, resolveFiles } from "./Provider.js"

const hrefRegExp = /\/tag\/(v?[^/]+)$/

interface GithubUpdateInfo extends UpdateInfo {
  tag: string
}
export abstract class BaseGitHubProvider<T extends UpdateInfo> extends Provider<T> {
  // so, we don't need to parse port (because node http doesn't support host as url does)
  protected readonly baseUrl: URL
  protected readonly baseApiUrl: URL

  protected constructor(
    protected readonly options: GithubOptions,
    defaultHost: string,
    runtimeOptions: ProviderRuntimeOptions
  ) {
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
    return host && !["github.com", "api.github.com"].includes(host) ? `/api/v3${result}` : result
  }
}

export class GitHubProvider extends BaseGitHubProvider<GithubUpdateInfo> {
  constructor(
    protected readonly options: GithubOptions,
    private readonly updater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions
  ) {
    super(options, "github.com", runtimeOptions)
  }

  private get channel(): string {
    const result = this.updater.channel || this.options.channel
    return result == null ? this.getDefaultChannelName() : this.getCustomChannelName(result)
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
    const releaseEntries = feed.getElements("entry")
    if (releaseEntries.length === 0) {
      throw newError(`No releases in the GitHub Atom feed`, "ERR_XML_MISSED_ELEMENT")
    }

    // noinspection TypeScriptValidateJSTypes
    let latestRelease: XElement | null = null
    let tag: string | null = null
    try {
      if (this.updater.allowPrerelease) {
        const currentChannel = this.updater?.channel || (semver.prerelease(this.updater.currentVersion)?.[0] as string) || null

        if (currentChannel === null) {
          // allowPrerelease=true with no explicit channel and stable current version:
          // pick the newest available release (pre-release or stable) by semver, skipping
          // non-semver tags (e.g. unrelated package releases in a monorepo). Whether the newest
          // release is actually an update is decided later by AppUpdater.isUpdateAvailable.
          for (const releaseEntry of releaseEntries) {
            // noinspection TypeScriptValidateJSTypes
            const releaseTag = hrefRegExp.exec(releaseEntry.element("link").attribute("href"))?.[1]

            if (!releaseTag || !semver.valid(releaseTag)) {
              continue
            }

            if (tag == null || semver.gt(releaseTag, tag)) {
              tag = releaseTag
              latestRelease = releaseEntry
            }
          }
        } else {
          for (const releaseEntry of releaseEntries) {
            // noinspection TypeScriptValidateJSTypes
            const hrefElement = hrefRegExp.exec(releaseEntry.element("link").attribute("href"))!

            // If this is null then something is wrong and skip this release
            if (hrefElement === null) {
              continue
            }

            // This Release's Tag
            const hrefTag = hrefElement[1]
            if (!semver.valid(hrefTag)) {
              continue
            }

            //Get Channel from this release's tag
            const hrefChannel = (semver.prerelease(hrefTag)?.[0] as string) || null

            const shouldFetchVersion = !currentChannel || ["alpha", "beta"].includes(currentChannel)
            const isCustomChannel = hrefChannel !== null && !["alpha", "beta"].includes(String(hrefChannel))
            // Allow moving from alpha to beta but not down
            const channelMismatch = currentChannel === "beta" && hrefChannel === "alpha"

            if (shouldFetchVersion && !isCustomChannel && !channelMismatch) {
              tag = hrefTag
              latestRelease = releaseEntry
              break
            }

            const isNextPreRelease = hrefChannel && hrefChannel === currentChannel
            if (isNextPreRelease) {
              tag = hrefTag
              latestRelease = releaseEntry
              break
            }
          }
        }
      } else {
        tag = await this.getLatestTagName(cancellationToken)
        for (const releaseEntry of releaseEntries) {
          // noinspection TypeScriptValidateJSTypes
          const hrefMatch = hrefRegExp.exec(releaseEntry.element("link").attribute("href"))
          if (hrefMatch == null) {
            continue
          }
          if (hrefMatch[1] === tag) {
            latestRelease = releaseEntry
            break
          }
        }
      }
    } catch (e: any) {
      throw newError(`Cannot parse releases feed: ${e.stack || e.message},\nXML:\n${feedXml}`, "ERR_UPDATER_INVALID_RELEASE_FEED")
    }

    if (tag == null) {
      throw newError(`No published versions on GitHub`, "ERR_UPDATER_NO_PUBLISHED_VERSIONS")
    }

    let rawData: string
    let channelFile = ""
    let channelFileUrl: any = ""
    const fetchData = async (channelName: string) => {
      channelFile = getChannelFilename(channelName)
      channelFileUrl = newUrlFromBase(this.getBaseDownloadPath(String(tag), channelFile), this.baseUrl)
      const requestOptions = this.createRequestOptions(channelFileUrl)
      try {
        return (await this.executor.request(requestOptions, cancellationToken))!
      } catch (e: any) {
        if (e instanceof HttpError && e.statusCode === 404) {
          throw channelFileNotFoundError(channelFile, channelFileUrl, e)
        }
        throw e
      }
    }

    try {
      let channel = this.channel
      if (this.updater.allowPrerelease && semver.prerelease(tag)?.[0]) {
        channel = this.getCustomChannelName(String(semver.prerelease(tag)?.[0]))
      }
      rawData = await fetchData(channel)
    } catch (e: any) {
      if (this.updater.allowPrerelease) {
        // Allow fallback to `latest.yml`
        rawData = await fetchData(this.getDefaultChannelName())
      } else {
        throw e
      }
    }

    const result = parseUpdateInfo(rawData, channelFile, channelFileUrl)
    // latestRelease can be null in the allowPrerelease=false path when the resolved tag (from the
    // /releases/latest API) is not present in the truncated Atom feed; the update still proceeds
    // with the resolved tag, only the feed-derived release name/notes are omitted.
    if (result.releaseName == null && latestRelease != null) {
      result.releaseName = latestRelease.elementValueOrEmpty("title")
    }

    if (result.releaseNotes == null && latestRelease != null) {
      result.releaseNotes = computeReleaseNotes(this.updater.currentVersion, this.updater.fullChangelog, releaseEntries, latestRelease)
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
    } catch (e: any) {
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
    // guard against path traversal: the tag is interpolated into the download URL, so a tag with
    // a "." / ".." path segment could redirect the request outside the releases download path.
    if (tag.split(/[/\\]/).some(segment => segment === "." || segment === "..")) {
      throw newError(`Invalid release tag: ${tag}`, "ERR_UPDATER_INVALID_TAG")
    }
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

export function computeReleaseNotes(
  currentVersion: semver.SemVer,
  isFullChangelog: boolean,
  releaseEntries: XElement[],
  latestRelease: XElement
): string | Array<ReleaseNoteInfo> | null {
  if (!isFullChangelog) {
    return getNoteValue(latestRelease)
  }

  const releaseVersionRegExp = /\/tag\/v?([^/]+)$/

  let latestVersion: string | undefined = undefined
  try {
    latestVersion = releaseVersionRegExp.exec(latestRelease.element("link").attribute("href"))![1]
    latestVersion = semver.valid(latestVersion) ? latestVersion : undefined
  } catch {
    // If we cannot parse the latest release version, return null — notes cannot be determined
  }

  if (latestVersion == null) {
    return null
  }

  const releaseNotes: Array<ReleaseNoteInfo> = []
  for (const releaseEntry of releaseEntries) {
    let versionRelease: string
    try {
      const match = releaseVersionRegExp.exec(releaseEntry.element("link").attribute("href"))
      if (!match) {
        continue
      }
      versionRelease = match[1]
    } catch {
      continue
    }
    // skip non-semver tags (e.g. doc/website releases in monorepos)
    if (!semver.valid(versionRelease)) {
      continue
    }

    const isGreaterThanCurrent = semver.gt(versionRelease, currentVersion.raw)
    const isLessOrEqualThanLatest = semver.lte(versionRelease, latestVersion)
    if (isGreaterThanCurrent && isLessOrEqualThanLatest) {
      releaseNotes.push({
        version: versionRelease,
        note: getNoteValue(releaseEntry),
      })
    }
  }
  return releaseNotes.sort((a, b) => semver.rcompare(a.version, b.version))
}
