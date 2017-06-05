import _debug from "debug"
import { net, session } from "electron"
import { configureRequestOptions, DownloadOptions, dumpRequestOptions, HttpExecutor } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { ensureDir } from "fs-extra-p"
import * as path from "path"
import { parse as parseUrl } from "url"

export const NET_SESSION_NAME = "electron-updater"

const debug = _debug("electron-builder")

export type LoginCallback = (username: string, password: string) => void

export class ElectronHttpExecutor extends HttpExecutor<Electron.ClientRequest> {
  constructor(private proxyLoginCallback?: (authInfo: any, callback: LoginCallback) => void) {
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

  doApiRequest<T>(options: any, cancellationToken: CancellationToken, requestProcessor: (request: Electron.ClientRequest, reject: (error: Error) => void) => void, redirectCount: number = 0): Promise<T> {
    if (debug.enabled) {
      debug(`request: ${dumpRequestOptions(options)}`)
    }
    
    return cancellationToken.createPromise<T>((resolve, reject, onCancel) => {
      const request = (<any>net).request(Object.assign({session: (<any>session).fromPartition(NET_SESSION_NAME)}, options), (response: any) => {
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


  public doRequest(options: any, callback: (response: any) => void): any {
    const request = (<any>net).request(Object.assign({session: (<any>session).fromPartition(NET_SESSION_NAME)}, options), callback)
    this.addProxyLoginHandler(request)
    return request
  }

  private addProxyLoginHandler(request: Electron.ClientRequest) {
    if (this.proxyLoginCallback != null) {
      request.on("login", this.proxyLoginCallback)
    }
  }
}