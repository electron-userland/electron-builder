import { CancellationToken, HttpExecutor, newError, safeStringifyJson, UpdateFileInfo, UpdateInfo, WindowsUpdateInfo, configureRequestUrl } from "builder-util-runtime"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import { URL } from "url"
import { newUrlFromBase, ResolvedUpdateFileInfo } from "../main"

export type ProviderPlatform = "darwin" | "linux" | "win32"

export interface ProviderRuntimeOptions {
  isUseMultipleRangeRequest: boolean
  platform: ProviderPlatform

  executor: HttpExecutor<any>
}

export abstract class Provider<T extends UpdateInfo> {
  private requestHeaders: OutgoingHttpHeaders | null = null
  protected readonly executor: HttpExecutor<any>

  protected constructor(private readonly runtimeOptions: ProviderRuntimeOptions) {
    this.executor = runtimeOptions.executor
  }

  get isUseMultipleRangeRequest(): boolean {
    return this.runtimeOptions.isUseMultipleRangeRequest !== false
  }

  private getChannelFilePrefix(): string {
    if (this.runtimeOptions.platform === "linux") {
      const arch = process.env.TEST_UPDATER_ARCH || process.arch
      const archSuffix = arch === "x64" ? "" : `-${arch}`
      return "-linux" + archSuffix
    }
    else {
      return this.runtimeOptions.platform === "darwin" ? "-mac" : ""
    }
  }

  // due to historical reasons for windows we use channel name without platform specifier
  protected getDefaultChannelName(): string {
    return this.getCustomChannelName("latest")
  }

  protected getCustomChannelName(channel: string): string {
    return `${channel}${this.getChannelFilePrefix()}`
  }

  get fileExtraDownloadHeaders(): OutgoingHttpHeaders | null {
    return null
  }

  setRequestHeaders(value: OutgoingHttpHeaders | null): void {
    this.requestHeaders = value
  }

  abstract getLatestVersion(): Promise<T>

  abstract resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo>

  /**
   * Method to perform API request only to resolve update info, but not to download update.
   */
  protected httpRequest(url: URL, headers?: OutgoingHttpHeaders | null, cancellationToken?: CancellationToken): Promise<string | null> {
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

    configureRequestUrl(url, result)
    return result
  }
}

export function findFile(files: Array<ResolvedUpdateFileInfo>, extension: string, not?: Array<string>): ResolvedUpdateFileInfo | null | undefined  {
  if (files.length === 0) {
    throw newError("No files provided", "ERR_UPDATER_NO_FILES_PROVIDED")
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
    throw newError(`Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): rawData: null`, "ERR_UPDATER_INVALID_UPDATE_INFO")
  }

  let result: UpdateInfo
  try {
    result = safeLoad(rawData) as UpdateInfo
  }
  catch (e) {
    throw newError(`Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}, rawData: ${rawData}`, "ERR_UPDATER_INVALID_UPDATE_INFO")
  }
  return result
}

export function getFileList(updateInfo: UpdateInfo): Array<UpdateFileInfo> {
  const files = updateInfo.files
  if (files != null && files.length > 0) {
    return files
  }

  // noinspection JSDeprecatedSymbols
  if (updateInfo.path != null) {
    // noinspection JSDeprecatedSymbols
    return [
      {
        url: updateInfo.path,
        sha2: (updateInfo as any).sha2,
        sha512: updateInfo.sha512,
      } as any,
    ]
  }
  else {
    throw newError(`No files provided: ${safeStringifyJson(updateInfo)}`, "ERR_UPDATER_NO_FILES_PROVIDED")
  }
}

export function resolveFiles(updateInfo: UpdateInfo, baseUrl: URL, pathTransformer: (p: string) => string = (p: string): string => p): Array<ResolvedUpdateFileInfo> {
  const files = getFileList(updateInfo)
  const result: Array<ResolvedUpdateFileInfo> = files.map(fileInfo => {
    if ((fileInfo as any).sha2 == null && fileInfo.sha512 == null) {
      throw newError(`Update info doesn't contain nor sha256 neither sha512 checksum: ${safeStringifyJson(fileInfo)}`, "ERR_UPDATER_NO_CHECKSUM")
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