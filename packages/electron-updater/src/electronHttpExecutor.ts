import { configureRequestOptionsFromUrl, DownloadOptions, HttpExecutor, safeGetHeader } from "builder-util-runtime"
import { net, session } from "electron"
import { RequestOptions } from "http"
import Session = Electron.Session
import ClientRequest = Electron.ClientRequest

export type LoginCallback = (username: string, password: string) => void
export const NET_SESSION_NAME = "electron-updater"

export function getNetSession(): Session {
  return session.fromPartition(NET_SESSION_NAME, {
    cache: false
  })
}

export class ElectronHttpExecutor extends HttpExecutor<Electron.ClientRequest> {
  private cachedSession: Session | null = null

  constructor(private readonly proxyLoginCallback?: (authInfo: any, callback: LoginCallback) => void) {
    super()
  }

  async download(url: string, destination: string, options: DownloadOptions): Promise<string> {
    return await options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      this.doDownload({
        ...configureRequestOptionsFromUrl(url, {
          headers: options.headers || undefined,
        }),
        redirect: "manual",
      }, {
        destination,
        options,
        onCancel,
        callback: error => {
          if (error == null) {
            resolve(destination)
          }
          else {
            reject(error)
          }
        },
        responseHandler: null,
      }, 0)
    })
  }

  async downloadToBuffer(url: string, options: DownloadOptions): Promise<Buffer> {
    return await options.cancellationToken.createPromise<Buffer>((resolve, reject, onCancel) => {
      let result: Buffer | null = null
      this.doDownload({
        ...configureRequestOptionsFromUrl(url, {
          headers: options.headers || undefined,
        }),
        // because PrivateGitHubProvider requires HttpExecutor.prepareRedirectUrlOptions logic, so, we need to redirect manually
        redirect: "manual",
      }, {
        destination: null,
        options,
        onCancel,
        callback: error => {
          if (error == null) {
            resolve(result!!)
          }
          else {
            reject(error)
          }
        },
        responseHandler: (response, callback) => {
          const contentLength = safeGetHeader(response, "content-length")
          let position = -1
          if (contentLength != null) {
            const size = parseInt(contentLength, 10)
            if (size > 0) {
              if (size > 5242880) {
                callback(new Error("Maximum allowed size is 5 MB"))
                return
              }

              result = Buffer.alloc(size)
              position = 0
            }
          }
          response.on("data", (chunk: Buffer) => {
            if (position !== -1) {
              chunk.copy(result!!, position)
              position += chunk.length
            }
            else if (result == null) {
              result = chunk
            }
            else {
              if (result.length > 5242880) {
                callback(new Error("Maximum allowed size is 5 MB"))
                return
              }
              result = Buffer.concat([result, chunk])
            }
          })
          response.on("end", () => {
            if (result != null && position !== -1 && position !== result.length) {
              callback(new Error(`Received data length ${position} is not equal to expected ${result.length}`))
            }
            else {
              callback(null)
            }
          })
        },
      }, 0)
    })
  }

  createRequest(options: any, callback: (response: any) => void): any {
    // differential downloader can call this method very often, so, better to cache session
    if (this.cachedSession == null) {
      this.cachedSession = getNetSession()
    }

    const request = net.request({
      ...options,
      session: this.cachedSession,
    })
    request.on("response", callback)
    if (this.proxyLoginCallback != null) {
      request.on("login", this.proxyLoginCallback)
    }
    return request
  }
  protected addRedirectHandlers(request: ClientRequest, options: RequestOptions, reject: (error: Error) => void, redirectCount: number, handler: (options: RequestOptions) => void) {
    request.on("redirect", (statusCode: number, method: string, redirectUrl: string) => {
      // no way to modify request options, abort old and make a new one
      // https://github.com/electron/electron/issues/11505
      request.abort()

      if (redirectCount > this.maxRedirects) {
        reject(this.createMaxRedirectError())
      }
      else {
        handler(HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options))
      }
    })
  }
}