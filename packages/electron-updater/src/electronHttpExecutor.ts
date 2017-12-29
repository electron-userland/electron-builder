import { configureRequestOptionsFromUrl, DownloadOptions, HttpExecutor } from "builder-util-runtime"
import { net } from "electron"
import { ensureDir } from "fs-extra-p"
import { RequestOptions } from "http"
import * as path from "path"

export type LoginCallback = (username: string, password: string) => void

export class ElectronHttpExecutor extends HttpExecutor<Electron.ClientRequest> {
  constructor(private readonly proxyLoginCallback?: (authInfo: any, callback: LoginCallback) => void) {
    super()
  }

  async download(url: string, destination: string, options: DownloadOptions): Promise<string> {
    if (options == null || !options.skipDirCreation) {
      await ensureDir(path.dirname(destination))
    }

    return await options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      this.doDownload({
        ...configureRequestOptionsFromUrl(url, {
          headers: options.headers || undefined,
        }),
        redirect: "manual",
      }, destination, 0, options, error => {
        if (error == null) {
          resolve(destination)
        }
        else {
          reject(error)
        }
      }, onCancel)
    })
  }

  public doRequest(options: any, callback: (response: any) => void): any {
    const request = net.request(options)
    request.on("response", callback)
    this.addProxyLoginHandler(request)
    return request
  }

  private addProxyLoginHandler(request: Electron.ClientRequest) {
    if (this.proxyLoginCallback != null) {
      request.on("login", this.proxyLoginCallback)
    }
  }

  protected addRedirectHandlers(request: any, options: RequestOptions, reject: (error: Error) => void, redirectCount: number, handler: (options: RequestOptions) => void) {
    request.on("redirect", (statusCode: number, method: string, redirectUrl: string) => {
      if (redirectCount > 10) {
        reject(new Error("Too many redirects (> 10)"))
        return
      }

      handler(HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options))
    })
  }
}