import { createRequire } from "node:module"
import { DownloadOptions, HttpExecutor, configureRequestOptions, configureRequestUrl } from "builder-util-runtime"

const require = createRequire(import.meta.url)
import type { AuthInfo } from "electron"
import { RequestOptions } from "http"
type Session = Electron.Session
type ClientRequest = Electron.ClientRequest

export type LoginCallback = (username: string, password: string) => void
export const NET_SESSION_NAME = "electron-updater"

export function getNetSession(): Session {
  return require("electron").session.fromPartition(NET_SESSION_NAME, {
    cache: false,
  })
}

export class ElectronHttpExecutor extends HttpExecutor<Electron.ClientRequest> {
  private cachedSession: Session | null = null

  constructor(private readonly proxyLoginCallback?: (authInfo: AuthInfo, callback: LoginCallback) => void) {
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

  protected addRedirectHandlers(
    request: ClientRequest,
    options: RequestOptions,
    reject: (error: Error) => void,
    redirectCount: number,
    handler: (options: RequestOptions) => void
  ): void {
    request.on("redirect", (statusCode: number, method: string, redirectUrl: string) => {
      // no way to modify request options, abort old and make a new one
      // https://github.com/electron/electron/issues/11505
      request.abort()

      if (redirectCount > this.maxRedirects) {
        reject(this.createMaxRedirectError())
      } else {
        handler(HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options))
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
