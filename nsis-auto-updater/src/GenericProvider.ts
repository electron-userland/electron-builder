import { Provider, FileInfo } from "./api"
import { GenericServerOptions, UpdateInfo } from "../../src/options/publishOptions"
import * as url from "url"
import * as path from "path"
import { HttpError, request } from "../../src/util/httpExecutor"

export class GenericProvider implements Provider<UpdateInfo> {
  private readonly baseUrl = url.parse(this.configuration.url)
  private readonly channel = this.configuration.channel || "latest"

  constructor(private readonly configuration: GenericServerOptions) {
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    let result: UpdateInfo | null = null
    try {
      const pathname = path.posix.resolve(this.baseUrl.pathname || "/", `${this.channel}.yml`)
      result = await request<UpdateInfo>({hostname: this.baseUrl.hostname, port: this.baseUrl.port || "443", path: `${pathname}${this.baseUrl.search || ""}`})
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`Cannot find channel "${this.channel}" update info: ${e.stack || e.message}`)
      }
      throw e
    }

    validateUpdateInfo(result)
    return result
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    return {
      name: path.posix.basename(versionInfo.path),
      url: url.format(Object.assign({}, this.baseUrl, {pathname: path.posix.resolve(this.baseUrl.pathname || "/", versionInfo.path)})),
      sha2: versionInfo.sha2,
    }
  }
}

export function validateUpdateInfo(info: UpdateInfo) {
  if (info.sha2 == null) {
    throw new Error("Update info doesn't contain sha2 checksum")
  }
  if (info.path == null) {
    throw new Error("Update info doesn't contain file path")
  }
}