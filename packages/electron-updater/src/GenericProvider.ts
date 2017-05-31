import { HttpError, request } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { GenericServerOptions, UpdateInfo } from "electron-builder-http/out/publishOptions"
import { RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import * as path from "path"
import * as url from "url"
import { FileInfo, getChannelFilename, getCustomChannelName, getDefaultChannelName, isUseOldMacProvider, Provider } from "./main"

export class GenericProvider extends Provider<UpdateInfo> {
  private readonly baseUrl = url.parse(this.configuration.url)
  private readonly channel = this.configuration.channel ? getCustomChannelName(this.configuration.channel) : getDefaultChannelName()

  constructor(private readonly configuration: GenericServerOptions) {
    super()
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    let result: UpdateInfo
    const channelFile = getChannelFilename(this.channel)
    const pathname = path.posix.resolve(this.baseUrl.pathname || "/", channelFile)
    try {
      const options: RequestOptions = {
        hostname: this.baseUrl.hostname,
        path: `${pathname}${this.baseUrl.search || ""}`,
        protocol: this.baseUrl.protocol,
        headers: this.requestHeaders || undefined
      }
      if (this.baseUrl.port != null) {
        options.port = parseInt(this.baseUrl.port, 10)
      }
      result = safeLoad(await request<string>(options, new CancellationToken()))
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`Cannot find channel "${channelFile}" update info: ${e.stack || e.message}`)
      }
      throw e
    }

    Provider.validateUpdateInfo(result)
    if (isUseOldMacProvider()) {
      (<any>result).releaseJsonUrl = url.format(Object.assign({}, this.baseUrl, {pathname: pathname}))
    }
    return result
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    if (isUseOldMacProvider()) {
      return <any>versionInfo
    }

    return {
      name: path.posix.basename(versionInfo.path),
      url: url.format(Object.assign({}, this.baseUrl, {pathname: path.posix.resolve(this.baseUrl.pathname || "/", versionInfo.path)})),
      sha2: versionInfo.sha2,
      sha512: versionInfo.sha512,
    }
  }
}