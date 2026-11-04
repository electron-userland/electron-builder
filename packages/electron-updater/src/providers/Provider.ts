import {
  ApiRequestOptions,
  CancellationToken,
  configureRequestUrl,
  CrossOriginHeaderPolicy,
  DEFAULT_MAX_UPDATE_INFO_SIZE,
  HttpExecutor,
  newError,
  safeStringifyJson,
  UpdateFileInfo,
  UpdateInfo,
  WindowsUpdateInfo,
} from "builder-util-runtime"
import { OutgoingHttpHeaders } from "http"
import { EventType, load, State } from "js-yaml"
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
   * Chooses the request headers each update info request (e.g. a channel file) on another origin than `Provider.feedBaseUrl` sends: the
   * updater's, which asks the app's `crossOriginHeaders`. Set by electron-updater; code that constructs a built-in provider passes on the
   * runtime options it was given. Without a function, the provider's constructor throws `ERR_UPDATER_CROSS_ORIGIN_HEADER_POLICY_MISSING`.
   */
  crossOriginHeaderPolicy: CrossOriginHeaderPolicy
}

/**
 * The `feedBaseUrl` of `provider`, checked at run time: a custom provider written in plain JavaScript, or built on another copy of
 * electron-updater, may return something else. Anything but a URL fails with `ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED`, before any request
 * header is handed to the provider or sent.
 */
export function feedBaseUrlOf(provider: Provider<any>): URL {
  const url: unknown = provider.feedBaseUrl
  if (url instanceof URL) {
    return url
  }
  const value = url === null ? "null, which does not send the request headers to every origin" : url === undefined ? "undefined" : `a ${typeof url}`
  throw newError(
    `The feedBaseUrl of the update provider ${provider.constructor.name} is ${value}: every provider returns the URL of its update feed there, the only origin that gets every request header. ` +
      `Return the base URL of the update files, e.g. of the channel file. https://www.electron.build/docs/migration/v27-developer-changes#custom-provider-feed-base-url`,
    "ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED"
  )
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
    // plain JavaScript, or runtime options built by hand, can leave it out: without it no request to another origin could choose its headers
    const policy: unknown = runtimeOptions.crossOriginHeaderPolicy
    if (typeof policy !== "function") {
      throw newError(
        `The runtime options of the update provider ${new.target.name} have no crossOriginHeaderPolicy (got ${policy === null ? "null" : typeof policy}): ` +
          `pass on the runtime options electron-updater gave your code, spreading them to change another field. https://www.electron.build/docs/migration/v27-developer-changes#custom-provider-feed-base-url`,
        "ERR_UPDATER_CROSS_ORIGIN_HEADER_POLICY_MISSING"
      )
    }
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
   * Required. Base URL of the update feed: download URLs, and the URLs of the provider's own update info requests (e.g. the channel file),
   * on its origin get every request header. Any other origin gets only the headers the app's `crossOriginHeaders` keeps, with this URL as
   * the hop's `from`. Anything but a URL fails the update check with `ERR_UPDATER_FEED_BASE_URL_NOT_DECLARED`.
   */
  abstract get feedBaseUrl(): URL

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

  /**
   * Options for an update info request to `url`, with the updater's request headers and `headers`, the provider's own for this request (an
   * `Accept`, a token). On another origin than {@link feedBaseUrl} all of them go through the app's `crossOriginHeaders`, and the `Accept` of
   * `headers` is added back (see `ApiRequestOptions.ownHeaders`), also on a redirect to another origin.
   */
  protected createRequestOptions(url: URL, headers?: OutgoingHttpHeaders | null): ApiRequestOptions {
    const result: ApiRequestOptions = {}
    const requestHeaders = this.requestHeaders
    const merged = requestHeaders == null ? headers : headers == null ? requestHeaders : { ...requestHeaders, ...headers }
    const ownHeaders = acceptHeaderOf(headers)
    if (merged != null) {
      result.headers = HttpExecutor.crossOriginHeaders(merged, ownHeaders, { from: feedBaseUrlOf(this), to: url }, this.runtimeOptions.crossOriginHeaderPolicy)
    }
    if (ownHeaders != null) {
      result.ownHeaders = ownHeaders
    }

    configureRequestUrl(url, result)
    return result
  }
}

/** The `Accept` of `headers` (any case), which the updater or the provider builds for a request: added back after the app's crossOriginHeaders. */
export function acceptHeaderOf(headers: OutgoingHttpHeaders | null | undefined): OutgoingHttpHeaders | null {
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value != null && name.toLowerCase() === "accept") {
      return { [name]: value }
    }
  }
  return null
}

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

// The channel file URL as error messages name it: newUrlFromBase copies the feed URL's query (which may carry a token such as `?token=`)
// onto it, and the updater logs these errors, so only its origin and path are named.
function describeChannelFileUrl(channelFileUrl: URL): string {
  return `${channelFileUrl.origin}${channelFileUrl.pathname}`
}

export function parseUpdateInfo(rawData: string | null, channelFile: string, channelFileUrl: URL): UpdateInfo {
  const location = describeChannelFileUrl(channelFileUrl)
  if (rawData == null) {
    throw newError(`Cannot parse update info from ${channelFile} in the latest release artifacts (${location}): rawData: null`, "ERR_UPDATER_INVALID_UPDATE_INFO")
  }

  // js-yaml returns an aliased node by reference, so a few hundred bytes of nested aliases can reach a value exponentially often,
  // and a long string referenced by many aliases is read in full each time.
  // Anything that walks the update info (a deep comparison, JSON serialization) would then block the main process.
  // Without aliases, a document's keys and values, a string counted by its length, add up to at most its number of characters, so a legitimate channel file is never rejected.
  const budget = Math.max(100_000, rawData.length)
  const budgetExceeded = (): Error => yamlAliasBudgetError(channelFile, location, budget)

  // js-yaml itself expands aliases while loading: it converts a complex mapping key (`? [*a, *a]`) to a string,
  // so a few hundred KB of aliases in keys would build strings of hundreds of MB before load returns.
  // Each alias is charged with everything it reaches as soon as js-yaml reads it, before the key that holds it is converted,
  // and at least as much as it adds to that string: an aliased timestamp becomes about 60 characters of key text.
  let aliasTotal = 0
  const listener = (eventType: EventType, state: State): void => {
    // an alias is the only node that closes with a value but no kind
    if (eventType !== "close" || state.kind !== null || state.result == null) {
      return
    }
    aliasTotal = chargeExpansion(state.result, aliasTotal, budget, keyTextCost)
    if (aliasTotal > budget) {
      throw budgetExceeded()
    }
  }

  let result: UpdateInfo
  try {
    result = load(rawData, { listener }) as UpdateInfo
  } catch (e: any) {
    if (e?.code === "ERR_UPDATER_INVALID_UPDATE_INFO") {
      throw e
    }
    throw newError(
      `Cannot parse update info from ${channelFile} in the latest release artifacts (${location}): ${e.stack || e.message}, rawData: ${rawData}`,
      "ERR_UPDATER_INVALID_UPDATE_INFO"
    )
  }

  // the update info as a whole is charged by what walking it costs, so a manifest without aliases stays within the budget
  if (chargeExpansion(result, 0, budget, valueCost) > budget) {
    throw budgetExceeded()
  }
  return result
}

/** @internal */
export const YAML_ALIAS_BUDGET_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#update-manifest-yaml-aliases-are-limited"

// the errors parseUpdateInfo throws for the alias budget, so that AppUpdater can announce the v27 change without matching the message
const yamlAliasBudgetErrors = new WeakSet<Error>()

// location: the channel file URL without its query (describeChannelFileUrl)
function yamlAliasBudgetError(channelFile: string, location: string, budget: number): Error {
  const error = newError(
    `Cannot parse update info from ${channelFile} in the latest release artifacts (${location}): YAML aliases expand to more than ${budget} values and string characters. ` +
      `electron-updater 7 (electron-builder v27) rejects such a manifest: publish it without YAML aliases (js-yaml \`dump\` with \`noRefs: true\`, as electron-builder writes it) ` +
      `or with the shared values repeated inline. ${YAML_ALIAS_BUDGET_DOCS}`,
    "ERR_UPDATER_INVALID_UPDATE_INFO"
  )
  yamlAliasBudgetErrors.add(error)
  return error
}

/**
 * Whether `error` is the `ERR_UPDATER_INVALID_UPDATE_INFO` that {@link parseUpdateInfo} throws for YAML aliases that expand past the budget.
 * @internal
 */
export function isYamlAliasBudgetError(error: unknown): boolean {
  return error instanceof Error && yamlAliasBudgetErrors.has(error)
}

// adds to total every value reachable from root, root included and an aliased one each time it is referenced:
// each value by cost, and a mapping entry also by the length of its key.
// Stops once the total exceeds the budget, so a call costs at most budget - total steps.
function chargeExpansion(root: unknown, total: number, budget: number, cost: (value: unknown) => number): number {
  total += cost(root)
  const stack: Array<unknown> = [root]
  while (stack.length > 0 && total <= budget) {
    const value = stack.pop()
    if (value === null || typeof value !== "object") {
      continue
    }
    const isMapping = !Array.isArray(value)
    for (const [key, child] of Object.entries(value)) {
      total += (isMapping ? key.length : 0) + cost(child)
      if (total > budget) {
        return total
      }
      stack.push(child)
    }
  }
  return total
}

// a string its length, anything else 1: without aliases, a document's values and keys never add up to more than its number of characters
function valueCost(value: unknown): number {
  return typeof value === "string" ? Math.max(1, value.length) : 1
}

// at least what value adds to a complex mapping key, which js-yaml converts with String() (a sequence joins its items with commas):
// a scalar the length of its string form (a timestamp about 60 characters), a sequence a comma between items, any other object "[object Object]"
function keyTextCost(value: unknown): number {
  if (typeof value === "string") {
    return Math.max(1, value.length)
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value).length
  }
  if (typeof value !== "object") {
    return 1
  }
  if (value === null) {
    return "null".length
  }
  if (Array.isArray(value)) {
    return Math.max(1, value.length - 1)
  }
  if (value instanceof Date) {
    return Math.max(1, String(value).length)
  }
  return "[object Object]".length
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
