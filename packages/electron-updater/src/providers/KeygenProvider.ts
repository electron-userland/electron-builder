import { CancellationToken, KeygenOptions, newError, UpdateInfo } from "builder-util-runtime"
import { AppUpdater } from "../AppUpdater"
import { ResolvedUpdateFileInfo } from "../main"
import { getChannelFilename, newBaseUrl, newUrlFromBase } from "../util"
import { parseUpdateInfo, Provider, ProviderRuntimeOptions, resolveFiles } from "./Provider"

export class KeygenProvider extends Provider<UpdateInfo> {
  private readonly baseUrl: URL

  constructor(private readonly configuration: KeygenOptions, private readonly updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    super({
      ...runtimeOptions,
      isUseMultipleRangeRequest: false,
    })
    this.baseUrl = newBaseUrl(`https://api.keygen.sh/v1/accounts/${this.configuration.account}/artifacts`)
  }

  private get channel(): string {
    return this.updater.channel || this.configuration.channel || "stable"
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const cancellationToken = new CancellationToken()
    const channelFile = getChannelFilename(this.getCustomChannelName(this.channel))
    const channelUrl = newUrlFromBase(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery)
    try {
      const updateInfo = await this.httpRequest(
        channelUrl,
        {
          Accept: "application/vnd.api+json",
        },
        cancellationToken
      )
      return parseUpdateInfo(updateInfo, channelFile, channelUrl)
    } catch (e) {
      throw newError(`Unable to find latest version on ${this.toString()}, please ensure release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
    }
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }

  toString() {
    const { account, product, platform } = this.configuration
    return `Keygen (account: ${account}, product: ${product}, platform: ${platform}, channel: ${this.channel})`
  }
}
