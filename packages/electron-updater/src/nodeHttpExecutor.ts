import { DownloadOptions, HttpExecutor, configureRequestOptions, configureRequestUrl } from "builder-util-runtime"
import { ClientRequest, request as httpRequest } from "http"
import * as https from "https"

export class NodeHttpExecutor extends HttpExecutor<ClientRequest> {
  async download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    return await options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      const requestOptions = {
        headers: options.headers || undefined,
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

  createRequest(options: any, callback: (response: any) => void): any {
    // fix (node 7+) for making electron updater work when using AWS private buckets, check if headers contain Host property
    if (options.headers && options.headers.Host) {
      // set host value from headers.Host
      options.host = options.headers.Host
      // remove header property 'Host', if not removed causes net::ERR_INVALID_ARGUMENT exception
      delete options.headers.Host
    }

    // differential downloader can call this method very often, so, better to cache session

    return (options.protocol === "http:" ? httpRequest : https.request)(options, callback)
  }
}
