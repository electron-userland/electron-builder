import _debug from "debug"
import { net, session } from "electron"
import { configureRequestOptions, DownloadOptions, dumpRequestOptions, HttpExecutor } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { ensureDir } from "fs-extra-p"
import * as path from "path"
import { parse as parseUrl } from "url"

export const NET_SESSION_NAME = "electron-updater"

const debug = _debug("electron-builder")

export class ElectronHttpExecutor extends HttpExecutor<Electron.RequestOptions, Electron.ClientRequest> {
  constructor(private proxyLoginCallback?: (authInfo: Electron.LoginAuthInfo,
      callback: (username: string, password: string) => void) => void) {
    super()
  }

  async download(url: string, destination: string, options: DownloadOptions): Promise<string> {
    if (options == null || !options.skipDirCreation) {
      await ensureDir(path.dirname(destination))
    }

    return await options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      const parsedUrl = parseUrl(url)

      this.doDownload(configureRequestOptions({
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        path: parsedUrl.path,
        port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : undefined,
        headers: options.headers || undefined,
      }), destination, 0, options, (error: Error) => {
        if (error == null) {
          resolve(destination)
        }
        else {
          reject(error)
        }
      }, onCancel)
    })
  }

  doApiRequest<T>(options: Electron.RequestOptions, cancellationToken: CancellationToken, requestProcessor: (request: Electron.ClientRequest, reject: (error: Error) => void) => void, redirectCount: number = 0): Promise<T> {
    if (debug.enabled) {
      debug(`request: ${dumpRequestOptions(options)}`)
    }

    return cancellationToken.createPromise<T>((resolve, reject, onCancel) => {
      const request = net.request(options, response => {
        try {
          this.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)
        }
        catch (e) {
          reject(e)
        }
      })
      this.addProxyLoginHandler(request)
      this.addTimeOutHandler(request, reject)
      request.on("error", reject)
      requestProcessor(request, reject)
      onCancel(() => request.abort())
    })
  }


  protected doRequest(options: any, callback: (response: any) => void): any {
    options.session = session.fromPartition(NET_SESSION_NAME)
    const request = net.request(options, callback)
    this.addProxyLoginHandler(request)
    return request
  }

  protected addProxyLoginHandler(request: Electron.ClientRequest) {
    if (this.proxyLoginCallback !== undefined)
      request.on("login", this.proxyLoginCallback)
  }
}