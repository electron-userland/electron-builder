import { HttpExecutor } from "electron-builder-http"
import { UpdateInfo, VersionInfo } from "electron-builder-http/out/updateInfo"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { URL } from "url"
import { CancellationToken, FileInfo, isUseOldMacProvider } from "./main"

export abstract class Provider<T extends VersionInfo> {
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
    if (info.sha2 == null && info.sha512 == null) {
      throw new Error(`Update info doesn't contain sha2 or sha512 checksum: ${JSON.stringify(info, null, 2)}`)
    }
    if (info.path == null) {
      throw new Error(`Update info doesn't contain file path: ${JSON.stringify(info, null, 2)}`)
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
