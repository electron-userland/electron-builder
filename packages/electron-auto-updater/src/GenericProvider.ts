import { Provider, FileInfo, getDefaultChannelName, getChannelFilename, getCurrentPlatform } from "./api"
import { GenericServerOptions, UpdateInfo } from "electron-builder-http/out/publishOptions"
import * as url from "url"
import * as path from "path"
import { HttpError, request } from "electron-builder-http"

export class GenericProvider implements Provider<UpdateInfo> {
  private readonly baseUrl = url.parse(this.configuration.url)
  private readonly channel = this.configuration.channel || getDefaultChannelName()

  constructor(private readonly configuration: GenericServerOptions) {
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    let result: UpdateInfo | null = null
    const channelFile = getChannelFilename(this.channel)
    const pathname = path.posix.resolve(this.baseUrl.pathname || "/", `${channelFile}`)
    try {
      result = await request<UpdateInfo>({hostname: this.baseUrl.hostname, port: this.baseUrl.port || "443", path: `${pathname}${this.baseUrl.search || ""}`, protocol: this.baseUrl.protocol})
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`Cannot find channel "${channelFile}" update info: ${e.stack || e.message}`)
      }
      throw e
    }

    validateUpdateInfo(result)
    if (getCurrentPlatform() === "darwin") {
      (<any>result).releaseJsonUrl = url.format(Object.assign({}, this.baseUrl, {pathname: pathname}))
    }
    return result
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    if (getCurrentPlatform() === "darwin") {
      return <any>versionInfo
    }

    return {
      name: path.posix.basename(versionInfo.path),
      url: url.format(Object.assign({}, this.baseUrl, {pathname: path.posix.resolve(this.baseUrl.pathname || "/", versionInfo.path)})),
      sha2: versionInfo.sha2,
    }
  }
}

// sha2 is required only for windows because on macOS update is verified by Squirrel.Mac
export function validateUpdateInfo(info: UpdateInfo) {
  if (getCurrentPlatform() === "darwin") {
    if ((<any>info).url == null) {
      throw new Error("Update info doesn't contain url")
    }
    return
  }

  if (info.sha2 == null ) {
    throw new Error(`Update info doesn't contain sha2 checksum: ${JSON.stringify(info, null, 2)}`)
  }
  if (info.path == null) {
    throw new Error(`Update info doesn't contain file path: ${JSON.stringify(info, null, 2)}`)
  }
}