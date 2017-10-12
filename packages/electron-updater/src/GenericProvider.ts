import { GenericServerOptions, HttpError, HttpExecutor, UpdateInfo, WindowsUpdateInfo } from "builder-util-runtime"
import { RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { FileInfo, getChannelFilename, getCustomChannelName, getDefaultChannelName, isUseOldMacProvider, newBaseUrl, newUrlFromBase, Provider } from "./main"

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
      const options: RequestOptions = {
        hostname: channelUrl.hostname,
        path: `${channelUrl.pathname}${channelUrl.search}`,
        protocol: channelUrl.protocol,
        headers: this.requestHeaders || undefined,
      }
      if (channelUrl.port != null) {
        options.port = channelUrl.port
      }
      result = safeLoad((await this.executor.request(options))!!)
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

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    if (isUseOldMacProvider()) {
      return versionInfo as any
    }

    const filePath = versionInfo.path
    const result: FileInfo = {
      name: path.posix.basename(filePath),
      url: newUrlFromBase(filePath, this.baseUrl).href,
      sha512: versionInfo.sha512,
    }

    const packages = (versionInfo as WindowsUpdateInfo).packages
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