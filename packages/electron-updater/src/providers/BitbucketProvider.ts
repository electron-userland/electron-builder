import { CancellationToken, BitbucketOptions, newError, UpdateInfo } from "builder-util-runtime"
import { AppUpdater } from "../AppUpdater"
import { ResolvedUpdateFileInfo } from "../main"
import { getChannelFilename, newBaseUrl, newUrlFromBase } from "../util"
import { parseUpdateInfo, Provider, ProviderRuntimeOptions, resolveFiles } from "./Provider"

export class BitbucketProvider extends Provider<UpdateInfo> {
  private readonly baseUrl: URL

  constructor(private readonly configuration: BitbucketOptions, private readonly updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    super({
      ...runtimeOptions,
      isUseMultipleRangeRequest: false,
    })
    const { owner, slug } = configuration
    this.baseUrl = newBaseUrl(`https://api.bitbucket.org/2.0/repositories/${owner}/${slug}/downloads`)
  }

  private get channel(): string {
    return this.updater.channel || this.configuration.channel || "latest"
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const cancellationToken = new CancellationToken()
    const channelFile = getChannelFilename(this.getCustomChannelName(this.channel))
    const channelUrl = newUrlFromBase(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery)
    try {
      const updateInfo = await this.httpRequest(channelUrl, undefined, cancellationToken)
      return parseUpdateInfo(updateInfo, channelFile, channelUrl)
    } catch (e) {
      throw newError(`Unable to find latest version on ${this.toString()}, please ensure release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
    }
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }

  toString() {
    const { owner, slug } = this.configuration
    return `Bitbucket (owner: ${owner}, slug: ${slug}, channel: ${this.channel})`
  }
}
