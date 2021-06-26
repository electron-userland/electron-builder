import { AllPublishOptions, newError, safeStringifyJson } from "builder-util-runtime"
import { stat } from "fs-extra"
import { createReadStream } from "fs"
import { createServer, IncomingMessage, ServerResponse } from "http"
import { AddressInfo } from "net"
import { AppAdapter } from "./AppAdapter"
import { AppUpdater, DownloadUpdateOptions } from "./AppUpdater"
import { ResolvedUpdateFileInfo } from "./main"
import { findFile } from "./providers/Provider"
import AutoUpdater = Electron.AutoUpdater
import { execFileSync } from "child_process"

export class MacUpdater extends AppUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  private squirrelDownloadedUpdate = false

  constructor(options?: AllPublishOptions, app?: AppAdapter) {
    super(options, app)

    this.nativeUpdater.on("error", it => {
      this._logger.warn(it)
      this.emit("error", it)
    })
    this.nativeUpdater.on("update-downloaded", () => {
      this.squirrelDownloadedUpdate = true
    })
  }

  protected async doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    let files = downloadUpdateOptions.updateInfoAndProvider.provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info)

    // Detect if we are running inside Rosetta emulation
    const sysctlRosettaInfoKey = "sysctl.proc_translated"
    let isRosetta: boolean
    try {
      const result = execFileSync("sysctl", [sysctlRosettaInfoKey], { encoding: "utf8" })
      isRosetta = result.includes(`${sysctlRosettaInfoKey}: 1`)
    } catch (e) {
      this._logger.info(`sysctl shell command to check for macOS Rosetta environment failed: ${e}`)
    }

    // Allow arm64 macs to install universal or rosetta2(x64) - https://github.com/electron-userland/electron-builder/pull/5524
    const isArm64 = (file: ResolvedUpdateFileInfo) => file.url.pathname.includes("arm64")
    if (files.some(isArm64)) {
      files = files.filter(file => (process.arch === "arm64" || isRosetta) === isArm64(file))
    }

    const zipFileInfo = findFile(files, "zip", ["pkg", "dmg"])
    if (zipFileInfo == null) {
      throw newError(`ZIP file not provided: ${safeStringifyJson(files)}`, "ERR_UPDATER_ZIP_FILE_NOT_FOUND")
    }

    const server = createServer()
    server.on("close", () => {
      this._logger.info(`Proxy server for native Squirrel.Mac is closed (was started to download ${zipFileInfo.url.href})`)
    })

    function getServerUrl(): string {
      const address = server.address() as AddressInfo
      return `http://127.0.0.1:${address.port}`
    }

    return this.executeDownload({
      fileExtension: "zip",
      fileInfo: zipFileInfo,
      downloadUpdateOptions,
      task: (destinationFile, downloadOptions) => {
        return this.httpExecutor.download(zipFileInfo.url, destinationFile, downloadOptions)
      },
      done: async event => {
        const downloadedFile = event.downloadedFile
        let updateFileSize = zipFileInfo.info.size
        if (updateFileSize == null) {
          updateFileSize = (await stat(downloadedFile)).size
        }

        return await new Promise<Array<string>>((resolve, reject) => {
          // insecure random is ok
          const fileUrl = `/${Date.now()}-${Math.floor(Math.random() * 9999)}.zip`
          server.on("request", (request: IncomingMessage, response: ServerResponse) => {
            const requestUrl = request.url!
            this._logger.info(`${requestUrl} requested`)
            if (requestUrl === "/") {
              const data = Buffer.from(`{ "url": "${getServerUrl()}${fileUrl}" }`)
              response.writeHead(200, { "Content-Type": "application/json", "Content-Length": data.length })
              response.end(data)
              return
            }

            if (!requestUrl.startsWith(fileUrl)) {
              this._logger.warn(`${requestUrl} requested, but not supported`)
              response.writeHead(404)
              response.end()
              return
            }

            this._logger.info(`${fileUrl} requested by Squirrel.Mac, pipe ${downloadedFile}`)

            let errorOccurred = false
            response.on("finish", () => {
              try {
                setImmediate(() => server.close())
              } finally {
                if (!errorOccurred) {
                  this.nativeUpdater.removeListener("error", reject)
                  resolve([])
                }
              }
            })

            const readStream = createReadStream(downloadedFile)
            readStream.on("error", error => {
              try {
                response.end()
              } catch (e) {
                this._logger.warn(`cannot end response: ${e}`)
              }
              errorOccurred = true
              this.nativeUpdater.removeListener("error", reject)
              reject(new Error(`Cannot pipe "${downloadedFile}": ${error}`))
            })

            response.writeHead(200, {
              "Content-Type": "application/zip",
              "Content-Length": updateFileSize,
            })
            readStream.pipe(response)
          })
          server.listen(0, "127.0.0.1", () => {
            this.nativeUpdater.setFeedURL({
              url: getServerUrl(),
              headers: { "Cache-Control": "no-cache" },
            })

            // The update has been downloaded and is ready to be served to Squirrel
            this.dispatchUpdateDownloaded(event)

            if (this.autoInstallOnAppQuit) {
              this.nativeUpdater.once("error", reject)
              // This will trigger fetching and installing the file on Squirrel side
              this.nativeUpdater.checkForUpdates()
            } else {
              resolve([])
            }
          })
        })
      },
    })
  }

  quitAndInstall(): void {
    if (this.squirrelDownloadedUpdate) {
      // Update already fetched by Squirrel, it's ready to install
      this.nativeUpdater.quitAndInstall()
    } else {
      // Quit and install as soon as Squirrel get the update
      this.nativeUpdater.on("update-downloaded", () => {
        this.nativeUpdater.quitAndInstall()
      })
    }
  }
}
