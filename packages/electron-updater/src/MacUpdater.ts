import { AllPublishOptions, newError, safeStringifyJson } from "builder-util-runtime"
import { createReadStream, stat } from "fs-extra-p"
import { createServer, IncomingMessage, ServerResponse } from "http"
import { AddressInfo } from "net"
import { BaseUpdater } from "./BaseUpdater"
import { DownloadUpdateOptions } from "./AppUpdater"
import { findFile } from "./providers/Provider"
import AutoUpdater = Electron.AutoUpdater

export class MacUpdater extends BaseUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  constructor(options?: AllPublishOptions) {
    super(options)

    this.nativeUpdater.on("error", it => {
      this._logger.warn(it)
      this.emit("error", it)
    })
  }

  protected doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    const files = downloadUpdateOptions.updateInfoAndProvider.provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info)
    const zipFileInfo = findFile(files, "zip", ["pkg", "dmg"])
    if (zipFileInfo == null) {
      throw newError(`ZIP file not provided: ${safeStringifyJson(files)}`, "ERR_UPDATER_ZIP_FILE_NOT_FOUND")
    }

    return this.executeDownload({
      fileExtension: "zip",
      fileInfo: zipFileInfo,
      downloadUpdateOptions,
      task: (destinationFile, downloadOptions) => {
        return this.httpExecutor.download(zipFileInfo.url.href, destinationFile, downloadOptions)
      }
    })
  }

  protected async doInstall(installerPath: string): Promise<boolean> {
    const server = createServer()
    server.on("close", () => {
      this._logger.info(`Proxy server for native Squirrel.Mac is closed`)
    })

    function getServerUrl() {
      const address = server.address() as AddressInfo
      return `http://127.0.0.1:${address.port}`
    }

    const updateFileSize = (await stat(installerPath)).size
    return await new Promise<boolean>((resolve, reject) => {
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

        this._logger.info(
          `${fileUrl} requested by Squirrel.Mac, pipe ${installerPath}`
        )

        let errorOccurred = false
        response.on("finish", () => {
          try {
            setImmediate(() => server.close())
          }
          finally {
            if (!errorOccurred) {
              this.nativeUpdater.removeListener("error", reject)
            }
            resolve(false)
          }
        })

        const readStream = createReadStream(installerPath)
        readStream.on("error", error => {
          try {
            response.end()
          }
          catch (e) {
            this._logger.warn(`cannot end response: ${e}`)
          }
          errorOccurred = true
          this.nativeUpdater.removeListener("error", reject)
          reject(new Error(`Cannot pipe "${installerPath}": ${error}`))
        })

        response.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Length": updateFileSize
        })
        readStream.pipe(response)
      })
      server.listen(0, "127.0.0.1", () => {
        this.nativeUpdater.setFeedURL({
          url: getServerUrl(),
          headers: {"Cache-Control": "no-cache"},
        })

        this.nativeUpdater.on("update-downloaded", () => resolve(true))
        this.nativeUpdater.once("error", reject)
        this.nativeUpdater.checkForUpdates()
      })
    })
  }

  async quitAndInstall(isSilent: boolean = false, isForceRunAfter: boolean = false): Promise<void> {
    this._logger.info(`Install on explicit quitAndInstall`)
    const isInstalled = await this.install(isSilent, isSilent ? isForceRunAfter : true)
    if (isInstalled) {
      this.nativeUpdater.quitAndInstall()
    }
    else {
      this.quitAndInstallCalled = false
    }
  }
}
