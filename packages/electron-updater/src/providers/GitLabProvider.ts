import { CancellationToken, GitlabOptions, HttpError, newError, UpdateFileInfo, UpdateInfo } from "builder-util-runtime"
import { URL } from "url"
import { AppUpdater } from "../AppUpdater"
import { ResolvedUpdateFileInfo } from "../types"
import { getChannelFilename, newBaseUrl, newUrlFromBase } from "../util"
import { getFileList, parseUpdateInfo, Provider, ProviderRuntimeOptions } from "./Provider"

interface GitlabUpdateInfo extends UpdateInfo {
  tag: string
  assets: Map<string, string> // filename -> download URL mapping
}

interface GitlabReleaseInfo {
  name: string
  tag_name: string
  description: string
  created_at: string
  released_at: string
  upcoming_release: boolean
  assets: GitlabReleaseAsset
}

interface GitlabReleaseAsset {
  count: number
  sources: Array<{
    format: string
    url: string
  }>
  links: Array<{
    id: number
    name: string
    url: string
    direct_asset_url: string
    link_type: string
  }>
}

export class GitLabProvider extends Provider<GitlabUpdateInfo> {
  private readonly baseApiUrl: URL

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
      const releaseResponse = await this.httpRequest(
        latestReleaseUrl,
        {
          accept: "application/json",
          "PRIVATE-TOKEN": this.options.token || "",
        },
        cancellationToken
      )

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
      assetsMap.set(asset.name, asset.direct_asset_url)
    }

    return {
      tag: tag,
      assets: assetsMap,
      ...result,
    }
  }

  resolveFiles(updateInfo: GitlabUpdateInfo): Array<ResolvedUpdateFileInfo> {
    return getFileList(updateInfo).map((fileInfo: UpdateFileInfo) => {
      // GitLab assets may have spaces replaced with dashes
      const possibleNames = [
        fileInfo.url, // Original filename
        fileInfo.url.replace(/ /g, "-"), // Spaces replaced with dashes
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
