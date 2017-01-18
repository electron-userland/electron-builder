import { Socket } from "net"
import { net } from "electron"
import { ensureDir } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { HttpExecutor, DownloadOptions, maxRedirects, safeGetHeader, configurePipes, debug } from "electron-builder-http"
import { parse as parseUrl } from "url"

export class ElectronHttpExecutor extends HttpExecutor<Electron.RequestOptions, Electron.ClientRequest> {
  async download(url: string, destination: string, options?: DownloadOptions | null): Promise<string> {
    if (options == null || !options.skipDirCreation) {
      await ensureDir(path.dirname(destination))
    }

    return await new BluebirdPromise<string>((resolve, reject) => {
      this.doDownload(url, destination, 0, options || {}, (error: Error) => {
        if (error == null) {
          resolve(destination)
        }
        else {
          reject(error)
        }
      })
    })
  }

  private addTimeOutHandler(request: Electron.ClientRequest, callback: (error: Error) => void) {
    request.on("socket", function (socket: Socket) {
      socket.setTimeout(60 * 1000, () => {
        callback(new Error("Request timed out"))
        request.abort()
      })
    })
  }

  private doDownload(url: string, destination: string, redirectCount: number, options: DownloadOptions, callback: (error: Error | null) => void) {
    const parsedUrl = parseUrl(url)
    // user-agent must be specified, otherwise some host can return 401 unauthorised

    const requestOpts = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      port: parsedUrl.port ? +parsedUrl.port : undefined,
      headers: {
        "User-Agent": "electron-builder"
      },
    }

    const request = net.request(requestOpts, (response: Electron.IncomingMessage) => {
      if (response.statusCode >= 400) {
        callback(new Error(`Cannot download "${url}", status ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      const redirectUrl = safeGetHeader(response, "location")
      if (redirectUrl != null) {
        if (redirectCount < maxRedirects) {
          this.doDownload(redirectUrl, destination, redirectCount++, options, callback)
        }
        else {
          callback(new Error(`Too many redirects (> ${maxRedirects})`))
        }
        return
      }

      configurePipes(options, response, destination, callback)
    })
    this.addTimeOutHandler(request, callback)
    request.on("error", callback)
    request.end()
  }

  doApiRequest<T>(options: Electron.RequestOptions, token: string | null, requestProcessor: (request: Electron.ClientRequest, reject: (error: Error) => void) => void, redirectCount: number = 0): Promise<T> {
    const requestOptions: any = options
    if (debug.enabled) {
      debug(`request: ${JSON.stringify(requestOptions, null, 2)}`)
    }

    if (token != null) {
      (<any>requestOptions.headers).authorization = token.startsWith("Basic") ? token : `token ${token}`
    }

    requestOptions.protocol = options.Protocol || "https:"
    return new BluebirdPromise<T>((resolve, reject, onCancel) => {
      const request = net.request(options, response => {
        try {
          this.handleResponse(response, options, resolve, reject, redirectCount, token, requestProcessor)
        }
        catch (e) {
          reject(e)
        }
      })
      this.addTimeOutHandler(request, reject)
      request.on("error", reject)
      requestProcessor(request, reject)
      onCancel!(() => request.abort())
    })
  }
}