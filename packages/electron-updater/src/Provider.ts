import { CancellationToken, HttpExecutor, safeStringifyJson, UpdateInfo, WindowsUpdateInfo, asArray } from "builder-util-runtime"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { URL } from "url"
import { FileInfo, isUseOldMacProvider, newUrlFromBase } from "./main"
import { safeLoad } from "js-yaml"

export abstract class Provider<T extends UpdateInfo> {
  protected requestHeaders: OutgoingHttpHeaders | null

  constructor(protected readonly executor: HttpExecutor<any>) {
  }

  setRequestHeaders(value: OutgoingHttpHeaders | null): void {
    this.requestHeaders = value
  }

  abstract getLatestVersion(): Promise<T>

  abstract getUpdateFile(versionInfo: T): Promise<FileInfo>

  static validateUpdateInfo(info: UpdateInfo) {
    if (isUseOldMacProvider()) {
      if ((info as any).url == null) {
        throw new Error("Update info doesn't contain url")
      }
      return
    }

    // noinspection JSDeprecatedSymbols
    if ((info as WindowsUpdateInfo).sha2 == null && info.sha512 == null) {
      throw new Error(`Update info doesn't contain nor sha256 neither sha512 checksum: ${safeStringifyJson(info)}`)
    }
    if (info.path == null) {
      throw new Error(`Update info doesn't contain file path: ${safeStringifyJson(info)}`)
    }
  }

  protected httpRequest(url: URL, headers: OutgoingHttpHeaders | null, cancellationToken: CancellationToken) {
    return this.executor.request(this.createRequestOptions(url, headers), cancellationToken)
  }

  protected createRequestOptions(url: URL, headers?: OutgoingHttpHeaders | null): RequestOptions {
    const result: RequestOptions = {}
    if (this.requestHeaders == null) {
      if (headers != null) {
        result.headers = headers
      }
    }
    else {
      result.headers = headers == null ? this.requestHeaders : {...this.requestHeaders, ...headers}
    }

    result.protocol = url.protocol
    result.hostname = url.hostname
    if (url.port) {
      result.port = url.port
    }
    result.path = url.pathname + url.search
    return result
  }
}

export function parseUpdateInfo(rawData: string, channelFile: string, channelFileUrl: URL): UpdateInfo {
  let result: UpdateInfo
  try {
    result = safeLoad(rawData)
  }
  catch (e) {
    throw new Error(`Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}, rawData: ${rawData}`)
  }
  Provider.validateUpdateInfo(result)
  return result
}

export function getUpdateFileUrl(info: UpdateInfo) {
  const result = info.path
  if (result != null) {
    return result
  }
  return asArray(info.url)[0]
}

export function createFileInfo(updateInfo: UpdateInfo, baseUrl: URL, updateFileUrl: string = getUpdateFileUrl(updateInfo)): FileInfo {
  return {
    url: newUrlFromBase(updateFileUrl, baseUrl).href,
    sha512: updateInfo.sha512,
  }
}