import { BinaryToTextEncoding, createHash, Hash, randomBytes, scryptSync } from "crypto"
import { sleep } from "./retry.js"
import _debug from "debug"
import { createWriteStream } from "fs"
import { IncomingMessage, OutgoingHttpHeader, OutgoingHttpHeaders, RequestOptions } from "http"
import { isIPv4, Socket } from "net"
import { Transform } from "stream"
import { URL } from "url"
import { Nullish } from "./index.js"
import { CancellationToken } from "./CancellationToken.js"
import { newError } from "./error.js"
import { deepAssign } from "./objects.js"
import { ProgressCallbackTransform, ProgressInfo } from "./ProgressCallbackTransform.js"

const debug = _debug("electron-builder")

// ── Sensitive-data registries ────────────────────────────────────────────────

// Normalise a field name: lowercase + strip all separators (- and _), so lookup is separator-agnostic.
const normalizeName = (name: string): string => name.toLowerCase().replace(/[-_]/g, "")

/**
 * The request headers sent on to another origin by default, by a cross-origin redirect or by electron-updater to a download or channel file
 * on another origin than the update feed: content negotiation, caching, conditional and range requests, and the description of a request
 * body. Any other header (Authorization, Cookie, a custom X-Api-Token...) may carry a credential for the original origin and is left out.
 * `Range` keeps differential downloads working when the server redirects them to a CDN. See {@link HttpExecutor.keepCrossOriginHeaders}.
 */
export const DEFAULT_CROSS_ORIGIN_HEADERS: ReadonlyArray<string> = Object.freeze([
  "accept",
  "accept-encoding",
  "accept-language",
  "user-agent",
  "cache-control",
  "pragma",
  "range",
  "if-range",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "content-type",
  "content-length",
  "content-encoding",
  "content-language",
])

/** A request, or a redirect, to another origin: what a {@link CrossOriginHeadersCallback} decides the headers of. */
export interface CrossOriginRequest {
  /**
   * The URL the headers are meant for: the update feed, or the URL that redirected. `null` when the update provider declares no feed URL
   * (`Provider.feedBaseUrl`): every request of that provider is then asked about.
   */
  readonly from: URL | null
  /** The URL on the other origin. */
  readonly to: URL
  /** `"redirect"` for a redirect to another origin, `"request"` for a request electron-updater makes to another origin than its feed. */
  readonly kind: "redirect" | "request"
}

/**
 * Chooses the request headers sent to another origin, for one request or redirect: gets {@link DEFAULT_CROSS_ORIGIN_HEADERS} (or, as a
 * later {@link CrossOriginHeadersLayer}, what the layer before it chose) and the request, and returns the header names to send
 * (case-insensitive), or `null` to send every header on that request. Called only for a request or redirect to another origin (see
 * {@link HttpExecutor.isCrossOrigin}), or for any request without a feed URL (`from` is `null`): the same origin gets every header. A
 * throw, or a result that is not an array of header names or `null`, fails that request with `ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS`.
 *
 * @example defaults => defaults // the default list
 * @example (defaults, request) => (request.to.hostname === "cdn.example.com" ? [...defaults, "x-tenant"] : defaults)
 */
export type CrossOriginHeadersCallback = (defaults: ReadonlyArray<string>, request: CrossOriginRequest) => ReadonlyArray<string> | null

/**
 * One step of a layered cross-origin header decision (see {@link HttpExecutor.keepCrossOriginHeaders}): the first layer gets
 * {@link DEFAULT_CROSS_ORIGIN_HEADERS}, each later one gets what the layer before it returned as its `defaults` (the names of every header
 * of the request when that was `null`), and the last one decides. `name` names the layer in error messages, e.g.
 * `"crossOriginHeaders of checkForUpdates"`.
 */
export interface CrossOriginHeadersLayer {
  readonly name: string
  readonly crossOriginHeaders: CrossOriginHeadersCallback
}

// an HTTP header name (RFC 9110 token)
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

const CROSS_ORIGIN_HEADERS_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-header-allowlist"

const sendDefaultCrossOriginHeaders: CrossOriginHeadersCallback = defaults => defaults

// Substrings: a field name containing any of these (after normalization) is redacted.
const SENSITIVE_FIELD_PATTERNS: string[] = ["token", "password", "secret", "authorization", "credential", "apikey", "passphrase", "auth"] as const

// Suffixes: a field name ending with any of these (after normalization) is redacted.
// Intentionally greedy — "publicKey" is also stripped; over-stripping debug logs is
// acceptable, under-stripping a credential is not.
const SENSITIVE_FIELD_SUFFIXES: string[] = ["key"] as const

/**
 * Register an additional substring pattern used by {@link safeStringifyJson} to
 * identify sensitive field names. Input is normalized (lowercased, separators stripped).
 * Intended for custom publishers that store credentials under non-standard field names.
 */
export function addSensitiveFieldPattern(pattern: string): void {
  SENSITIVE_FIELD_PATTERNS.push(pattern.toLowerCase().replace(/[-_]/g, ""))
}

export interface RequestHeaders extends OutgoingHttpHeaders {
  [key: string]: OutgoingHttpHeader | undefined
}

/** The options of an API request, see {@link HttpExecutor.request}. */
export interface ApiRequestOptions extends RequestOptions {
  /**
   * The largest body, in bytes, read into memory (set by electron-updater for update info, which is parsed before it is verified):
   * a larger response fails the request with `ERR_HTTP_RESPONSE_TOO_LARGE` and aborts it. Applies when it is a finite number of at
   * least 0, and is kept on redirects, whose options are copied from these.
   */
  maxResponseSize?: number
}

export interface DownloadOptions {
  readonly headers?: OutgoingHttpHeaders | null
  readonly sha2?: string | null
  readonly sha512?: string | null

  readonly cancellationToken: CancellationToken

  // noinspection JSUnusedLocalSymbols
  onProgress?: (progress: ProgressInfo) => void
}

export function createHttpError(response: IncomingMessage, description: any | null = null) {
  return new HttpError(
    response.statusCode || -1,
    `${response.statusCode} ${response.statusMessage}` +
      (description == null ? "" : "\n" + JSON.stringify(description, null, "  ")) +
      "\nHeaders: " +
      safeStringifyJson(response.headers),
    description
  )
}

const HTTP_STATUS_CODES = new Map<number, string>([
  [429, "Too many requests"],
  [400, "Bad request"],
  [403, "Forbidden"],
  [404, "Not found"],
  [405, "Method not allowed"],
  [406, "Not acceptable"],
  [408, "Request timeout"],
  [413, "Request entity too large"],
  [500, "Internal server error"],
  [502, "Bad gateway"],
  [503, "Service unavailable"],
  [504, "Gateway timeout"],
  [505, "HTTP version not supported"],
])

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message = `HTTP error: ${HTTP_STATUS_CODES.get(statusCode) || statusCode}`,
    readonly description: any | null = null
  ) {
    super(message)

    this.name = "HttpError"
    ;(this as NodeJS.ErrnoException).code = `HTTP_ERROR_${statusCode}`
  }

  isServerError() {
    return this.statusCode >= 500 && this.statusCode <= 599
  }
}

export function parseJson(result: Promise<string | null>) {
  return result.then(it => (it == null || it.length === 0 ? null : JSON.parse(it)))
}

interface Request {
  abort: () => void
  end: (data?: Buffer) => void
}
export abstract class HttpExecutor<T extends Request> {
  protected readonly maxRedirects = 10

  /**
   * @param crossOriginHeaders chooses the headers each redirect to another origin sends on (see {@link CrossOriginHeadersCallback}); the
   * default sends {@link DEFAULT_CROSS_ORIGIN_HEADERS}.
   */
  constructor(readonly crossOriginHeaders: CrossOriginHeadersCallback = sendDefaultCrossOriginHeaders) {}

  /**
   * What decides the headers each redirect to another origin sends on: {@link HttpExecutor.crossOriginHeaders} here, while
   * electron-updater's executor asks the update provider first (see {@link CrossOriginHeadersLayer}).
   */
  crossOriginRedirectHeaders(): CrossOriginHeadersCallback | ReadonlyArray<CrossOriginHeadersLayer> {
    return this.crossOriginHeaders
  }

  request(options: ApiRequestOptions, cancellationToken: CancellationToken = new CancellationToken(), data?: { [name: string]: any } | null): Promise<string | null> {
    configureRequestOptions(options)
    const json = data == null ? undefined : JSON.stringify(data)
    const encodedData = json ? Buffer.from(json) : undefined
    if (encodedData != null) {
      if (debug.enabled) {
        debug(safeStringifyJson(data))
      }
      const { headers, ...opts } = options
      options = {
        method: "post",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": encodedData.length,
          ...headers,
        },
        ...opts,
      }
    }
    return this.doApiRequest(options, cancellationToken, it => it.end(encodedData))
  }

  doApiRequest(
    options: ApiRequestOptions,
    cancellationToken: CancellationToken,
    requestProcessor: (request: T, reject: (error: Error) => void) => void,
    redirectCount = 0
  ): Promise<string> {
    if (debug.enabled) {
      const { headers: _headers, auth: _auth, ...safeOptions } = options as any
      debug(`Request: ${safeStringifyJson(safeOptions)}`)
    }

    return cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      const request = this.createRequest(options, (response: any) => {
        try {
          this.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor, () => request.abort())
        } catch (e: any) {
          reject(e)
        }
      })
      this.addErrorAndTimeoutHandlers(request, reject, options.timeout)
      this.addRedirectHandlers(request, options, reject, redirectCount, options => {
        this.doApiRequest(options, cancellationToken, requestProcessor, redirectCount + 1)
          .then(resolve)
          .catch(reject)
      })
      requestProcessor(request, reject)
      onCancel(() => request.abort())
    })
  }

  /**
   * Follows the redirects of `request` when it reports them as events instead of 3xx responses (Electron's `net` with
   * `redirect: "manual"`, see ElectronHttpExecutor): the request is aborted and `handler` gets the options for the redirect
   * target from {@link HttpExecutor.prepareRedirectUrlOptions} (with {@link HttpExecutor.crossOriginRedirectHeaders}), or `reject` gets the too-many-redirects error when
   * `redirectCount`, the number of redirects already followed, has reached the limit. Node.js requests answer a redirect
   * with a 3xx response, so this does nothing here.
   */
  // noinspection JSUnusedLocalSymbols
  // eslint-disable-next-line
  addRedirectHandlers(request: any, options: RequestOptions, reject: (error: Error) => void, redirectCount: number, handler: (options: RequestOptions) => void) {
    // not required for NodeJS
  }

  addErrorAndTimeoutHandlers(request: any, reject: (error: Error) => void, timeout = 60 * 1000) {
    this.addTimeOutHandler(request, reject, timeout)
    request.on("error", reject)
    request.on("aborted", () => {
      reject(new Error("Request has been aborted by the server"))
    })
  }

  private handleResponse(
    response: IncomingMessage,
    options: ApiRequestOptions,
    cancellationToken: CancellationToken,
    resolve: (data?: any) => void,
    reject: (error: Error) => void,
    redirectCount: number,
    requestProcessor: (request: T, reject: (error: Error) => void) => void,
    abort: () => void
  ) {
    if (debug.enabled) {
      const { headers: _headers, auth: _auth, ...safeOptions } = options as any
      debug(`Response: ${response.statusCode} ${response.statusMessage}, request options: ${safeStringifyJson(safeOptions)}`)
    }

    // we handle any other >= 400 error on request end (read detailed message in the response body)
    if (response.statusCode === 404) {
      // error is clear, we don't need to read detailed error description
      reject(
        createHttpError(
          response,
          `method: ${options.method || "GET"} url: ${options.protocol || "https:"}//${options.hostname}${options.port ? `:${options.port}` : ""}${options.path}

Please double check that your authentication token is correct. Due to security reasons, actual status maybe not reported, but 404.
`
        )
      )
      return
    } else if (response.statusCode === 204) {
      // on DELETE request
      resolve()
      return
    }

    const code = response.statusCode ?? 0
    const shouldRedirect = code >= 300 && code < 400
    const redirectUrl = safeGetHeader(response, "location")
    if (shouldRedirect && redirectUrl != null) {
      if (redirectCount >= this.maxRedirects) {
        reject(this.createMaxRedirectError())
        return
      }

      this.doApiRequest(HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options, this.crossOriginRedirectHeaders()), cancellationToken, requestProcessor, redirectCount + 1)
        .then(resolve)
        .catch(reject)
      return
    }

    response.setEncoding("utf8")

    const limit = options.maxResponseSize
    const maxResponseSize = limit != null && Number.isFinite(limit) && limit >= 0 ? limit : null
    let data = ""
    let size = 0
    let isTooLarge = false
    response.on("error", reject)
    response.on("data", (chunk: string) => {
      if (isTooLarge) {
        return
      }
      if (maxResponseSize != null) {
        size += Buffer.byteLength(chunk)
        if (size > maxResponseSize) {
          isTooLarge = true
          data = ""
          reject(
            newError(
              // the path without its query, which can carry credentials
              `Response from ${options.protocol || "https:"}//${options.hostname}${options.port ? `:${options.port}` : ""}${(options.path ?? "").replace(/[?#].*$/s, "")} exceeds the maximum allowed size of ${maxResponseSize} bytes`,
              "ERR_HTTP_RESPONSE_TOO_LARGE"
            )
          )
          abort()
          return
        }
      }
      data += chunk
    })
    response.on("end", () => {
      if (isTooLarge) {
        return
      }
      try {
        if (response.statusCode != null && response.statusCode >= 400) {
          const contentType = safeGetHeader(response, "content-type")
          const isJson = contentType != null && (Array.isArray(contentType) ? contentType.find(it => it.includes("json")) != null : contentType.includes("json"))
          reject(
            createHttpError(
              response,
              `method: ${options.method || "GET"} url: ${options.protocol || "https:"}//${options.hostname}${options.port ? `:${options.port}` : ""}${options.path}

          Data:
          ${isJson ? safeStringifyJson(JSON.parse(data)) : data}
          `
            )
          )
        } else {
          resolve(data.length === 0 ? null : data)
        }
      } catch (e: any) {
        reject(e)
      }
    })
  }

  // noinspection JSUnusedLocalSymbols
  abstract createRequest(options: RequestOptions, callback: (response: any) => void): T

  async downloadToBuffer(url: URL, options: DownloadOptions): Promise<Buffer> {
    return await options.cancellationToken.createPromise<Buffer>((resolve, reject, onCancel) => {
      const responseChunks: Buffer[] = []
      const requestOptions = {
        headers: options.headers || undefined,
        // because PrivateGitHubProvider requires HttpExecutor.prepareRedirectUrlOptions logic, so, we need to redirect manually
        redirect: "manual",
      }
      configureRequestUrl(url, requestOptions)
      configureRequestOptions(requestOptions)
      this.doDownload(
        requestOptions,
        {
          destination: null,
          options,
          onCancel,
          callback: error => {
            if (error == null) {
              resolve(Buffer.concat(responseChunks))
            } else {
              reject(error)
            }
          },
          responseHandler: (response, callback) => {
            let receivedLength = 0
            let isDone = false
            const finish = (error: Error | null) => {
              if (isDone) {
                return
              }
              isDone = true
              callback(error)
            }
            response.on("data", (chunk: Buffer) => {
              if (isDone) {
                return
              }
              receivedLength += chunk.length
              if (receivedLength > 524288000) {
                finish(new Error("Maximum allowed size is 500 MB"))
                response.destroy()
                return
              }
              responseChunks.push(chunk)
            })
            response.on("end", () => {
              finish(null)
            })
          },
        },
        0
      )
    })
  }

  protected doDownload(requestOptions: RequestOptions, options: DownloadCallOptions, redirectCount: number) {
    const request = this.createRequest(requestOptions, (response: IncomingMessage) => {
      const code = response.statusCode ?? 0
      if (code >= 400) {
        // the body is not used: drain it, so the response ends and releases its socket (see the redirect below)
        response.resume()
        options.callback(
          new Error(
            `Cannot download "${requestOptions.protocol || "https:"}//${requestOptions.hostname}${requestOptions.path}", status ${response.statusCode}: ${response.statusMessage}`
          )
        )
        return
      }

      // It is possible for the response stream to fail, e.g. when a network is lost while
      // response stream is in progress. Stop waiting and reject so consumer can catch the error.
      response.on("error", options.callback)

      // Node.js reports a redirect as a 3xx response, Electron's net reports 301/302/303/307/308 as "redirect" events (see
      // addRedirectHandlers) and any other 3xx as a response: a Location on a response that is not 3xx is ignored
      const redirectUrl = code >= 300 && code < 400 ? safeGetHeader(response, "location") : null
      if (redirectUrl != null) {
        // the body of the redirect is not used: drain it, so the response ends and releases its socket, whose timeout would otherwise
        // call back a second time
        response.resume()
        if (redirectCount >= this.maxRedirects) {
          options.callback(this.createMaxRedirectError())
          return
        }
        // a response listener: a throw (from preparing the options, or from sending the new request) would escape as an uncaught
        // exception and the download would never settle
        try {
          const redirectOptions = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, requestOptions, this.crossOriginRedirectHeaders())
          if (redirectOptions.protocol !== "http:" && redirectOptions.protocol !== "https:") {
            throw new Error(`Cannot follow the redirect to the "${redirectOptions.protocol ?? ""}" protocol`)
          }
          this.doDownload(redirectOptions, options, redirectCount + 1)
        } catch (e: unknown) {
          options.callback(e instanceof Error ? e : new Error(`Cannot follow the redirect: ${String(e)}`))
        }
        return
      }

      if (options.responseHandler == null) {
        configurePipes(options, response)
      } else {
        options.responseHandler(response, options.callback)
      }
    })
    this.addErrorAndTimeoutHandlers(request, options.callback, requestOptions.timeout)
    this.addRedirectHandlers(request, requestOptions, options.callback, redirectCount, requestOptions => {
      this.doDownload(requestOptions, options, redirectCount + 1)
    })
    // a cancel aborts the request in flight, or its response would go on downloading into the destination. The promise keeps one cancel
    // handler: a redirect's new request replaces this one, which the redirect has already ended
    options.onCancel(() => request.abort())
    request.end()
  }

  protected createMaxRedirectError() {
    return new Error(`Too many redirects (> ${this.maxRedirects})`)
  }

  private addTimeOutHandler(request: any, callback: (error: Error) => void, timeout: number) {
    request.on("socket", (socket: Socket) => {
      const onTimeout = () => {
        request.abort()
        callback(new Error("Request timed out"))
      }
      socket.setTimeout(timeout, onTimeout)
      // a keep-alive agent keeps the socket after the request and sets its own idle timeout on it: that timeout is not this request's
      request.once("close", () => socket.removeListener("timeout", onTimeout))
    })
  }

  /**
   * Options for the request to `redirectUrl`, redirected from `options`. When the target is on another origin, only the headers
   * `crossOriginHeaders` chooses for the redirect are kept (see {@link HttpExecutor.keepCrossOriginHeaders}), and the `auth` option (which
   * Node.js sends as an `Authorization` header) only when that choice keeps `authorization`.
   */
  static prepareRedirectUrlOptions(
    redirectUrl: string,
    options: RequestOptions,
    crossOriginHeaders: CrossOriginHeadersCallback | ReadonlyArray<CrossOriginHeadersLayer> = sendDefaultCrossOriginHeaders
  ): RequestOptions {
    const newOptions = configureRequestOptionsFromUrl(redirectUrl, { ...options })
    // the target is hostname and port: Electron's net prefers `host` (where ElectronHttpExecutor moves a `Host` header) over them
    delete newOptions.host
    const headers = newOptions.headers
    if (headers == null) {
      return newOptions
    }

    const originalUrl = HttpExecutor.reconstructOriginalUrl(options)
    const parsedRedirectUrl = parseUrl(redirectUrl, options)

    if (HttpExecutor.isCrossOriginRedirect(originalUrl, parsedRedirectUrl)) {
      const headerNames = HttpExecutor.headerNames(headers)
      // Node's `auth` option becomes a Basic Authorization header on the request
      if (newOptions.auth != null && !headerNames.some(it => it.toLowerCase() === "authorization")) {
        headerNames.push("authorization")
      }
      const allowedNames = HttpExecutor.chooseCrossOriginHeaders(headerNames, { from: originalUrl, to: parsedRedirectUrl, kind: "redirect" }, crossOriginHeaders)
      if (allowedNames != null) {
        if (!allowedNames.has("authorization")) {
          delete newOptions.auth
        }
        newOptions.headers = HttpExecutor.pickHeaders(headers, allowedNames)
      }
    }
    return newOptions
  }

  /**
   * The headers to send to `request.to` for a request whose headers are meant for `request.from`: all of `headers` when `to` is on the same
   * origin (see {@link HttpExecutor.isCrossOrigin}), without calling `crossOriginHeaders`; else (and for any `to` when `from` is `null`)
   * only the ones named in what `crossOriginHeaders` returns for the request (case-insensitive), or all of them for `null`. Given
   * {@link CrossOriginHeadersLayer layers}, each one is asked in turn and the last one decides. Returns `headers` itself when it keeps all
   * of them, else a copy: never mutates `headers`. A throw of a `crossOriginHeaders`, or a result that is not an array of header names or
   * `null`, fails with `ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS`, whose message holds neither the result nor a header value.
   */
  static keepCrossOriginHeaders(
    headers: OutgoingHttpHeaders,
    request: CrossOriginRequest,
    crossOriginHeaders: CrossOriginHeadersCallback | ReadonlyArray<CrossOriginHeadersLayer>
  ): OutgoingHttpHeaders {
    if (request.from != null && !HttpExecutor.isCrossOriginRedirect(request.from, request.to)) {
      return headers
    }
    const allowedNames = HttpExecutor.chooseCrossOriginHeaders(HttpExecutor.headerNames(headers), request, crossOriginHeaders)
    return allowedNames == null ? headers : HttpExecutor.pickHeaders(headers, allowedNames)
  }

  // the names of the headers that are sent (a header set to undefined or null is not)
  private static headerNames(headers: OutgoingHttpHeaders): Array<string> {
    return Object.keys(headers).filter(it => headers[it] != null)
  }

  /**
   * Asks each layer of `crossOriginHeaders` in turn (see {@link CrossOriginHeadersLayer}) and validates each answer: the lowercase names of
   * the headers the last one keeps, or `null` for all of them. `headerNames` (the headers of the request) are the `defaults` of a layer
   * after one that returned `null`.
   */
  private static chooseCrossOriginHeaders(
    headerNames: ReadonlyArray<string>,
    request: CrossOriginRequest,
    crossOriginHeaders: CrossOriginHeadersCallback | ReadonlyArray<CrossOriginHeadersLayer>
  ): ReadonlySet<string> | null {
    const { from, to, kind } = request
    const target = from == null ? `the ${kind} to ${to.origin}` : `the ${kind} from ${from.origin} to ${to.origin}`
    const layers: ReadonlyArray<CrossOriginHeadersLayer> = typeof crossOriginHeaders === "function" ? [{ name: "crossOriginHeaders", crossOriginHeaders }] : crossOriginHeaders
    let chosen: ReadonlyArray<string> | null = DEFAULT_CROSS_ORIGIN_HEADERS
    for (const layer of layers) {
      let allowed: unknown
      try {
        allowed = layer.crossOriginHeaders(chosen ?? headerNames, { from, to, kind })
      } catch (e: unknown) {
        // the updater's own "not configured" error explains itself
        if (e instanceof Error && "code" in e && e.code === "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED") {
          throw e
        }
        // never the error's message: it could hold a header value
        throw newError(`${layer.name} threw for ${target}, which is not sent. ${CROSS_ORIGIN_HEADERS_DOCS}`, "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS")
      }
      if (allowed === null) {
        chosen = null
        continue
      }
      if (!Array.isArray(allowed) || !allowed.every((it): it is string => typeof it === "string" && HEADER_NAME_PATTERN.test(it))) {
        // never the value: a mistaken result could hold a header value
        throw newError(
          `${layer.name} must return an array of header names (such as "accept" or "x-tenant") or null: got ${Array.isArray(allowed) ? "an array with an entry that is not a header name" : typeof allowed} for ${target}, which is not sent. ${CROSS_ORIGIN_HEADERS_DOCS}`,
          "ERR_UPDATER_INVALID_CROSS_ORIGIN_HEADERS"
        )
      }
      chosen = allowed
    }
    if (chosen == null) {
      return null
    }
    if (debug.enabled) {
      debug(`Cross-origin ${kind} (${from?.host ?? "no feed URL"} → ${to.host}): keeping only the cross-origin headers`)
    }
    return new Set(chosen.map(it => it.toLowerCase()))
  }

  // a copy of `headers` with only the ones named in `allowedNames` (lowercase)
  private static pickHeaders(headers: OutgoingHttpHeaders, allowedNames: ReadonlySet<string>): OutgoingHttpHeaders {
    const result = deepAssign<OutgoingHttpHeaders>({}, headers)
    for (const key of Object.keys(result)) {
      if (!allowedNames.has(key.toLowerCase())) {
        delete result[key]
      }
    }
    return result
  }

  private static reconstructOriginalUrl(options: RequestOptions): URL {
    const protocol = options.protocol || "https:"
    if (!options.hostname) {
      throw new Error("Missing hostname in request options")
    }
    const hostname = options.hostname
    const port = options.port ? `:${options.port}` : ""
    const path = options.path || "/"
    return new URL(`${protocol}//${hostname}${port}${path}`)
  }

  /**
   * Whether `targetUrl` is on another origin than `originUrl` for the purpose of sending credentials: another host, port or
   * scheme, except an `http` → `https` upgrade of the same host on the default ports.
   */
  static isCrossOrigin(originUrl: URL, targetUrl: URL): boolean {
    return HttpExecutor.isCrossOriginRedirect(originUrl, targetUrl)
  }

  private static isCrossOriginRedirect(originalUrl: URL, redirectUrl: URL): boolean {
    // Case-insensitive hostname comparison
    if (originalUrl.hostname.toLowerCase() !== redirectUrl.hostname.toLowerCase()) {
      return true
    }

    // Special case: allow http -> https redirect on same host with standard ports
    // This matches the behavior of Python requests library for backward compatibility
    // url.port returns an empty string if the port is omitted
    // or explicitly set to the default port for a given protocol.
    if (
      originalUrl.protocol === "http:" &&
      // This can be replaced with `!originalUrl.port`, but for the sake of clarity.
      ["80", ""].includes(originalUrl.port) &&
      redirectUrl.protocol === "https:" &&
      // This can be replaced with `!redirectUrl.port`, but for the sake of clarity.
      ["443", ""].includes(redirectUrl.port)
    ) {
      return false
    }

    // According to RFC 7235, a change in protocol or port constitutes a cross-origin request.
    // Forwarding authentication headers to a different origin can be a security risk.
    // For example, https://example.com:443 and http://example.com:80 are different origins.
    // We only make an exception for HTTP -> HTTPS upgrades on standard ports for backward compatibility.

    // Strip auth on any other protocol change
    if (originalUrl.protocol !== redirectUrl.protocol) {
      return true
    }

    // Strip auth on port change (accounting for default ports)
    const originalPort = originalUrl.port
    const redirectPort = redirectUrl.port
    return originalPort !== redirectPort
  }

  static async retryOnServerError(task: () => Promise<any>, maxRetries = 3): Promise<any> {
    for (let attemptNumber = 0; ; attemptNumber++) {
      try {
        return await task()
      } catch (e: any) {
        if (attemptNumber < maxRetries && ((e instanceof HttpError && e.isServerError()) || e.code === "EPIPE")) {
          await sleep(1000 * (attemptNumber + 1))
          continue
        }
        throw e
      }
    }
  }
}

export interface DownloadCallOptions {
  responseHandler: ((response: IncomingMessage, callback: (error: Error | null) => void) => void) | null
  onCancel: (callback: () => void) => void
  callback: (error: Error | null) => void

  options: DownloadOptions

  destination: string | null
}

function parseUrl(url: string, options: RequestOptions): URL {
  try {
    // Would throw exception if url is not absolute
    return new URL(url)
  } catch {
    // Relative URL - construct base URL from original options
    const hostname = options.hostname
    const protocol = options.protocol || "https:"
    const port = options.port ? `:${options.port}` : ""
    const baseUrl = `${protocol}//${hostname}${port}`
    return new URL(url, baseUrl)
  }
}

export function configureRequestOptionsFromUrl(url: string, options: RequestOptions) {
  const result = configureRequestOptions(options)
  const parsedUrl = parseUrl(url, options)
  configureRequestUrl(parsedUrl, result)
  return result
}

export function configureRequestUrl(url: URL, options: RequestOptions): void {
  options.protocol = url.protocol
  options.hostname = url.hostname
  if (url.port) {
    options.port = url.port
  } else if (options.port) {
    delete options.port
  }
  options.path = url.pathname + url.search
}

export class DigestTransform extends Transform {
  private readonly digester: Hash

  private _actual: string | null = null

  // noinspection JSUnusedGlobalSymbols
  get actual() {
    return this._actual
  }

  isValidateOnEnd = true

  constructor(
    readonly expected: string,
    private readonly algorithm: string = "sha512",
    private readonly encoding: BinaryToTextEncoding = "base64"
  ) {
    super()

    this.digester = createHash(algorithm)
  }

  // noinspection JSUnusedGlobalSymbols
  _transform(chunk: Buffer, encoding: string, callback: any) {
    this.digester.update(chunk)
    callback(null, chunk)
  }

  // noinspection JSUnusedGlobalSymbols
  _flush(callback: any): void {
    this._actual = this.digester.digest(this.encoding)

    if (this.isValidateOnEnd) {
      try {
        this.validate()
      } catch (e: any) {
        callback(e)
        return
      }
    }

    callback(null)
  }

  validate() {
    if (this._actual == null) {
      throw newError("Not finished yet", "ERR_STREAM_NOT_FINISHED")
    }

    if (this._actual !== this.expected) {
      throw newError(`${this.algorithm} checksum mismatch, expected ${this.expected}, got ${this._actual}`, "ERR_CHECKSUM_MISMATCH")
    }

    return null
  }
}

function checkSha2(sha2Header: string | Nullish, sha2: string | Nullish, callback: (error: Error | null) => void): boolean {
  if (sha2Header != null && sha2 != null && sha2Header !== sha2) {
    callback(new Error(`checksum mismatch: expected ${sha2} but got ${sha2Header} (X-Checksum-Sha2 header)`))
    return false
  }
  return true
}

export function safeGetHeader(response: any, headerKey: string) {
  const value = response.headers[headerKey]
  if (value == null) {
    return null
  } else if (Array.isArray(value)) {
    // electron API
    return value.length === 0 ? null : value[value.length - 1]
  } else {
    return value
  }
}

/**
 * electron-builder has emitted base64-encoded sha512 values in latest*.yml since 19.x (2017); hex-encoded values
 * are a legacy back-compat path for pre-19.x manifests or hand-rolled manifests built from raw `sha512sum` output.
 * Detection is unambiguous: base64-encoded sha512 is always 88 characters ending in "==", so it can never match the
 * strict 128-hex-character pattern (and a wrong pick would only fail closed with ERR_CHECKSUM_MISMATCH).
 *
 * Hex-encoded sha512 manifest values are deprecated and support will be removed in v28 — emit base64 instead.
 */
export function detectSha512Encoding(sha512: string): BinaryToTextEncoding {
  const isLegacyHex = sha512.length === 128 && /^[0-9a-fA-F]{128}$/.test(sha512)
  if (isLegacyHex) {
    debug("Deprecation warning: hex-encoded sha512 detected in the update manifest. Hex support is deprecated and will be removed in v28 — emit base64 instead.")
    return "hex"
  }
  return "base64"
}

function configurePipes(options: DownloadCallOptions, response: IncomingMessage) {
  if (!checkSha2(safeGetHeader(response, "X-Checksum-Sha2"), options.options.sha2, options.callback)) {
    return
  }

  const streams: Array<any> = []
  if (options.options.onProgress != null) {
    const contentLength = safeGetHeader(response, "content-length")
    if (contentLength != null) {
      streams.push(new ProgressCallbackTransform(parseInt(contentLength, 10), options.options.cancellationToken, options.options.onProgress))
    }
  }

  const sha512 = options.options.sha512
  if (sha512 != null) {
    streams.push(new DigestTransform(sha512, "sha512", detectSha512Encoding(sha512)))
  } else if (options.options.sha2 != null) {
    streams.push(new DigestTransform(options.options.sha2, "sha256", "hex"))
  }

  const fileOut = createWriteStream(options.destination!)
  streams.push(fileOut)

  let lastStream = response
  for (const stream of streams) {
    stream.on("error", (error: Error) => {
      fileOut.close()
      if (!options.options.cancellationToken.cancelled) {
        options.callback(error)
      }
    })
    lastStream = lastStream.pipe(stream)
  }

  // .pipe() does not pass a failure of its source on: a response that errors or is aborted before its end (lost connection,
  // a request timeout, Electron's request.abort() destroying it) would leave the transforms and fileOut, and with it the
  // destination's file descriptor, open for the life of the process. The error itself is reported by whoever ended it.
  let isResponseEnded = false
  response.on("end", () => {
    isResponseEnded = true
  })
  const destroyStreams = () => {
    if (!isResponseEnded) {
      for (const stream of streams) {
        stream.destroy()
      }
    }
  }
  response.on("error", destroyStreams)
  response.on("aborted", destroyStreams)
  response.on("close", destroyStreams)

  fileOut.on("finish", () => {
    ;(fileOut.close as any)(options.callback)
  })
}

export function configureRequestOptions(options: RequestOptions, token?: string | null, method?: "GET" | "DELETE" | "PUT" | "POST"): RequestOptions {
  if (method != null) {
    options.method = method
  }

  options.headers = { ...options.headers }
  const headers = options.headers

  if (token != null) {
    ;(headers as any).authorization = token.startsWith("Basic") || token.startsWith("Bearer") ? token : `token ${token}`
  }
  if (headers["User-Agent"] == null) {
    headers["User-Agent"] = "electron-builder"
  }

  if (method == null || method === "GET" || headers["Cache-Control"] == null) {
    headers["Cache-Control"] = "no-cache"
  }

  // do not specify for node (in any case we use https module)
  if (options.protocol == null && (process.versions as any).electron != null) {
    options.protocol = "https:"
  }
  return options
}

/**
 * Whether `hostname` (a URL hostname: an IPv6 address may be in brackets) names the loopback interface: `localhost`, an address
 * in `127.0.0.0/8` or `::1`. A plain `http` update feed on such a host never leaves the machine.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1")
  return host === "localhost" || host === "::1" || (isIPv4(host) && host.startsWith("127."))
}

export function isSensitiveFieldName(name: string): boolean {
  const normalized = normalizeName(name)
  return SENSITIVE_FIELD_PATTERNS.some(p => normalized.includes(p)) || SENSITIVE_FIELD_SUFFIXES.some(s => normalized.endsWith(s))
}

// The key of the fingerprints of this process, created on first use and never logged
let fingerprintKey: Buffer | null = null

/** What a sensitive value is logged as when its fingerprint cannot be computed. */
export const REDACTED_VALUE = "<redacted>"

// The data given to safeStringifyJson can come from a server (an error response body or its headers), with any number of sensitive
// values: each fingerprint takes a few milliseconds of synchronous work, so one call computes at most this many
const MAX_FINGERPRINTS_PER_CALL = 16

/**
 * Stands in for a secret (a password, token or key) in logs and error messages: a fingerprint that is the same for the same
 * value within this process, so log lines can be compared, but that cannot be checked against guesses offline, since it is
 * keyed with a random secret of this process. Derived with scrypt at a low cost: it runs whenever a secret is logged, and
 * {@link safeStringifyJson} computes at most 16 fingerprints per call by default, logging the other values
 * as {@link REDACTED_VALUE}. Never throws: it returns {@link REDACTED_VALUE} when the fingerprint cannot be computed.
 */
export function hashSensitiveValue(value: string): string {
  try {
    if (fingerprintKey == null) {
      fingerprintKey = randomBytes(32)
    }
    const fingerprint = scryptSync(String(value), fingerprintKey, 16, { N: 1024, r: 8, p: 1 }).toString("hex")
    return `${fingerprint} (redacted fingerprint)`
  } catch {
    return REDACTED_VALUE
  }
}

/**
 * The JSON of `data` with the values of sensitive fields (and of `skippedNames`) replaced: a string by its fingerprint (see
 * {@link hashSensitiveValue}), anything else by a placeholder. At most `maxFingerprints` (by default 16) values are fingerprinted, the other
 * sensitive strings are written as {@link REDACTED_VALUE}: a caller that uses the result as an identity key passes
 * `Number.POSITIVE_INFINITY`, so data that differ in any sensitive value give different keys.
 */
export function safeStringifyJson(data: any, skippedNames?: Set<string>, maxFingerprints: number = MAX_FINGERPRINTS_PER_CALL): string {
  let fingerprintCount = 0
  return JSON.stringify(
    data,
    (name, value) => {
      if (isSensitiveFieldName(name) || (skippedNames != null && skippedNames.has(name))) {
        if (typeof value !== "string") {
          return "<stripped sensitive data>"
        }
        return fingerprintCount++ < maxFingerprints ? hashSensitiveValue(value) : REDACTED_VALUE
      }
      return value
    },
    2
  )
}
