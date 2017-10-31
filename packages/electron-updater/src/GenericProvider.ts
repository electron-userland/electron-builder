import { GenericServerOptions, HttpError, HttpExecutor, UpdateInfo } from "builder-util-runtime"
import { FileInfo, getChannelFilename, getCustomChannelName, getDefaultChannelName, isUseOldMacProvider, newBaseUrl, newUrlFromBase, Provider } from "./main"
import { getUpdateFile, parseUpdateInfo } from "./Provider"

export class GenericProvider extends Provider<UpdateInfo> {
  private readonly baseUrl = newBaseUrl(this.configuration.url)
  private readonly channel = this.configuration.channel ? getCustomChannelName(this.configuration.channel) : getDefaultChannelName()

  constructor(private readonly configuration: GenericServerOptions, executor: HttpExecutor<any>) {
    super(executor)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    let result: UpdateInfo
    const channelFile = getChannelFilename(this.channel)
    const channelUrl = newUrlFromBase(channelFile, this.baseUrl)
    try {
      result = parseUpdateInfo((await this.executor.request(this.createRequestOptions(channelUrl)))!!, channelFile, channelUrl)
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`Cannot find channel "${channelFile}" update info: ${e.stack || e.message}`)
      }
      throw e
    }

    Provider.validateUpdateInfo(result)
    if (isUseOldMacProvider()) {
      (result as any).releaseJsonUrl = channelUrl.href
    }
    return result
  }

  async getUpdateFile(updateInfo: UpdateInfo): Promise<FileInfo> {
    return getUpdateFile(updateInfo, this.baseUrl)
  }
}