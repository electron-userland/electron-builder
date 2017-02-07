import { net } from "electron"
import { ensureDir } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { HttpExecutor, DownloadOptions, dumpRequestOptions, configureRequestOptions } from "electron-builder-http"
import { parse as parseUrl } from "url"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"

export class ElectronHttpExecutor extends HttpExecutor<Electron.RequestOptions, Electron.ClientRequest> {
  async download(url: string, destination: string, options?: DownloadOptions | null): Promise<string> {
    if (options == null || !options.skipDirCreation) {
      await ensureDir(path.dirname(destination))
    }

    return await new BluebirdPromise<string>((resolve, reject) => {
      const parsedUrl = parseUrl(url)

      this.doDownload(configureRequestOptions({
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        path: parsedUrl.path,
        port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : undefined,
        headers: (options == null ? null : options.headers) || undefined,
      }), destination, 0, options || {cancellationToken: new CancellationToken()}, (error: Error) => {
        if (error == null) {
          resolve(destination)
        }
        else {
          reject(error)
        }
      })
    })
  }

  doApiRequest<T>(options: Electron.RequestOptions, cancellationToken: CancellationToken, requestProcessor: (request: Electron.ClientRequest, reject: (error: Error) => void) => void, redirectCount: number = 0): Promise<T> {
    if (<any>options.Protocol != null) {
      // electron typings defines it as incorrect Protocol (uppercase P)
      (<any>options).protocol = options.Protocol
    }

    if (this.debug.enabled) {
      this.debug(`request: ${dumpRequestOptions(options)}`)
    }

    return cancellationToken.trackPromise(new BluebirdPromise<T>((resolve, reject, onCancel) => {
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
      onCancel!(() => request.abort())
    }))
  }


  protected doRequest(options: any, callback: (response: any) => void): any {
    return net.request(options, callback)
  }
}