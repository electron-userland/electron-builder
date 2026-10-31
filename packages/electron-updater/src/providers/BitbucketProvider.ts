import { BitbucketOptions, CancellationToken, CrossOriginRequest, newError, UpdateInfo } from "builder-util-runtime"
import { AppUpdater } from "../AppUpdater.js"
import { ResolvedUpdateFileInfo } from "../types.js"
import { getChannelFilename, newBaseUrl, newUrlFromBase } from "../util.js"
import { parseUpdateInfo, Provider, ProviderRuntimeOptions, resolveFiles } from "./Provider.js"

export class BitbucketProvider extends Provider<UpdateInfo> {
  private readonly baseUrl: URL

  constructor(
    private readonly configuration: BitbucketOptions,
    private readonly updater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions
  ) {
    super({
      ...runtimeOptions,
      isUseMultipleRangeRequest: false,
    })
    const { owner, slug } = configuration
    this.baseUrl = newBaseUrl(`https://api.bitbucket.org/2.0/repositories/${owner}/${slug}/downloads`)
  }

  get feedBaseUrl(): URL {
    return this.baseUrl
  }

  /** The built-in list: another origin than the feed's gets the default cross-origin headers (the app's `crossOriginHeaders` decides). */
  crossOriginHeaders(defaults: ReadonlyArray<string>, _request: CrossOriginRequest): ReadonlyArray<string> | null {
    return defaults
  }

  private get channel(): string {
    return this.updater.channel || this.configuration.channel || "latest"
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const cancellationToken = new CancellationToken()
    const channelFile = getChannelFilename(this.getCustomChannelName(this.channel))
    const channelUrl = newUrlFromBase(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery)
    let updateInfo: string | null
    try {
      updateInfo = await this.channelFileRequest(channelUrl, undefined, cancellationToken)
    } catch (e: any) {
      // a channel file over the size limit keeps its own code
      if (e instanceof Error && "code" in e && e.code === "ERR_HTTP_RESPONSE_TOO_LARGE") {
        throw e
      }
      throw newError(`Unable to find latest version on ${this.toString()}, please ensure release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
    }
    // parsed outside the try: a manifest that cannot be parsed fails with ERR_UPDATER_INVALID_UPDATE_INFO
    return parseUpdateInfo(updateInfo, channelFile, channelUrl)
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }

  toString() {
    const { owner, slug } = this.configuration
    return `Bitbucket (owner: ${owner}, slug: ${slug}, channel: ${this.channel})`
  }
}
