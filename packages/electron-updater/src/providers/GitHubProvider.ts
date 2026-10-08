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

  get feedBaseUrl(): URL {
    return this.baseUrl
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

    let release: FeedRelease
    try {
      release = this.updater.allowPrerelease ? this.findHighestEligibleRelease(releaseEntries) : await this.findLatestRelease(releaseEntries, cancellationToken)
    } catch (e: any) {
      throw newError(`Cannot parse releases feed: ${e.stack || e.message},\nXML:\n${feedXml}`, "ERR_UPDATER_INVALID_RELEASE_FEED")
    }

    const { tag, entry: latestRelease } = release
    if (tag == null) {
      throw newError(`No published versions on GitHub`, "ERR_UPDATER_NO_PUBLISHED_VERSIONS")
    }

    const { rawData, channelFile, channelFileUrl } = await this.fetchChannelFile(tag, cancellationToken)
    const result = parseUpdateInfo(rawData, channelFile, channelFileUrl)
    // latestRelease can be null in the allowPrerelease=false path when the resolved tag (from the
    // /releases/latest API) is not present in the truncated Atom feed; the update still proceeds
    // with the resolved tag, only the feed-derived release name/notes are omitted.
    if (latestRelease != null) {
      if (result.releaseName == null) {
        result.releaseName = latestRelease.elementValueOrEmpty("title")
      }
      if (result.releaseNotes == null) {
        result.releaseNotes = computeReleaseNotes(this.updater.currentVersion, this.updater.fullChangelog, releaseEntries, latestRelease)
      }
    }
    return {
      tag: tag,
      ...result,
    }
  }

  // allowPrerelease=true: the highest semver release eligible for the current channel. The Atom feed is ordered by
  // publication date, not by version, so the first eligible entry is not necessarily the newest one (#10287).
  private findHighestEligibleRelease(releaseEntries: Array<XElement>): FeedRelease {
    const currentChannel = this.updater?.channel || prereleaseChannelOf(this.updater.currentVersion)
    // No explicit channel and a stable current version: any semver release (pre-release or stable) is a candidate,
    // non-semver tags (e.g. unrelated package releases in a monorepo) are skipped. Whether the newest release is
    // actually an update is decided later by AppUpdater.isUpdateAvailable.
    if (currentChannel === null) {
      return pickHighestRelease(releaseEntries, () => true)
    }
    return pickHighestRelease(releaseEntries, tag => isEligibleForChannel(prereleaseChannelOf(tag), currentChannel))
  }

  // allowPrerelease=false: the tag comes from the /releases/latest API; the feed only supplies the release name/notes.
  private async findLatestRelease(releaseEntries: Array<XElement>, cancellationToken: CancellationToken): Promise<FeedRelease> {
    const tag = await this.getLatestTagName(cancellationToken)
    const entry = releaseEntries.find(releaseEntry => releaseTagOf(releaseEntry) === tag) ?? null
    return { tag, entry }
  }

  private async fetchChannelFile(tag: string, cancellationToken: CancellationToken): Promise<ChannelFileData> {
    const tagChannel = prereleaseChannelOf(tag)
    const channel = this.updater.allowPrerelease && tagChannel != null ? this.getCustomChannelName(String(tagChannel)) : this.channel
    try {
      return await this.requestChannelFile(tag, channel, cancellationToken)
    } catch (e: any) {
      if (!this.updater.allowPrerelease) {
        throw e
      }
      // Allow fallback to `latest.yml`
      return await this.requestChannelFile(tag, this.getDefaultChannelName(), cancellationToken)
    }
  }

  private async requestChannelFile(tag: string, channelName: string, cancellationToken: CancellationToken): Promise<ChannelFileData> {
    const channelFile = getChannelFilename(channelName)
    const channelFileUrl = newUrlFromBase(this.getBaseDownloadPath(tag, channelFile), this.baseUrl)
    try {
      const rawData = (await this.executor.request(this.createRequestOptions(channelFileUrl), cancellationToken))!
      return { rawData, channelFile, channelFileUrl }
    } catch (e: any) {
      if (e instanceof HttpError && e.statusCode === 404) {
        throw channelFileNotFoundError(channelFile, channelFileUrl, e)
      }
      throw e
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

interface FeedRelease {
  readonly tag: string | null
  readonly entry: XElement | null
}

interface ChannelFileData {
  readonly rawData: string
  readonly channelFile: string
  readonly channelFileUrl: URL
}

const PROMOTABLE_CHANNELS = ["alpha", "beta"]

// Tag of a feed entry from its link href; undefined when the href has no /tag/ segment.
function releaseTagOf(releaseEntry: XElement): string | undefined {
  // noinspection TypeScriptValidateJSTypes
  return hrefRegExp.exec(releaseEntry.element("link").attribute("href"))?.[1]
}

// First pre-release identifier ("beta" for 1.0.0-beta.1), or null for a stable version. Numeric identifiers are kept
// as-is (so 1.0.0-0 counts as stable, as 0 is falsy).
function prereleaseChannelOf(version: string | semver.SemVer): string | null {
  return (semver.prerelease(version)?.[0] as string) || null
}

// A release is eligible when it is on the current channel. Alpha/beta clients additionally accept stable releases
// and may move from alpha to beta, but not down from beta to alpha; custom channels only follow themselves.
function isEligibleForChannel(releaseChannel: string | null, currentChannel: string): boolean {
  if (releaseChannel === currentChannel) {
    return true
  }
  if (!PROMOTABLE_CHANNELS.includes(currentChannel)) {
    return false
  }
  return releaseChannel === null || (PROMOTABLE_CHANNELS.includes(String(releaseChannel)) && !(currentChannel === "beta" && releaseChannel === "alpha"))
}

// Highest semver-valid release accepted by `isEligible`; on equal versions the earlier feed entry wins.
function pickHighestRelease(releaseEntries: Array<XElement>, isEligible: (tag: string) => boolean): FeedRelease {
  let tag: string | null = null
  let entry: XElement | null = null
  for (const releaseEntry of releaseEntries) {
    const releaseTag = releaseTagOf(releaseEntry)
    if (releaseTag == null || !semver.valid(releaseTag) || !isEligible(releaseTag)) {
      continue
    }
    if (tag == null || semver.gt(releaseTag, tag)) {
      tag = releaseTag
      entry = releaseEntry
    }
  }
  return { tag, entry }
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
