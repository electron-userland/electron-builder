import { createRequire } from "node:module"
import { CrossOriginHeadersCallback, DownloadOptions, HttpExecutor, configureRequestOptions, configureRequestUrl } from "builder-util-runtime"

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

/**
 * Gets Electron's `login` event of a request: `requestUrl` is the URL of that request (Electron's `AuthInfo` names only the challenger's
 * host and port), `null` when it cannot be determined from the request options.
 */
export type LoginChallengeListener = (authInfo: AuthInfo, callback: LoginCallback, requestUrl: URL | null) => void

export class ElectronHttpExecutor extends HttpExecutor<Electron.ClientRequest> {
  private cachedSession: Session | null = null

  /**
   * @param crossOriginHeaders chooses the headers each redirect to another origin sends on (the `crossOriginHeaders` of
   * `AppUpdater.checkForUpdates`); without it, builder-util-runtime's `DEFAULT_CROSS_ORIGIN_HEADERS`
   */
  constructor(
    private readonly loginChallengeListener?: LoginChallengeListener,
    crossOriginHeaders?: CrossOriginHeadersCallback
  ) {
    super(crossOriginHeaders)
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

  createRequest(options: any, callback: (response: any) => void): Electron.ClientRequest {
    // fix (node 7+) for making electron updater work when using AWS private buckets, check if headers contain Host property
    if (options.headers && options.headers.Host) {
      // set host value from headers.Host
      options.host = options.headers.Host
      // remove header property 'Host', if not removed causes net::ERR_INVALID_ARGUMENT exception
      delete options.headers.Host
    }

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
        requestUrl = authority == null || typeof options.protocol !== "string" ? null : new URL(`${options.protocol}//${authority}${options.path || "/"}`)
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
   * while {@link HttpExecutor.prepareRedirectUrlOptions} keeps only the headers {@link HttpExecutor.crossOriginHeaders} returns when the
   * target is on another origin.
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
        const redirectOptions = HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options, this.crossOriginHeaders)
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
