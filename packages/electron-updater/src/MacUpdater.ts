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
      return `http://localhost:${address.port}`
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
          // insecure random is ok
          const fileUrl = "/" + Date.now() + "-" + Math.floor(Math.random() * 9999) + ".zip"
          server.on("request", (request: IncomingMessage, response: ServerResponse) => {
            const requestUrl = request.url!!
            this._logger.info(`${requestUrl} requested`)
            if (requestUrl === "/") {
              const data = Buffer.from(`{ "url": "${getServerUrl()}${fileUrl}" }`)
              response.writeHead(200, {"Content-Type": "application/json", "Content-Length": data.length})
              response.end(data)
              return
            }

            if (!requestUrl.startsWith(fileUrl)) {
              this._logger.warn(`${requestUrl} requested, but not supported`)
              response.writeHead(404)
              response.end()
              return
            }

            this._logger.info(`${fileUrl} requested by Squirrel.Mac, pipe ${updateFile}`)

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

            const readStream = createReadStream(updateFile)
            readStream.on("error", error => {
              try {
                response.end()
              }
              catch (e) {
                this._logger.warn(`cannot end response: ${e}`)
              }
              errorOccurred = true
              this.nativeUpdater.removeListener("error", reject)
              reject(new Error(`Cannot pipe "${updateFile}": ${error}`))
            })

            response.writeHead(200, {
              "Content-Type": "application/zip",
              "Content-Length": updateFileSize,
            })
            readStream.pipe(response)
          })
          // must be localhost, added to NSExceptionDomains
          server.listen(0, "localhost", () => {
            this.nativeUpdater.setFeedURL({
              url: getServerUrl(),
              headers: {"Cache-Control": "no-cache"},
            })

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