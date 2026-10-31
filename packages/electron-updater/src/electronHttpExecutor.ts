import { createRequire } from "node:module"
import { DownloadOptions, HttpExecutor, configureRequestOptions, configureRequestUrl, isLoopbackHostname, newError } from "builder-util-runtime"

// import.meta is empty when a bundler inlines this module into a CommonJS bundle; Electron resolves "electron" from any base path
const require = createRequire(import.meta.url ?? process.execPath)
import type { AuthInfo } from "electron"
import { RequestOptions } from "http"
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

/** Gets the names (never the values) of the headers a cross-origin redirect did not send on to its target. */
export type CrossOriginRedirectListener = (droppedHeaderNames: Array<string>, originUrl: URL, targetUrl: URL) => void

export class ElectronHttpExecutor extends HttpExecutor<Electron.ClientRequest> {
  private cachedSession: Session | null = null

  /**
   * @param isInsecureFeedAllowed whether a request may use plain `http` to a host that is not loopback (`AppUpdater.allowInsecureFeed`)
   */
  constructor(
    private readonly proxyLoginCallback?: (authInfo: AuthInfo, callback: LoginCallback) => void,
    private readonly crossOriginRedirectListener?: CrossOriginRedirectListener,
    private readonly isInsecureFeedAllowed: () => boolean = () => false
  ) {
    super()
  }

  async download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    return await options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      const requestOptions = {
        headers: options.headers || undefined,
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
   * unless it goes to a loopback host or the app set `allowInsecureFeed`.
   */
  createRequest(options: any, callback: (response: any) => void): Electron.ClientRequest {
    // fix (node 7+) for making electron updater work when using AWS private buckets, check if headers contain Host property
    if (options.headers && options.headers.Host) {
      // set host value from headers.Host
      options.host = options.headers.Host
      // remove header property 'Host', if not removed causes net::ERR_INVALID_ARGUMENT exception
      delete options.headers.Host
    }
    if (options.protocol !== "https:" && !this.isInsecureFeedAllowed()) {
      checkInsecureRequestIsLoopback(options)
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
    if (this.proxyLoginCallback != null) {
      request.on("login", this.proxyLoginCallback)
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
   * while {@link HttpExecutor.prepareRedirectUrlOptions} keeps only the cross-origin allowlist of headers when the target is on another
   * origin (the names of the others go to the `crossOriginRedirectListener`).
   * Up to `maxRedirects` redirects are followed; `redirectCount` is the number already followed. A redirect to a protocol other than
   * http(s) is rejected, and so is anything `handler` throws.
   */
  addRedirectHandlers(request: ClientRequest, options: RequestOptions, reject: (error: Error) => void, redirectCount: number, handler: (options: RequestOptions) => void): void {
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
        const redirectOptions = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options, this.crossOriginRedirectListener)
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

function checkInsecureRequestIsLoopback(options: RequestOptions): void {
  // net.request connects to `host` (with its port) when it is set, else to `hostname` and `port`; without a protocol it uses http
  const host = options.host ?? `${options.hostname ?? ""}${options.port == null ? "" : `:${options.port}`}`
  let hostname: string | null = null
  try {
    hostname = new URL(`http://${host}`).hostname
  } catch {
    // not a host: not loopback
  }
  if (hostname != null && isLoopbackHostname(hostname)) {
    return
  }
  throw newError(
    `electron-updater 7 rejects the update request to ${options.protocol ?? "http:"}//${host}: the update feed, its downloads and every redirect must use https, ` +
      "except to a loopback host (localhost, 127.0.0.0/8, ::1). Serve your updates over https, or set autoUpdater.allowInsecureFeed = true to accept plain http (not recommended). " +
      `See ${INSECURE_FEED_DOCS}`,
    "ERR_UPDATER_INSECURE_FEED"
  )
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
