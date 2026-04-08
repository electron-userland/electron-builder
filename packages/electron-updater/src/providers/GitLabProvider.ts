import { CancellationToken, GitlabOptions, HttpError, newError, UpdateFileInfo, UpdateInfo, GitlabReleaseInfo, GitlabReleaseAsset } from "builder-util-runtime"
import { URL } from "url"
// @ts-ignore
import * as escapeRegExp from "lodash.escaperegexp"
import { AppUpdater } from "../AppUpdater.js"
import { ResolvedUpdateFileInfo } from "../types.js"
import { getChannelFilename, newBaseUrl, newUrlFromBase } from "../util.js"
import { getFileList, parseUpdateInfo, Provider, ProviderRuntimeOptions } from "./Provider.js"

interface GitlabUpdateInfo extends UpdateInfo {
  tag: string
  assets: Map<string, string> // filename -> download URL mapping
}

export class GitLabProvider extends Provider<GitlabUpdateInfo> {
  private readonly baseApiUrl: URL
  // Cache the latest version info to avoid unnecessary HTTP requests
  private cachedLatestVersion: GitlabUpdateInfo | null = null

  /**
   * Normalizes filenames by replacing spaces and underscores with dashes.
   *
   * This is a workaround to handle filename formatting differences between tools:
   * - electron-builder formats filenames like "test file.txt" as "test-file.txt"
   * - GitLab may provide asset URLs using underscores, such as "test_file.txt"
   *
   * Because of this mismatch, we can't reliably extract the correct filename from
   * the asset path without normalization. This function ensures consistent matching
   * across different filename formats by converting all spaces and underscores to dashes.
   *
   * @param filename The filename to normalize
   * @returns The normalized filename with spaces and underscores replaced by dashes
   */
  private normalizeFilename(filename: string): string {
    return filename.replace(/ |_/g, "-")
  }

  constructor(
    private readonly options: GitlabOptions,
    private readonly updater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions
  ) {
    super({
      ...runtimeOptions,
      // GitLab might not support multiple range requests efficiently
      isUseMultipleRangeRequest: false,
    })

    const defaultHost = "gitlab.com"
    const host = options.host || defaultHost

    this.baseApiUrl = newBaseUrl(`https://${host}/api/v4`)
  }

  private get channel(): string {
    const result = this.updater.channel || this.options.channel
    return result == null ? this.getDefaultChannelName() : this.getCustomChannelName(result)
  }

  async getLatestVersion(): Promise<GitlabUpdateInfo> {
    const cancellationToken = new CancellationToken()

    // Get latest release from GitLab API using the permalink/latest endpoint
    const latestReleaseUrl = newUrlFromBase(`projects/${this.options.projectId}/releases/permalink/latest`, this.baseApiUrl)

    let latestRelease: GitlabReleaseInfo
    try {
      const header = { "Content-Type": "application/json", ...this.setAuthHeaderForToken(this.options.token || null) }
      const releaseResponse = await this.httpRequest(latestReleaseUrl, header, cancellationToken)

      if (!releaseResponse) {
        throw newError("No latest release found", "ERR_UPDATER_NO_PUBLISHED_VERSIONS")
      }

      latestRelease = JSON.parse(releaseResponse)
    } catch (e: any) {
      throw newError(`Unable to find latest release on GitLab (${latestReleaseUrl}): ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
    }

    const tag = latestRelease.tag_name

    // Look for channel file in release assets
    let rawData: string | null = null
    let channelFile = ""
    let channelFileUrl: URL | null = null

    const fetchChannelData = async (channelName: string): Promise<string> => {
      channelFile = getChannelFilename(channelName)

      // Find the channel file in GitLab release assets
      const channelAsset = latestRelease.assets.links.find(asset => asset.name === channelFile)

      if (!channelAsset) {
        throw newError(`Cannot find ${channelFile} in the latest release assets`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
      }

      channelFileUrl = new URL(channelAsset.direct_asset_url)
      const headers = this.options.token ? { "PRIVATE-TOKEN": this.options.token } : undefined

      try {
        const result = await this.httpRequest(channelFileUrl, headers, cancellationToken)
        if (!result) {
          throw newError(`Empty response from ${channelFileUrl}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
        }
        return result
      } catch (e: any) {
        if (e instanceof HttpError && e.statusCode === 404) {
          throw newError(`Cannot find ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
        }
        throw e
      }
    }

    try {
      rawData = await fetchChannelData(this.channel)
    } catch (e: any) {
      // If custom channel fails, try default channel as fallback
      if (this.channel !== this.getDefaultChannelName()) {
        rawData = await fetchChannelData(this.getDefaultChannelName())
      } else {
        throw e
      }
    }

    if (!rawData) {
      throw newError(`Unable to parse channel data from ${channelFile}`, "ERR_UPDATER_INVALID_UPDATE_INFO")
    }

    const result = parseUpdateInfo(rawData, channelFile, channelFileUrl!)

    // Set release name from GitLab if not present
    if (result.releaseName == null) {
      result.releaseName = latestRelease.name
    }

    // Set release notes from GitLab description if not present
    if (result.releaseNotes == null) {
      result.releaseNotes = latestRelease.description || null
    }

    // Create assets map from GitLab release assets
    const assetsMap = new Map<string, string>()
    for (const asset of latestRelease.assets.links) {
      assetsMap.set(this.normalizeFilename(asset.name), asset.direct_asset_url)
    }

    const gitlabUpdateInfo = {
      tag: tag,
      assets: assetsMap,
      ...result,
    }

    // Cache the latest version info
    this.cachedLatestVersion = gitlabUpdateInfo

    return gitlabUpdateInfo
  }

  /**
   * Utility function to convert GitlabReleaseAsset to Map<string, string>
   * Maps asset names to their download URLs
   */
  private convertAssetsToMap(assets: GitlabReleaseAsset): Map<string, string> {
    const assetsMap = new Map<string, string>()
    for (const asset of assets.links) {
      assetsMap.set(this.normalizeFilename(asset.name), asset.direct_asset_url)
    }
    return assetsMap
  }

  /**
   * Find blockmap file URL in assets map for a specific filename
   */
  private findBlockMapInAssets(assets: Map<string, string>, filename: string): URL | null {
    const possibleBlockMapNames = [`${filename}.blockmap`, `${this.normalizeFilename(filename)}.blockmap`]

    for (const blockMapName of possibleBlockMapNames) {
      const assetUrl = assets.get(blockMapName)
      if (assetUrl) {
        return new URL(assetUrl)
      }
    }
    return null
  }

  private async fetchReleaseInfoByVersion(version: string): Promise<GitlabReleaseInfo | null> {
    const cancellationToken = new CancellationToken()

    // Try v-prefixed version first, then fallback to plain version
    const possibleReleaseIds = [`v${version}`, version]

    for (const releaseId of possibleReleaseIds) {
      const releaseUrl = newUrlFromBase(`projects/${this.options.projectId}/releases/${encodeURIComponent(releaseId)}`, this.baseApiUrl)

      try {
        const header = { "Content-Type": "application/json", ...this.setAuthHeaderForToken(this.options.token || null) }
        const releaseResponse = await this.httpRequest(releaseUrl, header, cancellationToken)

        if (releaseResponse) {
          const release: GitlabReleaseInfo = JSON.parse(releaseResponse)
          return release
        }
      } catch (e: any) {
        // If it's a 404 error, try the next release ID format
        if (e instanceof HttpError && e.statusCode === 404) {
          continue
        }
        // For other errors, throw immediately
        throw newError(`Unable to find release ${releaseId} on GitLab (${releaseUrl}): ${e.stack || e.message}`, "ERR_UPDATER_RELEASE_NOT_FOUND")
      }
    }

    // If we get here, none of the release ID formats worked
    throw newError(`Unable to find release with version ${version} (tried: ${possibleReleaseIds.join(", ")}) on GitLab`, "ERR_UPDATER_RELEASE_NOT_FOUND")
  }

  private setAuthHeaderForToken(token: string | null): { [key: string]: string } {
    const headers: { [key: string]: string } = {}

    if (token != null) {
      // If the token starts with "Bearer", it is an OAuth application secret
      // Note that the original gitlab token would not start with "Bearer"
      // it might start with "gloas-", if so user needs to add "Bearer " prefix to the token
      if (token.startsWith("Bearer")) {
        headers.authorization = token
      } else {
        headers["PRIVATE-TOKEN"] = token
      }
    }

    return headers
  }

  /**
   * Get version info for blockmap files, using cache when possible
   */
  private async getVersionInfoForBlockMap(version: string): Promise<Map<string, string> | null> {
    // Check if we can use cached version info
    if (this.cachedLatestVersion && this.cachedLatestVersion.version === version) {
      return this.cachedLatestVersion.assets
    }

    // Fetch version info if not cached or version doesn't match
    const versionInfo = await this.fetchReleaseInfoByVersion(version)
    if (versionInfo && versionInfo.assets) {
      return this.convertAssetsToMap(versionInfo.assets)
    }

    return null
  }

  /**
   * Find blockmap URLs from version assets
   */
  private async findBlockMapUrlsFromAssets(oldVersion: string, newVersion: string, baseFilename: string): Promise<[URL | null, URL | null]> {
    let newBlockMapUrl: URL | null = null
    let oldBlockMapUrl: URL | null = null

    // Get new version assets
    const newVersionAssets = await this.getVersionInfoForBlockMap(newVersion)
    if (newVersionAssets) {
      newBlockMapUrl = this.findBlockMapInAssets(newVersionAssets, baseFilename)
    }

    // Get old version assets
    const oldVersionAssets = await this.getVersionInfoForBlockMap(oldVersion)
    if (oldVersionAssets) {
      const oldFilename = baseFilename.replace(new RegExp(escapeRegExp(newVersion), "g"), oldVersion)
      oldBlockMapUrl = this.findBlockMapInAssets(oldVersionAssets, oldFilename)
    }

    return [oldBlockMapUrl, newBlockMapUrl]
  }

  async getBlockMapFiles(baseUrl: URL, oldVersion: string, newVersion: string, oldBlockMapFileBaseUrl: string | null = null): Promise<URL[]> {
    // If is `project_upload`, find blockmap files from corresponding gitLab assets
    // Because each asset has an unique path that includes an identified hash code,
    // e.g. https://gitlab.com/-/project/71361100/uploads/051f27a925eaf679f2ad688105362acc/latest.yml
    if (this.options.uploadTarget === "project_upload") {
      // Get the base filename from the URL to find corresponding blockmap files
      const baseFilename = baseUrl.pathname.split("/").pop() || ""

      // Try to find blockmap files in GitLab assets
      const [oldBlockMapUrl, newBlockMapUrl] = await this.findBlockMapUrlsFromAssets(oldVersion, newVersion, baseFilename)

      if (!newBlockMapUrl) {
        throw newError(`Cannot find blockmap file for ${newVersion} in GitLab assets`, "ERR_UPDATER_BLOCKMAP_FILE_NOT_FOUND")
      }

      if (!oldBlockMapUrl) {
        throw newError(`Cannot find blockmap file for ${oldVersion} in GitLab assets`, "ERR_UPDATER_BLOCKMAP_FILE_NOT_FOUND")
      }

      return [oldBlockMapUrl, newBlockMapUrl]
    } else {
      return super.getBlockMapFiles(baseUrl, oldVersion, newVersion, oldBlockMapFileBaseUrl)
    }
  }

  resolveFiles(updateInfo: GitlabUpdateInfo): Array<ResolvedUpdateFileInfo> {
    return getFileList(updateInfo).map((fileInfo: UpdateFileInfo) => {
      // Try both original and normalized filename formats
      const possibleNames = [
        fileInfo.url, // Original filename
        this.normalizeFilename(fileInfo.url), // Normalized filename (spaces/underscores → dashes)
      ]

      const matchingAssetName = possibleNames.find(name => updateInfo.assets.has(name))
      const assetUrl = matchingAssetName ? updateInfo.assets.get(matchingAssetName) : undefined

      if (!assetUrl) {
        throw newError(
          `Cannot find asset "${fileInfo.url}" in GitLab release assets. Available assets: ${Array.from(updateInfo.assets.keys()).join(", ")}`,
          "ERR_UPDATER_ASSET_NOT_FOUND"
        )
      }

      return {
        url: new URL(assetUrl),
        info: fileInfo,
      }
    })
  }

  toString(): string {
    return `GitLab (projectId: ${this.options.projectId}, channel: ${this.channel})`
  }
}
