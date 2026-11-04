import { createRequire } from "node:module"
import {
  ApiRequestOptions,
  CrossOriginHeaderPolicy,
  DownloadOptions,
  HttpExecutor,
  configureRequestOptions,
  configureRequestUrl,
  isLoopbackHostname,
  newError,
} from "builder-util-runtime"

// import.meta is empty when a bundler inlines this module into a CommonJS bundle; Electron resolves "electron" from any base path
const require = createRequire(import.meta.url ?? process.execPath)
import type { AuthInfo } from "electron"
type Session = Electron.Session
type ClientRequest = Electron.ClientRequest

/** Electron's `login` callback: called without credentials, it cancels the authentication. */
export type LoginCallback = (username?: string, password?: string) => void
export const NET_SESSION_NAME = "electron-updater"

export function getNetSession(): Session {
  return require("electron").session.fromPartition(NET_SESSION_NAME, {
    cache: false,
  })
}

/**
 * Gets Electron's `login` event of a request: `requestUrl` is the URL of that request (Electron's `AuthInfo` names only the challenger's
 * host and port), `null` when it cannot be determined from the request options.
 */
export type LoginChallengeListener = (authInfo: AuthInfo, callback: LoginCallback, requestUrl: URL | null) => void

export interface ElectronHttpExecutorOptions {
  /** Chooses the headers each redirect to another origin sends on (AppUpdater's asks the app's `crossOriginHeaders`). */
  readonly crossOriginHeaderPolicy: CrossOriginHeaderPolicy
  /** Whether a request may use plain `http` to a host that is not loopback (`AppUpdater.allowInsecureFeed`); not by default. */
  readonly isInsecureFeedAllowed?: () => boolean
}

export class ElectronHttpExecutor extends HttpExecutor<Electron.ClientRequest> {
  private cachedSession: Session | null = null
  private readonly isInsecureFeedAllowed: () => boolean

  constructor(
    private readonly loginChallengeListener: LoginChallengeListener | undefined,
    options: ElectronHttpExecutorOptions
  ) {
    super(options.crossOriginHeaderPolicy)
    this.isInsecureFeedAllowed = options.isInsecureFeedAllowed ?? (() => false)
  }

  async download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    return await options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      const requestOptions = {
        headers: options.headers || undefined,
        ownHeaders: options.ownHeaders,
        redirect: "manual",
      }
      configureRequestUrl(url, requestOptions)
      configureRequestOptions(requestOptions)
      this.doDownload(
        requestOptions,
        {
          destination,
          options,
          onCancel,
          callback: error => {
            if (error == null) {
              resolve(destination)
            } else {
              reject(error)
            }
          },
          responseHandler: null,
        },
        0
      )
    })
  }

  /**
   * Every request of the updater, a redirected one included, is created here: one that is not https throws `ERR_UPDATER_INSECURE_FEED`
   * unless it goes to a loopback host or the app set `allowInsecureFeed`, and a redirect to a loopback host from a URL that is not on one
   * throws `ERR_UPDATER_LOOPBACK_REDIRECT` (see `ApiRequestOptions.redirectedFromNonLoopback`).
   */
  createRequest(options: any, callback: (response: any) => void): Electron.ClientRequest {
    // fix (node 7+) for making electron updater work when using AWS private buckets, check if headers contain Host property
    if (options.headers && options.headers.Host) {
      // set host value from headers.Host
      options.host = options.headers.Host
      // remove header property 'Host', if not removed causes net::ERR_INVALID_ARGUMENT exception
      delete options.headers.Host
    }
    // a host that is not loopback must not reach the user's machine through a redirect, whatever the scheme and allowInsecureFeed
    if (options.redirectedFromNonLoopback === true && reachesThisMachine(options)) {
      throw newError(
        `electron-updater rejects the redirect to ${options.protocol ?? "http:"}//${requestHost(options)}, a loopback host, from a host that is not loopback: ` +
          `a loopback update URL is only followed when every URL before it is on a loopback host. See ${INSECURE_FEED_DOCS}`,
        "ERR_UPDATER_LOOPBACK_REDIRECT"
      )
    }
    if (options.protocol !== "https:" && !this.isInsecureFeedAllowed() && !isLoopbackRequest(options)) {
      throw newError(
        `electron-updater rejects the update request to ${options.protocol ?? "http:"}//${requestHost(options)}: the update feed, its downloads and every redirect must use https, ` +
          "except to a loopback host (localhost, 127.0.0.0/8, ::1). Serve your updates over https; for a test server on another machine, set autoUpdater.allowInsecureFeed = !app.isPackaged, which accepts plain http in dev runs only. " +
          `See ${INSECURE_FEED_DOCS}`,
        "ERR_UPDATER_INSECURE_FEED"
      )
    }
    return this.createNetRequest(options, callback)
  }

  protected createNetRequest(options: any, callback: (response: any) => void): Electron.ClientRequest {
    // differential downloader can call this method very often, so, better to cache session
    if (this.cachedSession == null) {
      this.cachedSession = getNetSession()
    }

    const request = require("electron").net.request({
      ...options,
      session: this.cachedSession,
    })
    request.on("response", callback)
    const loginChallengeListener = this.loginChallengeListener
    if (loginChallengeListener != null) {
      // like Electron's net, `host` (where a Host header goes) wins over hostname and port
      let authority: string | null = null
      if (typeof options.host === "string" && options.host !== "") {
        authority = options.host
      } else if (typeof options.hostname === "string" && options.hostname !== "") {
        authority = options.port ? `${options.hostname}:${options.port}` : options.hostname
      }
      let requestUrl: URL | null = null
      try {
        requestUrl = authority == null ? null : new URL(`${options.protocol}//${authority}${options.path || "/"}`)
      } catch (_e: unknown) {
        requestUrl = null
      }
      request.on("login", (authInfo: AuthInfo, loginCallback: LoginCallback) => loginChallengeListener(authInfo, loginCallback, requestUrl))
    }
    return request
  }

  /**
   * Electron's `net` requests never emit `socket`, so the timeout armed by the base class (a socket timeout) never starts and a
   * stalled request would wait forever. An idle timer replaces it: restarted by every sign of progress (the response, a redirect,
   * a body chunk), it aborts the request with "Request timed out" after `timeout` ms without any, until the response ends or
   * the request fails or is aborted.
   */
  addErrorAndTimeoutHandlers(request: any, reject: (error: Error) => void, timeout = 60 * 1000): void {
    super.addErrorAndTimeoutHandlers(request, reject, timeout)
    // like socket.setTimeout, 0 (or no number) disables the timeout
    if (typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0) {
      addIdleTimeout(request, reject, timeout)
    }
  }

  /**
   * A redirect aborts `request` and `handler` sends a new one to the target: followRedirect() would resend every header,
   * while {@link HttpExecutor.prepareRedirectUrlOptions} keeps only the headers {@link HttpExecutor.crossOriginHeaderPolicy} chooses, and the request's own, when the
   * target is on another origin.
   * Up to `maxRedirects` redirects are followed; `redirectCount` is the number already followed. A redirect to a protocol other than
   * http(s) is rejected, and so is anything `handler` throws.
   */
  addRedirectHandlers(
    request: ClientRequest,
    options: ApiRequestOptions,
    reject: (error: Error) => void,
    redirectCount: number,
    handler: (options: ApiRequestOptions) => void
  ): void {
    request.on("redirect", (statusCode: number, method: string, redirectUrl: string) => {
      // no way to modify request options, abort old and make a new one
      // https://github.com/electron/electron/issues/11505
      request.abort()

      if (redirectCount >= this.maxRedirects) {
        reject(this.createMaxRedirectError())
        return
      }
      // an event listener: a throw (from preparing the options, or from the handler, which sends the new request) would escape as an
      // uncaught exception and the request would never settle
      try {
        const redirectOptions = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options, this.crossOriginHeaderPolicy)
        // net.request throws for another protocol, where Electron following the redirect itself fails the request
        if (redirectOptions.protocol !== "http:" && redirectOptions.protocol !== "https:") {
          throw new Error(`Cannot follow the redirect to the "${redirectOptions.protocol ?? ""}" protocol`)
        }
        handler(redirectOptions)
      } catch (e: unknown) {
        reject(e instanceof Error ? e : new Error(`Cannot follow the redirect: ${String(e)}`))
      }
    })
  }
}

const INSECURE_FEED_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#update-requests-require-https"

// net.request connects to `host` (with its port) when it is set, else to `hostname` and `port`
function requestHost(options: ApiRequestOptions): string {
  return options.host ?? `${options.hostname ?? ""}${options.port == null ? "" : `:${options.port}`}`
}

// the WHATWG-normalized hostname net.request connects to (e.g. `0x7f.1` is `127.0.0.1`, `[::ffff:127.0.0.1]` is `[::ffff:7f00:1]`), or null
function requestHostname(options: ApiRequestOptions): string | null {
  try {
    return new URL(`http://${requestHost(options)}`).hostname
  } catch {
    // not a host
    return null
  }
}

function isLoopbackRequest(options: ApiRequestOptions): boolean {
  const hostname = requestHostname(options)
  return hostname != null && isLoopbackHostname(hostname)
}

/**
 * Whether the request connects to this machine: a loopback host, the unspecified address (`0.0.0.0`, `::`), which Linux and macOS connect
 * to the local machine, or an IPv4-mapped IPv6 address of either (`::ffff:127.0.0.0/104`, `::ffff:0.0.0.0`), which dual-stack hosts do. Wider
 * than the loopback exemption of the https rule, on purpose: it also covers `localhost.` and every `*.localhost` name, which Chromium resolves
 * to loopback without DNS. Another DNS name that resolves to such an address is not caught: that needs the resolved address, which
 * net.request does not expose before it connects.
 */
function reachesThisMachine(options: ApiRequestOptions): boolean {
  const requested = requestHostname(options)
  if (requested == null) {
    return false
  }
  // one trailing dot names the same host (`localhost.`)
  const hostname = requested.toLowerCase().replace(/\.$/, "")
  // Chromium resolves `localhost` and every `*.localhost` name to loopback itself, without DNS
  if (isLoopbackHostname(hostname) || hostname === "0.0.0.0" || hostname.endsWith(".localhost")) {
    return true
  }
  const ipv6 = hostname.replace(/^\[(.*)\]$/, "$1")
  if (ipv6 === "::") {
    return true
  }
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ipv6)
  if (mapped == null) {
    return false
  }
  const high = Number.parseInt(mapped[1], 16)
  return high >> 8 === 0x7f || (high === 0 && Number.parseInt(mapped[2], 16) === 0)
}

function addIdleTimeout(request: ClientRequest, reject: (error: Error) => void, timeout: number): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let isDone = false
  const stop = (): void => {
    isDone = true
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }
  const restart = (): void => {
    if (isDone) {
      return
    }
    if (timer != null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      isDone = true
      request.abort()
      reject(new Error("Request timed out"))
    }, timeout)
  }

  request.on("response", response => {
    restart()
    // added after the response handler, which pipes or reads the body synchronously, so this does not change how the body flows
    response.on("data", restart)
    response.on("end", stop)
    response.on("error", stop)
    response.on("aborted", stop)
  })
  request.on("redirect", restart)
  request.on("abort", stop)
  request.on("error", stop)
  // not "close": with autoDestroy, Electron emits it as soon as the request body is sent, long before the response
  restart()
}
