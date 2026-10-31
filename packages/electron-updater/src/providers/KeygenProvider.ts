import { CancellationToken, CrossOriginRequest, KeygenOptions, newError, UpdateInfo } from "builder-util-runtime"
import { AppUpdater } from "../AppUpdater.js"
import { ResolvedUpdateFileInfo } from "../types.js"
import { getChannelFilename, newBaseUrl, newUrlFromBase } from "../util.js"
import { parseUpdateInfo, Provider, ProviderRuntimeOptions, resolveFiles } from "./Provider.js"

export class KeygenProvider extends Provider<UpdateInfo> {
  private readonly defaultHostname = "api.keygen.sh"
  private readonly baseUrl: URL

  constructor(
    private readonly configuration: KeygenOptions,
    private readonly updater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions
  ) {
    super({
      ...runtimeOptions,
      isUseMultipleRangeRequest: false,
    })
    const host = this.configuration.host || this.defaultHostname
    this.baseUrl = newBaseUrl(`https://${host}/v1/accounts/${this.configuration.account}/artifacts?product=${this.configuration.product}`)
  }

  get feedBaseUrl(): URL {
    return this.baseUrl
  }

  /** The built-in list: another origin than the feed's gets the default cross-origin headers (the app's `crossOriginHeaders` decides). */
  crossOriginHeaders(defaults: ReadonlyArray<string>, _request: CrossOriginRequest): ReadonlyArray<string> | null {
    return defaults
  }

  private get channel(): string {
    return this.updater.channel || this.configuration.channel || "stable"
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const cancellationToken = new CancellationToken()
    const channelFile = getChannelFilename(this.getCustomChannelName(this.channel))
    const channelUrl = newUrlFromBase(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery)
    let updateInfo: string | null
    try {
      updateInfo = await this.channelFileRequest(
        channelUrl,
        {
          Accept: "application/vnd.api+json",
          "Keygen-Version": "1.1",
        },
        cancellationToken
      )
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
    const { account, product, platform } = this.configuration
    return `Keygen (account: ${account}, product: ${product}, platform: ${platform}, channel: ${this.channel})`
  }
}
