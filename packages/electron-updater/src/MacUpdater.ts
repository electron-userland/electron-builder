import BluebirdPromise from "bluebird-lst"
import { CancellationToken, configureRequestOptions, DigestTransform, ProgressCallbackTransform, safeGetHeader } from "electron-builder-http"
import { PublishConfiguration } from "electron-builder-http/out/publishOptions"
import { VersionInfo } from "electron-builder-http/out/updateInfo"
import { createServer, IncomingMessage, ServerResponse } from "http"
import { parse as parseUrl } from "url"
import { AppUpdater } from "./AppUpdater"
import { DOWNLOAD_PROGRESS, FileInfo, UPDATE_DOWNLOADED } from "./main"
import AutoUpdater = Electron.AutoUpdater
import { RequestHeaders } from "../../electron-builder-http/src/httpExecutor"

export class MacUpdater extends AppUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  constructor(options?: PublishConfiguration) {
    super(options)

    this.nativeUpdater.on("error", it => {
      this._logger.warn(it)
      this.emit("error", it)
    })
    this.nativeUpdater.on("update-downloaded", () => {
      this._logger.info(`New version ${this.versionInfo!.version} has been downloaded`)
      this.emit(UPDATE_DOWNLOADED, this.versionInfo)
    })
  }

  protected doDownloadUpdate(versionInfo: VersionInfo, fileInfo: FileInfo, cancellationToken: CancellationToken) {
    const server = createServer()
    server.on("close", () => {
      this._logger.info(`Proxy server for native Squirrel.Mac is closed (was started to download ${fileInfo.url})`)
    })

    function getServerUrl() {
      const address = server.address()
      return `http://${address.address}:${address.port}`
    }

    return new BluebirdPromise<void>((resolve, reject) => {
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
                resolve()
              }
            }
          })
          this.proxyUpdateFile(response, fileInfo, error => {
            errorOccurred = true
            try {
              response.writeHead(500)
              response.end()
            }
            finally {
              reject(new Error(`Cannot download "${fileInfo.url}": ${error}`))
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
        this.nativeUpdater.setFeedURL(`${getServerUrl()}`, Object.assign({"Cache-Control": "no-cache"}, this.computeRequestHeaders(fileInfo)))
        this.nativeUpdater.checkForUpdates()
      })
    })
  }

  private proxyUpdateFile(nativeResponse: ServerResponse, fileInfo: FileInfo, errorHandler: (error: Error) => void) {
    const parsedUrl = parseUrl(fileInfo.url)
    const downloadRequest = this.httpExecutor.doRequest(configureRequestOptions({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : undefined,
      headers: this.computeRequestHeaders(fileInfo) || undefined,
    }), downloadResponse => {
      if (downloadResponse.statusCode! >= 400) {
        try {
          nativeResponse.writeHead(404)
          nativeResponse.end()
        }
        finally {
          this.emit("error", new Error(`Cannot download "${fileInfo.url}", status ${downloadResponse.statusCode}: ${downloadResponse.statusMessage}`))
        }
        return
      }

      const headers: RequestHeaders = {"Content-Type": "application/zip"}
      const streams: Array<any> = []
      if (this.listenerCount(DOWNLOAD_PROGRESS) > 0) {
        const contentLength = safeGetHeader(downloadResponse, "content-length")
        if (contentLength != null) {
          headers["Content-Length"] = contentLength
          streams.push(new ProgressCallbackTransform(parseInt(contentLength, 10), new CancellationToken(), it => this.emit(DOWNLOAD_PROGRESS, it)))
        }
      }

      nativeResponse.writeHead(200, headers)

      // for mac only sha512 is produced (sha256 is published for windows only to preserve backward compatibility)
      const sha512 = fileInfo.sha512
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