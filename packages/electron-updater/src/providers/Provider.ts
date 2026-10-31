import {
  ApiRequestOptions,
  CancellationToken,
  configureRequestUrl,
  DEFAULT_MAX_UPDATE_INFO_SIZE,
  HttpExecutor,
  newError,
  safeStringifyJson,
  UpdateFileInfo,
  UpdateInfo,
  WindowsUpdateInfo,
} from "builder-util-runtime"
import { OutgoingHttpHeaders } from "http"
import { load } from "js-yaml"
import { URL } from "url"
import { ElectronHttpExecutor } from "../electronHttpExecutor.js"
import { ResolvedUpdateFileInfo } from "../types.js"
import { newUrlFromBase } from "../util.js"
import escapeRegExp from "lodash.escaperegexp"

export type ProviderPlatform = "darwin" | "linux" | "win32"

export interface ProviderRuntimeOptions {
  isUseMultipleRangeRequest: boolean
  platform: ProviderPlatform

  executor: ElectronHttpExecutor

  /**
   * Called when an update info request (e.g. a channel file) goes to another origin than `Provider.feedBaseUrl` and so is sent
   * without the credential headers `headerNames` (names only, never values). The updater warns about it once.
   */
  onCrossOriginHeadersRemoved?: (url: URL, feedBaseUrl: URL, headerNames: Array<string>) => void
}

// Shared by the GitHub/GitLab/PrivateGitHub providers when a release channel file (e.g. latest.yml) 404s.
export function channelFileNotFoundError(channelFile: string, channelFileUrl: URL | string, e: any): Error {
  return newError(`Cannot find ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
}

export abstract class Provider<T extends UpdateInfo> {
  private requestHeaders: OutgoingHttpHeaders | null = null
  // the size limit of channel files (see channelFileRequest), 0 for none
  private maxUpdateInfoSize = DEFAULT_MAX_UPDATE_INFO_SIZE
  protected readonly executor: ElectronHttpExecutor

  protected constructor(private readonly runtimeOptions: ProviderRuntimeOptions) {
    this.executor = runtimeOptions.executor
  }

  // By default, the blockmap file is in the same directory as the main file
  // But some providers may have a different blockmap file, so we need to override this method
  getBlockMapFiles(baseUrl: URL, oldVersion: string, newVersion: string, oldBlockMapFileBaseUrl: string | null = null): URL[] | Promise<URL[]> {
    const newBlockMapUrl = newUrlFromBase(`${baseUrl.pathname}.blockmap`, baseUrl)
    const oldBlockMapUrl = newUrlFromBase(
      `${baseUrl.pathname.replace(new RegExp(escapeRegExp(newVersion), "g"), oldVersion)}.blockmap`,
      oldBlockMapFileBaseUrl ? new URL(oldBlockMapFileBaseUrl) : baseUrl
    )

    return [oldBlockMapUrl, newBlockMapUrl]
  }

  get isUseMultipleRangeRequest(): boolean {
    return this.runtimeOptions.isUseMultipleRangeRequest !== false
  }

  private getChannelFilePrefix(): string {
    if (this.runtimeOptions.platform === "linux") {
      const arch = process.env["TEST_UPDATER_ARCH"] || process.arch
      const archSuffix = arch === "x64" ? "" : `-${arch}`
      return "-linux" + archSuffix
    } else {
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

  /**
   * Base URL of the update feed: the credential-bearing request headers (the ones stripped on a cross-origin redirect) are only sent to
   * download URLs, and to the URLs of the provider's own update info requests (e.g. the channel file), on its origin. `null` sends the
   * request headers to every URL.
   * The default, `undefined`, means not declared: a download with credential headers (from `requestHeaders` / `addAuthHeader`) then fails
   * with `ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED`, so a custom provider used with credentials must override this getter.
   */
  get feedBaseUrl(): URL | null | undefined {
    return undefined
  }

  setRequestHeaders(value: OutgoingHttpHeaders | null): void {
    this.requestHeaders = value
  }

  /**
   * The largest channel file (`latest*.yml`) read, in bytes (`0` for no limit). Set by AppUpdater before each update check, from
   * `autoUpdater.maxUpdateInfoSize` or the `maxUpdateInfoSize` of the publish configuration.
   */
  setMaxUpdateInfoSize(value: number): void {
    this.maxUpdateInfoSize = value
  }

  abstract getLatestVersion(): Promise<T>

  abstract resolveFiles(updateInfo: T): Array<ResolvedUpdateFileInfo>

  /**
   * Method to perform API request only to resolve update info, but not to download update.
   */
  protected httpRequest(url: URL, headers?: OutgoingHttpHeaders | null, cancellationToken?: CancellationToken): Promise<string | null> {
    return this.executor.request(this.createRequestOptions(url, headers), cancellationToken)
  }

  /**
   * {@link httpRequest} for a channel file (`latest*.yml`), which is read into memory and parsed before anything verifies it: a response
   * larger than `maxUpdateInfoSize` fails with `ERR_HTTP_RESPONSE_TOO_LARGE` (see ApiRequestOptions.maxResponseSize). Channel files are
   * a few KB. Release feeds and API responses (release listings and lookups) are not limited: their size depends on the release history.
   */
  protected async channelFileRequest(url: URL, headers?: OutgoingHttpHeaders | null, cancellationToken?: CancellationToken): Promise<string | null> {
    const options: ApiRequestOptions = this.createRequestOptions(url, headers)
    // 0 is no limit, while a maxResponseSize of 0 would only allow an empty response
    if (this.maxUpdateInfoSize !== 0) {
      options.maxResponseSize = this.maxUpdateInfoSize
    }
    try {
      return await this.executor.request(options, cancellationToken)
    } catch (e: unknown) {
      // names the options that raise the limit
      if (e instanceof Error && "code" in e && e.code === "ERR_HTTP_RESPONSE_TOO_LARGE") {
        throw newError(
          `${e.message}: raise the limit with maxUpdateInfoSize in the publish configuration (app-update.yml) or autoUpdater.maxUpdateInfoSize`,
          "ERR_HTTP_RESPONSE_TOO_LARGE"
        )
      }
      throw e
    }
  }

  protected createRequestOptions(url: URL, headers?: OutgoingHttpHeaders | null): ApiRequestOptions {
    const result: ApiRequestOptions = {}
    // the same feed-origin rule as for downloads: e.g. a channel file on another origin gets no credential headers
    const feedBaseUrl = this.feedBaseUrl
    let requestHeaders = this.requestHeaders
    if (requestHeaders != null && feedBaseUrl != null && HttpExecutor.isCrossOrigin(feedBaseUrl, url)) {
      const headerNames = HttpExecutor.sensitiveHeaderNames(requestHeaders)
      requestHeaders = HttpExecutor.removeCrossOriginSensitiveHeaders(requestHeaders, feedBaseUrl, url)
      if (headerNames.length !== 0) {
        this.runtimeOptions.onCrossOriginHeadersRemoved?.(url, feedBaseUrl, headerNames)
      }
    }
    if (requestHeaders == null) {
      if (headers != null) {
        result.headers = headers
      }
    } else {
      result.headers = headers == null ? requestHeaders : { ...requestHeaders, ...headers }
    }

    configureRequestUrl(url, result)
    return result
  }
}

// without `not`, the first file is the fallback, and `files` is not empty: a file is always found
export function findFile(files: Array<ResolvedUpdateFileInfo>, extension: string): ResolvedUpdateFileInfo
export function findFile(files: Array<ResolvedUpdateFileInfo>, extension: string, not?: Array<string>): ResolvedUpdateFileInfo | null | undefined
export function findFile(files: Array<ResolvedUpdateFileInfo>, extension: string, not?: Array<string>): ResolvedUpdateFileInfo | null | undefined {
  if (files.length === 0) {
    throw newError("No files provided", "ERR_UPDATER_NO_FILES_PROVIDED")
  }

  const filteredFiles = files.filter(it => it.url.pathname.toLowerCase().endsWith(`.${extension.toLowerCase()}`))
  const result = filteredFiles.find(it => [it.url.pathname, it.info.url].some(n => n.includes(process.arch))) ?? filteredFiles.shift()

  if (result) {
    return result
  } else if (not == null) {
    return files[0]
  } else {
    return files.find(fileInfo => !not.some(ext => fileInfo.url.pathname.toLowerCase().endsWith(`.${ext.toLowerCase()}`)))
  }
}

export function parseUpdateInfo(rawData: string | null, channelFile: string, channelFileUrl: URL): UpdateInfo {
  if (rawData == null) {
    throw newError(`Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): rawData: null`, "ERR_UPDATER_INVALID_UPDATE_INFO")
  }

  let result: UpdateInfo
  try {
    result = load(rawData) as UpdateInfo
  } catch (e: any) {
    throw newError(
      `Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}, rawData: ${rawData}`,
      "ERR_UPDATER_INVALID_UPDATE_INFO"
    )
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
  } else {
    throw newError(`No files provided: ${safeStringifyJson(updateInfo)}`, "ERR_UPDATER_NO_FILES_PROVIDED")
  }
}

// An absolute blockMapUrl (e.g. a separately pre-signed URL) is used as-is: a provider's path transformer (such as GitHub's release
// download path) only applies to a relative one, which resolves against the feed like `url`.
function resolveBlockMapUrl(blockMapUrl: string, baseUrl: URL, pathTransformer: (p: string) => string): URL {
  return newUrlFromBase(/^[a-z][a-z\d+.-]*:/i.test(blockMapUrl) ? blockMapUrl : pathTransformer(blockMapUrl), baseUrl)
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
      ...(fileInfo.blockMapUrl == null ? {} : { blockMapUrl: resolveBlockMapUrl(fileInfo.blockMapUrl, baseUrl, pathTransformer) }),
    }
  })

  const packages = (updateInfo as WindowsUpdateInfo).packages
  const packageInfo = packages == null ? null : packages[process.arch] || packages.ia32
  if (packageInfo != null) {
    ;(result[0] as any).packageInfo = {
      ...packageInfo,
      path: newUrlFromBase(pathTransformer(packageInfo.path), baseUrl).href,
    }
  }
  return result
}
