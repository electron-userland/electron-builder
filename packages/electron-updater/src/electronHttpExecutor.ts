import { net, session } from "electron"
import { configureRequestOptions, DownloadOptions, dumpRequestOptions, HttpExecutor } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { ensureDir } from "fs-extra-p"
import * as path from "path"
import { parse as parseUrl } from "url"

export class ElectronHttpExecutor extends HttpExecutor<Electron.RequestOptions, Electron.ClientRequest> {
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
    if (this.debug.enabled) {
      this.debug(`request: ${dumpRequestOptions(options)}`)
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
      this.addTimeOutHandler(request, reject)
      request.on("error", reject)
      requestProcessor(request, reject)
      onCancel(() => request.abort())
    })
  }


  protected doRequest(options: any, callback: (response: any) => void): any {
    options.session = session.fromPartition('electron-updater')
    return net.request(options, callback)
  }
}