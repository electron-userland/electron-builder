import BluebirdPromise from "bluebird-lst"
import { CancellationToken, configureRequestOptionsFromUrl, DigestTransform, ProgressCallbackTransform, AllPublishOptions, RequestHeaders, safeGetHeader, UpdateInfo } from "builder-util-runtime"
import { createServer, IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "http"
import { AppUpdater } from "./AppUpdater"
import { DOWNLOAD_PROGRESS, UPDATE_DOWNLOADED } from "./main"
import AutoUpdater = Electron.AutoUpdater
import { findFile } from "./Provider"

export class MacUpdater extends AppUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  constructor(options?: AllPublishOptions) {
    super(options)

    this.nativeUpdater.on("error", it => {
      this._logger.warn(it)
      this.emit("error", it)
    })
    this.nativeUpdater.on("update-downloaded", () => {
      this._logger.info(`New version ${this.updateInfo!.version} has been downloaded`)
      this.emit(UPDATE_DOWNLOADED, this.updateInfo)
    })
  }

  protected async doDownloadUpdate(updateInfo: UpdateInfo, cancellationToken: CancellationToken): Promise<Array<string>> {
    const files = (await this.provider).resolveFiles(updateInfo)
    const zipFileInfo = findFile(files, "zip", ["pkg", "dmg"])

    const server = createServer()
    server.on("close", () => {
      this._logger.info(`Proxy server for native Squirrel.Mac is closed (was started to download ${zipFileInfo.url.href})`)
    })

    function getServerUrl() {
      const address = server.address()
      return `http://${address.address}:${address.port}`
    }

    const requestHeaders = await this.computeRequestHeaders()

    return await new BluebirdPromise<Array<string>>((resolve, reject) => {
      server.on("request", (request: IncomingMessage, response: ServerResponse) => {
        const requestUrl = request.url!
        this._logger.info(`${requestUrl} requested`)
        if (requestUrl === "/") {
          const data = Buffer.from(`{ "url": "${getServerUrl()}/app.zip" }`)
          response.writeHead(200, {"Content-Type": "application/json", "Content-Length": data.length})
          response.end(data)
        }
        else if (requestUrl.startsWith("/app.zip")) {
          let errorOccurred = false
          response.on("finish", () => {
            try {
              setImmediate(() => server.close())
            }
            finally {
              if (!errorOccurred) {
                this.nativeUpdater.removeListener("error", reject)
                resolve([])
              }
            }
          })
          this.doProxyUpdateFile(response, zipFileInfo.url.href, requestHeaders, zipFileInfo.info.sha512, cancellationToken, error => {
            errorOccurred = true
            try {
              response.writeHead(500)
              response.end()
            }
            finally {
              this.nativeUpdater.removeListener("error", reject)
              reject(new Error(`Cannot download "${zipFileInfo.url}": ${error}`))
            }
          })
        }
        else {
          this._logger.warn(`${requestUrl} requested, but not supported`)
          response.writeHead(404)
          response.end()
        }
      })
      server.listen(0, "127.0.0.1", 16, () => {
        this.nativeUpdater.setFeedURL(`${getServerUrl()}`, {"Cache-Control": "no-cache"})

        this.nativeUpdater.once("error", reject)
        this.nativeUpdater.checkForUpdates()
      })
    })
  }

  private doProxyUpdateFile(nativeResponse: ServerResponse, url: string, headers: OutgoingHttpHeaders, sha512: string | null, cancellationToken: CancellationToken, errorHandler: (error: Error) => void) {
    const downloadRequest = this.httpExecutor.doRequest(configureRequestOptionsFromUrl(url, {headers}), downloadResponse => {
      if (downloadResponse.statusCode! >= 400) {
        try {
          nativeResponse.writeHead(404)
          nativeResponse.end()
        }
        finally {
          errorHandler(new Error(`Cannot download "${url}", status ${downloadResponse.statusCode}: ${downloadResponse.statusMessage}`))
        }
        return
      }

      // in tests Electron NET Api is not used, so, we have to handle redirect.
      const redirectUrl = safeGetHeader(downloadResponse, "location")
      if (redirectUrl != null) {
        this.doProxyUpdateFile(nativeResponse, redirectUrl, headers, sha512, cancellationToken, errorHandler)
        return
      }

      const nativeHeaders: RequestHeaders = {"Content-Type": "application/zip"}
      const streams: Array<any> = []
      const downloadListenerCount = this.listenerCount(DOWNLOAD_PROGRESS)
      this._logger.info(`${DOWNLOAD_PROGRESS} listener count: ${downloadListenerCount}`)
      if (downloadListenerCount > 0) {
        const contentLength = safeGetHeader(downloadResponse, "content-length")
        this._logger.info(`contentLength: ${contentLength}`)
        if (contentLength != null) {
          nativeHeaders["Content-Length"] = contentLength
          streams.push(new ProgressCallbackTransform(parseInt(contentLength, 10), cancellationToken, it => this.emit(DOWNLOAD_PROGRESS, it)))
        }
      }

      nativeResponse.writeHead(200, nativeHeaders)

      // for mac only sha512 is produced (sha256 is published for windows only to preserve backward compatibility)
      if (sha512 != null) {
        // "hex" to easy migrate to new base64 encoded hash (we already produces latest-mac.yml with hex encoded hash)
        streams.push(new DigestTransform(sha512, "sha512", sha512.length === 128 && !sha512.includes("+") && !sha512.includes("Z") && !sha512.includes("=") ? "hex" : "base64"))
      }

      streams.push(nativeResponse)

      let lastStream = downloadResponse
      for (const stream of streams) {
        stream.on("error", errorHandler)
        lastStream = lastStream.pipe(stream)
      }
    })

    downloadRequest.on("error", errorHandler)
    downloadRequest.end()
  }

  quitAndInstall(): void {
    this.nativeUpdater.quitAndInstall()
  }
}