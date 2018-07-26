import { AllPublishOptions, CancellationToken, configureRequestOptionsFromUrl, DigestTransform, newError, RequestHeaders, safeStringifyJson } from "builder-util-runtime"
import { createServer, IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "http"
import { AddressInfo } from "net"
import { AppUpdater, DownloadUpdateOptions } from "./AppUpdater"
import { DOWNLOAD_PROGRESS, UPDATE_DOWNLOADED } from "./main"
import { findFile } from "./providers/Provider"
import { createReadStream, stat } from "fs-extra-p"
import AutoUpdater = Electron.AutoUpdater

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

  protected async doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const files = (await this.provider).resolveFiles(downloadUpdateOptions.updateInfo)
    const zipFileInfo = findFile(files, "zip", ["pkg", "dmg"])
    if (zipFileInfo == null) {
      throw newError(`ZIP file not provided: ${safeStringifyJson(files)}`, "ERR_UPDATER_ZIP_FILE_NOT_FOUND")
    }

    const server = createServer()
    server.on("close", () => {
      this._logger.info(`Proxy server for native Squirrel.Mac is closed (was started to download ${zipFileInfo.url.href})`)
    })

    function getServerUrl() {
      const address = server.address() as AddressInfo
      return `http://${address.address}:${address.port}`
    }

    return await this.executeDownload({
      fileExtension: "zip",
      fileInfo: zipFileInfo,
      downloadUpdateOptions,
      task: (destinationFile, downloadOptions) => {
        return this.httpExecutor.download(zipFileInfo.url.href, destinationFile, downloadOptions)
      },
      done: async updateFile => {
        let updateFileSize = zipFileInfo.info.size
        if (updateFileSize == null) {
          updateFileSize = (await stat(updateFile)).size
        }

        return await new Promise<Array<string>>((resolve, reject) => {
          server.on("request", (request: IncomingMessage, response: ServerResponse) => {
            const requestUrl = request.url!!
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

              this._logger.info(`app.zip requested by Squirrel.Mac, pipe ${updateFile}`)

              const readStream = createReadStream(updateFile)
              readStream.on("error", error => {
                try {
                  response.end()
                }
                catch (e) {
                  errorOccurred = true
                  this.nativeUpdater.removeListener("error", reject)
                  reject(new Error(`Cannot pipe "${updateFile}": ${error}`))
                }
              })

              response.writeHead(200, {
                "Content-Type": "application/zip",
                "Content-Length": updateFileSize,
              })
              readStream.pipe(response)
            }
            else {
              this._logger.warn(`${requestUrl} requested, but not supported`)
              response.writeHead(404)
              response.end()
            }
          })
          server.listen(0, "127.0.0.1", 8, () => {
            this.nativeUpdater.setFeedURL(`${getServerUrl()}`, {"Cache-Control": "no-cache"})

            this.nativeUpdater.once("error", reject)
            this.nativeUpdater.checkForUpdates()
          })
        })
      }
    })
  }

  private doProxyUpdateFile(nativeResponse: ServerResponse, url: string, headers: OutgoingHttpHeaders, sha512: string | null, cancellationToken: CancellationToken, errorHandler: (error: Error) => void) {
    const downloadRequest = this.httpExecutor.doRequest(configureRequestOptionsFromUrl(url, {headers}), downloadResponse => {
      const nativeHeaders: RequestHeaders = {"Content-Type": "application/zip"}
      const streams: Array<any> = []
      const downloadListenerCount = this.listenerCount(DOWNLOAD_PROGRESS)
      this._logger.info(`${DOWNLOAD_PROGRESS} listener count: ${downloadListenerCount}`)
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

    downloadRequest.on("redirect", (statusCode: number, method: string, redirectUrl: string) => {
      if (headers.authorization != null && (headers!!.authorization as string).startsWith("token")) {
        const parsedNewUrl = new URL(redirectUrl)
        if (parsedNewUrl.hostname.endsWith(".amazonaws.com")) {
          delete headers.authorization
        }
      }
      this.doProxyUpdateFile(nativeResponse, redirectUrl, headers, sha512, cancellationToken, errorHandler)
    })
    downloadRequest.on("error", errorHandler)
    downloadRequest.end()
  }

  quitAndInstall(): void {
    this.nativeUpdater.quitAndInstall()
  }
}