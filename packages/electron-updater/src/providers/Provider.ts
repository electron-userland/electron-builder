import {
  ApiRequestOptions,
  CancellationToken,
  configureRequestUrl,
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

// The update info (channel file, release feed, API response) is read into memory and parsed before anything verifies it: a larger
// response fails the request (see ApiRequestOptions.maxResponseSize). Real ones are a few KB, a GitHub release list a few MB.
const MAX_UPDATE_INFO_RESPONSE_SIZE = 10 * 1024 * 1024

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

  abstract getLatestVersion(): Promise<T>

  abstract resolveFiles(updateInfo: T): Array<ResolvedUpdateFileInfo>

  /**
   * Method to perform API request only to resolve update info, but not to download update.
   */
  protected httpRequest(url: URL, headers?: OutgoingHttpHeaders | null, cancellationToken?: CancellationToken): Promise<string | null> {
    return this.executor.request(this.createRequestOptions(url, headers), cancellationToken)
  }

  protected createRequestOptions(url: URL, headers?: OutgoingHttpHeaders | null): ApiRequestOptions {
    const result: ApiRequestOptions = { maxResponseSize: MAX_UPDATE_INFO_RESPONSE_SIZE }
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

// arch suffixes of per-arch artifacts; a universal build runs on every arch, so it is not one of them
const FILE_NAME_ARCHS = ["ia32", "x64", "armv7l", "arm64"]

export function findFile(files: Array<ResolvedUpdateFileInfo>, extension: string, not?: Array<string>): ResolvedUpdateFileInfo | null | undefined {
  if (files.length === 0) {
    throw newError("No files provided", "ERR_UPDATER_NO_FILES_PROVIDED")
  }

  const filteredFiles = files.filter(it => it.url.pathname.toLowerCase().endsWith(`.${extension.toLowerCase()}`))
  const namesArch = (it: ResolvedUpdateFileInfo, arch: string) => [it.url.pathname, it.info.url].some(n => n.includes(arch))
  // Picked by name, not by position: the order of files is not covered by the update manifest signature.
  // The default arch's file has no arch suffix (e.g. `App Setup 1.0.0.exe` next to `App Setup 1.0.0-arm64.exe`), so without a file named for this arch,
  // one that names no other arch is preferred.
  const result = filteredFiles.find(it => namesArch(it, process.arch)) ?? filteredFiles.find(it => !FILE_NAME_ARCHS.some(arch => namesArch(it, arch))) ?? filteredFiles.shift()

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

  // js-yaml returns an aliased node by reference, so a few hundred bytes of nested aliases can reach a value exponentially often,
  // and a long string referenced by many aliases is read in full each time.
  // Anything that walks the update info (a deep comparison, JSON serialization) would then block the main process.
  // Without aliases, a document's keys and values, a string counted by its length, add up to at most its number of characters, so a legitimate channel file is never rejected.
  const budget = Math.max(100_000, rawData.length)
  if (exceedsExpansionBudget(result, budget)) {
    throw newError(
      `Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): YAML aliases expand to more than ${budget} values and string characters`,
      "ERR_UPDATER_INVALID_UPDATE_INFO"
    )
  }
  return result
}

// charges every value reachable from root, an aliased one each time it is referenced: a string by its length, anything else as 1,
// and a mapping entry also by the length of its key. Stops once the total exceeds the budget.
function exceedsExpansionBudget(root: unknown, budget: number): boolean {
  let total = 0
  const stack: Array<unknown> = [root]
  while (stack.length > 0) {
    const value = stack.pop()
    if (value === null || typeof value !== "object") {
      continue
    }
    const isMapping = !Array.isArray(value)
    for (const [key, child] of Object.entries(value)) {
      total += (isMapping ? key.length : 0) + (typeof child === "string" ? Math.max(1, child.length) : 1)
      if (total > budget) {
        return true
      }
      stack.push(child)
    }
  }
  return false
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
