import { HttpError, HttpExecutor, RequestOptionsEx } from "electron-builder-http"
import { GenericServerOptions } from "electron-builder-http/out/publishOptions"
import { UpdateInfo } from "electron-builder-http/out/updateInfo"
import { safeLoad } from "js-yaml"
import * as path from "path"
import * as url from "url"
import { FileInfo, getChannelFilename, getCustomChannelName, getDefaultChannelName, isUseOldMacProvider, Provider } from "./main"

export class GenericProvider extends Provider<UpdateInfo> {
  private readonly baseUrl = url.parse(this.configuration.url)
  private readonly channel = this.configuration.channel ? getCustomChannelName(this.configuration.channel) : getDefaultChannelName()

  constructor(private readonly configuration: GenericServerOptions, private readonly executor: HttpExecutor<any>) {
    super()
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    let result: UpdateInfo
    const channelFile = getChannelFilename(this.channel)
    const pathname = path.posix.resolve(this.baseUrl.pathname || "/", channelFile)
    try {
      const options: RequestOptionsEx = {
        hostname: this.baseUrl.hostname,
        path: `${pathname}${this.baseUrl.search || ""}`,
        protocol: this.baseUrl.protocol,
        headers: this.requestHeaders || undefined,
      }
      if (this.baseUrl.port != null) {
        options.port = parseInt(this.baseUrl.port, 10)
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
      (result as any).releaseJsonUrl = url.format({...this.baseUrl, pathname} as any)
    }
    return result
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    if (isUseOldMacProvider()) {
      return versionInfo as any
    }

    const filePath = versionInfo.path
    return {
      name: path.posix.basename(filePath),
      url: (filePath.startsWith("http:") || filePath.startsWith("https:")) ? filePath : url.format({...this.baseUrl, pathname: path.posix.resolve(this.baseUrl.pathname || "/", filePath)} as any),
      sha2: versionInfo.sha2,
      sha512: versionInfo.sha512,
    }
  }
}