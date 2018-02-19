import { HttpExecutor, DownloadOptions } from "builder-util-runtime"
import { download as _download } from "./binDownload"
import { ClientRequest, request as httpRequest } from "http"
import * as https from "https"

export class NodeHttpExecutor extends HttpExecutor<ClientRequest> {
  // used only in tests of electron-updater
  download(url: string, destination: string, options: DownloadOptions): Promise<string> {
    return _download(url, destination, options == null ? null : options.sha512)
      .then(() => destination)
  }

  // noinspection JSMethodCanBeStatic
  // noinspection JSUnusedGlobalSymbols
  doRequest(options: any, callback: (response: any) => void): any {
    return (options.protocol === "http:" ? httpRequest : https.request)(options, callback)
  }
}

export const httpExecutor: NodeHttpExecutor = new NodeHttpExecutor()