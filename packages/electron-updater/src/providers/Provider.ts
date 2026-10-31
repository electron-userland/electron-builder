import {
  ApiRequestOptions,
  CancellationToken,
  configureRequestUrl,
  CrossOriginHeadersCallback,
  CrossOriginHeadersLayer,
  CrossOriginRequest,
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
   * The app's choice of the request headers each update info request (e.g. a channel file) on another origin than `Provider.feedBaseUrl`
   * gets, after the provider's {@link Provider.crossOriginHeaders} (the `crossOriginHeaders` of `AppUpdater.checkForUpdates`); without
   * it, the provider's choice.
   */
  crossOriginHeaders?: CrossOriginHeadersCallback
}

/**
 * Throws `ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED` when `provider` has no `crossOriginHeaders` method (e.g. a custom provider
 * written in plain JavaScript): every provider chooses the headers its requests send to another origin.
 */
export function checkCrossOriginHeadersImplemented(provider: Provider<any>): void {
  if (typeof Reflect.get(provider, "crossOriginHeaders") !== "function") {
    throw newError(
      `The update provider ${provider.constructor.name} has no crossOriginHeaders method: each provider chooses the headers its requests and redirects send to another origin, ` +
        `before the app's checkForUpdates({ crossOriginHeaders }). Implement crossOriginHeaders(defaults, request) and return defaults to use the built-in list. ` +
        `https://www.electron.build/docs/migration/v27-developer-changes#custom-provider-cross-origin-headers`,
      "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED"
    )
  }
}

/**
 * The two layers that choose the headers of a request or redirect of `provider` to another origin: {@link Provider.crossOriginHeaders}
 * gets `DEFAULT_CROSS_ORIGIN_HEADERS`, and `app` (the `crossOriginHeaders` of `AppUpdater.checkForUpdates`) gets what the provider returned
 * (every header name of the request for `null`) and decides. Without a provider (a redirect before any update check), only `app`.
 */
export function crossOriginHeadersLayers(provider: Provider<any> | null, app: CrossOriginHeadersCallback): ReadonlyArray<CrossOriginHeadersLayer> {
  const appLayer: CrossOriginHeadersLayer = { name: "crossOriginHeaders of checkForUpdates", crossOriginHeaders: app }
  if (provider == null) {
    return [appLayer]
  }
  return [
    {
      name: `crossOriginHeaders of the update provider ${provider.constructor.name}`,
      crossOriginHeaders: (defaults, request) => {
        checkCrossOriginHeadersImplemented(provider)
        return provider.crossOriginHeaders(defaults, request)
      },
    },
    appLayer,
  ]
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
   * Base URL of the update feed: download URLs, and the URLs of the provider's own update info requests (e.g. the channel file), on its
   * origin get every request header. For any other origin, {@link Provider.crossOriginHeaders} and then the app's `crossOriginHeaders`
   * (of `AppUpdater.checkForUpdates`) choose the headers, with the feed URL as the request's `from`. `null` or `undefined` (the default):
   * the provider has no feed URL, so they choose the headers of every request, with `from` set to `null`.
   */
  get feedBaseUrl(): URL | null | undefined {
    return undefined
  }

  /**
   * Required. Chooses the headers a request or redirect sends to `request.to` when it is not on the feed's origin, or to any URL when
   * there is no feed URL ({@link Provider.feedBaseUrl}, `request.from` is then `null`). Gets `DEFAULT_CROSS_ORIGIN_HEADERS` of
   * builder-util-runtime (`accept`, `user-agent`, `range` and other content negotiation, caching and conditional headers) and returns the
   * header names to send (case-insensitive), or `null` for every header of that request. The app's `crossOriginHeaders` (of
   * `AppUpdater.checkForUpdates`) then gets this result as its `defaults` (the names of every header of the request for `null`) and
   * decides. Not called for the feed's own origin. For the redirects the updater follows, the updater asks the provider of its latest
   * update check. A throw, or a result that is not an array of header names or `null`, fails that request with
   * `ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS`; a provider without this method fails the update check with
   * `ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED`.
   *
   * @example crossOriginHeaders(defaults) { return defaults } // the built-in list
   * @example crossOriginHeaders(defaults, request) { return request.to.origin === "https://api.example.com" ? [...defaults, "authorization"] : defaults }
   */
  abstract crossOriginHeaders(defaults: ReadonlyArray<string>, request: CrossOriginRequest): ReadonlyArray<string> | null

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
    // the same feed-origin rule and cross-origin headers as for downloads and redirects: e.g. a channel file on another origin gets only
    // the request headers this provider and then the app choose (by default the likes of Accept and User-Agent)
    let requestHeaders = this.requestHeaders
    if (requestHeaders != null) {
      requestHeaders = HttpExecutor.keepCrossOriginHeaders(
        requestHeaders,
        { from: this.feedBaseUrl ?? null, to: url, kind: "request" },
        crossOriginHeadersLayers(this, this.runtimeOptions.crossOriginHeaders ?? (defaults => defaults))
      )
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
