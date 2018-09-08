import { AllPublishOptions, newError, safeStringifyJson, UpdateInfo } from "builder-util-runtime"
import { createReadStream, stat } from "fs-extra-p"
import { createServer, IncomingMessage, ServerResponse } from "http"
import { AddressInfo } from "net"
import { AppUpdater, DownloadUpdateOptions } from "./AppUpdater"
import { UPDATE_DOWNLOADED } from "./main"
import { findFile } from "./providers/Provider"
import AutoUpdater = Electron.AutoUpdater

export class MacUpdater extends AppUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  private updateInfoForPendingUpdateDownloadedEvent: UpdateInfo | null = null

  constructor(options?: AllPublishOptions) {
    super(options)

    this.nativeUpdater.on("error", it => {
      this._logger.warn(it)
      this.emit("error", it)
    })
    this.nativeUpdater.on("update-downloaded", () => {
      const updateInfo = this.updateInfoForPendingUpdateDownloadedEvent
      this.updateInfoForPendingUpdateDownloadedEvent = null
      this.emit(UPDATE_DOWNLOADED, updateInfo)
    })
  }

  protected async doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    this.updateInfoForPendingUpdateDownloadedEvent = null

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
        this.updateInfoForPendingUpdateDownloadedEvent = downloadUpdateOptions.updateInfo
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

  quitAndInstall(): void {
    this.nativeUpdater.quitAndInstall()
  }
}