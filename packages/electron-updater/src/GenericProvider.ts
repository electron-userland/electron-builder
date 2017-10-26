import { GenericServerOptions, HttpError, HttpExecutor, UpdateInfo, WindowsUpdateInfo } from "builder-util-runtime"
import * as path from "path"
import { FileInfo, getChannelFilename, getCustomChannelName, getDefaultChannelName, isUseOldMacProvider, newBaseUrl, newUrlFromBase, Provider } from "./main"
import { getUpdateFileUrl, parseUpdateInfo } from "./Provider"

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
    if (isUseOldMacProvider()) {
      return updateInfo as any
    }

    const updateFileUrl = getUpdateFileUrl(updateInfo)
    const result: FileInfo = {
      name: path.posix.basename(updateFileUrl),
      url: newUrlFromBase(updateFileUrl, this.baseUrl).href,
      sha512: updateInfo.sha512,
    }

    const packages = (updateInfo as WindowsUpdateInfo).packages
    const packageInfo = packages == null ? null : (packages[process.arch] || packages.ia32)
    if (packageInfo != null) {
      result.packageInfo = {
        ...packageInfo,
        // .file - backward compatibility
        path: newUrlFromBase(packageInfo.path || (packageInfo as any).file, this.baseUrl).href,
      }
    }
    return result
  }
}