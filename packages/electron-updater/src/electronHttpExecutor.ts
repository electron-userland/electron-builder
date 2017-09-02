import { net, session } from "electron"
import { configureRequestOptionsFromUrl, DownloadOptions, HttpExecutor } from "electron-builder-http"
import { ensureDir } from "fs-extra-p"
import * as path from "path"

export const NET_SESSION_NAME = "electron-updater"

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
      this.doDownload(configureRequestOptionsFromUrl(url, {
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

  public doRequest(options: any, callback: (response: any) => void): any {
    const request = (net as any).request({session: (session as any).fromPartition(NET_SESSION_NAME), ...options}, callback)
    this.addProxyLoginHandler(request)
    return request
  }

  private addProxyLoginHandler(request: Electron.ClientRequest) {
    if (this.proxyLoginCallback != null) {
      request.on("login", this.proxyLoginCallback)
    }
  }
}