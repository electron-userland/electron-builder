import { CancellationToken, GithubOptions, githubTagPrefix, HttpError, newError, UpdateInfo } from "builder-util-runtime"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import * as path from "path"
import * as semver from "semver"
import { AppUpdater } from "../AppUpdater.js"
import { URL } from "url"
import { getChannelFilename, newUrlFromBase } from "../util.js"
import { BaseGitHubProvider, pickHighestRelease, prereleaseChannelOf, releaseEligibility } from "./GitHubProvider.js"
import { ResolvedUpdateFileInfo } from "../types.js"
import { channelFileNotFoundError, getFileList, parseUpdateInfo, ProviderRuntimeOptions } from "./Provider.js"

export interface PrivateGitHubUpdateInfo extends UpdateInfo {
  assets: Array<Asset>
}

export class PrivateGitHubProvider extends BaseGitHubProvider<PrivateGitHubUpdateInfo> {
  constructor(
    options: GithubOptions,
    private readonly updater: AppUpdater,
    private readonly token: string,
    runtimeOptions: ProviderRuntimeOptions
  ) {
    super(options, "api.github.com", runtimeOptions)
  }

  // the asset URLs come from the GitHub API (api.github.com or the Enterprise host), not from latest*.yml, and need the token
  get feedBaseUrl(): null {
    return null
  }

  protected createRequestOptions(url: URL, headers?: OutgoingHttpHeaders | null): RequestOptions {
    const result = super.createRequestOptions(url, headers)
    ;(result as any).redirect = "manual"
    return result
  }

  async getLatestVersion(): Promise<PrivateGitHubUpdateInfo> {
    const cancellationToken = new CancellationToken()
    const { release: releaseInfo, version } = await this.getLatestVersionInfo(cancellationToken)

    // as in GitHubProvider: a selected pre-release reads its own channel file (beta.yml for 1.0.0-beta.1), any other release
    // the configured channel's; a release without that file falls back to the default channel file
    const channel = (version == null ? null : prereleaseChannelOf(version)) ?? (this.updater.channel || this.options.channel)
    const preferredChannelFile = getChannelFilename(channel == null ? this.getDefaultChannelName() : this.getCustomChannelName(channel))
    const defaultChannelFile = getChannelFilename(this.getDefaultChannelName())
    const asset = releaseInfo.assets.find(it => it.name === preferredChannelFile) ?? releaseInfo.assets.find(it => it.name === defaultChannelFile)
    if (asset == null) {
      const channelFiles = preferredChannelFile === defaultChannelFile ? defaultChannelFile : `${preferredChannelFile} or ${defaultChannelFile}`
      // html_url must be always, but just to be sure
      throw newError(`Cannot find ${channelFiles} in the release ${releaseInfo.html_url || releaseInfo.name}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
    }

    const channelFile = asset.name
    const url = new URL(asset.url)
    let result: any
    try {
      result = parseUpdateInfo(await this.channelFileRequest(url, this.configureHeaders("application/octet-stream"), cancellationToken), channelFile, url)
    } catch (e: any) {
      if (e instanceof HttpError && e.statusCode === 404) {
        throw channelFileNotFoundError(channelFile, url, e)
      }
      throw e
    }

    ;(result as PrivateGitHubUpdateInfo).assets = releaseInfo.assets
    return result
  }

  get fileExtraDownloadHeaders(): OutgoingHttpHeaders | null {
    return this.configureHeaders("application/octet-stream")
  }

  private configureHeaders(accept: string) {
    return {
      accept,
      authorization: `token ${this.token}`,
    }
  }

  // `version` is the selected release's version on the allowPrerelease path, null for the /latest release
  private async getLatestVersionInfo(cancellationToken: CancellationToken): Promise<{ release: ReleaseInfo; version: string | null }> {
    const allowPrerelease = this.updater.allowPrerelease
    let basePath = this.basePath
    if (!allowPrerelease) {
      basePath = `${basePath}/latest`
    }

    const url = newUrlFromBase(basePath, this.baseUrl)
    let candidates: Array<ReleaseInfo>
    try {
      const body = await this.httpRequest(url, this.configureHeaders("application/vnd.github.v3+json"), cancellationToken)
      const version = body == null ? null : JSON.parse(body)
      // only `latest` can return a single ReleaseInfo. Otherwise, a list of ReleaseInfo is returned and we need to find the latest one ourselves
      if (!allowPrerelease) {
        if (!hasAssetList(version)) {
          throw new Error(`expected a release with a list of assets, got ${version === null ? "null" : typeof version}`)
        }
        return { release: version, version: null }
      }
      if (!Array.isArray(version)) {
        throw new Error(`expected a list of releases, got ${version === null ? "null" : typeof version}`)
      }
      // An entry that is not an object with a string tag_name and a list of assets is skipped.
      candidates = version.filter((it: unknown): it is ReleaseInfo => hasAssetList(it) && typeof it.tag_name === "string" && !it.draft)
    } catch (e: any) {
      throw newError(`Unable to find latest version on GitHub (${url}), please ensure a production release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
    }

    // the list is ordered by creation date, not by version: like GitHubProvider, pick the highest semver release eligible for the current channel.
    // A tag is read without the configured tagNamePrefix; with a prefix other than the default "v", a tag without it belongs to another package and is skipped.
    const tagPrefix = githubTagPrefix(this.options)
    const versionOf = (release: ReleaseInfo): string | null => {
      if (release.tag_name.startsWith(tagPrefix)) {
        return release.tag_name.slice(tagPrefix.length)
      }
      return tagPrefix === "v" ? release.tag_name : null
    }
    // releases whose tags are not versions (e.g. created by other tooling): the first pre-release in the list, else the first release
    if (!candidates.some(it => semver.valid(versionOf(it)) != null)) {
      const release = candidates.find(it => it.prerelease) ?? candidates[0]
      if (release == null) {
        throw newError(`No published versions on GitHub`, "ERR_UPDATER_NO_PUBLISHED_VERSIONS")
      }
      return { release, version: null }
    }

    const selected = pickHighestRelease(candidates, versionOf, releaseEligibility(this.updater))
    if (selected.item == null) {
      throw newError(`No published versions on GitHub`, "ERR_UPDATER_NO_PUBLISHED_VERSIONS")
    }
    return { release: selected.item, version: selected.tag }
  }

  private get basePath(): string {
    return this.computeGithubBasePath(`/repos/${this.options.owner}/${this.options.repo}/releases`)
  }

  resolveFiles(updateInfo: PrivateGitHubUpdateInfo): Array<ResolvedUpdateFileInfo> {
    return getFileList(updateInfo).map(it => {
      const name = path.posix.basename(it.url).replace(/ /g, "-")
      const asset = updateInfo.assets.find(it => it != null && it.name === name)
      if (asset == null) {
        throw newError(`Cannot find asset "${name}" in: ${JSON.stringify(updateInfo.assets, null, 2)}`, "ERR_UPDATER_ASSET_NOT_FOUND")
      }

      return {
        url: new URL(asset.url),
        info: it,
      }
    })
  }
}

interface ReleaseInfo {
  tag_name: string
  name: string
  html_url: string
  draft: boolean
  prerelease: boolean
  assets: Array<Asset>
}

export interface Asset {
  name: string
  url: string
}

// a release as the GitHub API returns it: an object with a list of assets
function hasAssetList(value: unknown): value is ReleaseInfo {
  return typeof value === "object" && value !== null && "assets" in value && Array.isArray(value.assets)
}
