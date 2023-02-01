import { DownloadOptions, HttpExecutor, configureRequestOptions, configureRequestUrl } from "builder-util-runtime"
import { AuthInfo } from "electron"
import { RequestOptions } from "http"
import Session = Electron.Session
import ClientRequest = Electron.ClientRequest

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
    }) as Electron.ClientRequest
    request.on("response", callback)
    if (this.proxyLoginCallback != null) {
      request.on("login", this.proxyLoginCallback)
    }
    return request
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
