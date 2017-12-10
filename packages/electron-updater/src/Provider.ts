import { CancellationToken, HttpExecutor, safeStringifyJson, UpdateFileInfo, UpdateInfo, WindowsUpdateInfo } from "builder-util-runtime"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import { URL } from "url"
import { newUrlFromBase, ResolvedUpdateFileInfo } from "./main"

export abstract class Provider<T extends UpdateInfo> {
  protected requestHeaders: OutgoingHttpHeaders | null

  constructor(protected readonly executor: HttpExecutor<any>, readonly useMultipleRangeRequest = true) {
  }

  get fileExtraDownloadHeaders(): OutgoingHttpHeaders | null {
    return null
  }

  setRequestHeaders(value: OutgoingHttpHeaders | null): void {
    this.requestHeaders = value
  }

  abstract getLatestVersion(): Promise<T>

  abstract resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo>

  httpRequest(url: URL, headers?: OutgoingHttpHeaders | null, cancellationToken?: CancellationToken) {
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

export function findFile(files: Array<ResolvedUpdateFileInfo>, extension: string, not?: Array<string>): ResolvedUpdateFileInfo | null | undefined  {
  if (files.length === 0) {
    throw new Error("No files provided")
  }

  const result = files.find(it => it.url.pathname.toLowerCase().endsWith(`.${extension}`))
  if (result != null) {
    return result
  }
  else if (not == null) {
    return files[0]
  }
  else {
    return files.find(fileInfo => !not.some(ext => fileInfo.url.pathname.toLowerCase().endsWith(`.${ext}`)))
  }
}

export function parseUpdateInfo(rawData: string | null, channelFile: string, channelFileUrl: URL): UpdateInfo {
  if (rawData == null) {
    throw new Error(`Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): rawData: null`)
  }

  let result: UpdateInfo
  try {
    result = safeLoad(rawData)
  }
  catch (e) {
    throw new Error(`Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}, rawData: ${rawData}`)
  }
  return result
}

export function getFileList(updateInfo: UpdateInfo): Array<UpdateFileInfo> {
  const files = updateInfo.files
  if (files != null && files.length > 0) {
    return files
  }

  if (updateInfo.path != null) {
    return [
      {
        url: updateInfo.path,
        sha512: updateInfo.sha512,
      },
    ]
  }
  else {
    throw new Error(`No files provided: ${safeStringifyJson(updateInfo)}`)
  }
}

export function resolveFiles(updateInfo: UpdateInfo, baseUrl: URL, pathTransformer: (p: string) => string = p => p): Array<ResolvedUpdateFileInfo> {
  const files = getFileList(updateInfo)
  const result: Array<ResolvedUpdateFileInfo> = files.map(fileInfo => {
    if ((fileInfo as any).sha2 == null && fileInfo.sha512 == null) {
      throw new Error(`Update info doesn't contain nor sha256 neither sha512 checksum: ${safeStringifyJson(fileInfo)}`)
    }
    return {
      url: newUrlFromBase(pathTransformer(fileInfo.url), baseUrl),
      info: fileInfo,
    }
  })

  const packages = (updateInfo as WindowsUpdateInfo).packages
  const packageInfo = packages == null ? null : (packages[process.arch] || packages.ia32)
  if (packageInfo != null) {
    (result[0] as any).packageInfo = {
      ...packageInfo,
      path: newUrlFromBase(pathTransformer(packageInfo.path), baseUrl).href,
    }
  }
  return result
}