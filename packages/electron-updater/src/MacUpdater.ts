import BluebirdPromise from "bluebird-lst"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { PublishConfiguration, VersionInfo } from "electron-builder-http/out/publishOptions"
import { createServer, IncomingMessage, Server, ServerResponse } from "http"
import { AppUpdater } from "./AppUpdater"
import { FileInfo } from "./main"
import AutoUpdater = Electron.AutoUpdater

export class MacUpdater extends AppUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  private server: Server | null

  constructor(options?: PublishConfiguration) {
    super(options)

    this.nativeUpdater.on("error", it => {
      if (this.logger != null) {
        this.logger.warn(it)
      }
      this.emit("error", it)
    })
    this.nativeUpdater.on("update-downloaded", () => {
      if (this.logger != null) {
        this.logger.info(`New version ${this.versionInfo!.version} has been downloaded`)
      }
      this.emit("update-downloaded", this.versionInfo)
    })
  }

  protected onUpdateAvailable(versionInfo: VersionInfo, fileInfo: FileInfo) {
    super.onUpdateAvailable(versionInfo, fileInfo)

    let server = this.server
    if (server != null) {
      return
    }

    server = createServer()
    this.server = server
    server.on("request", (request: IncomingMessage, response: ServerResponse) => {
      if (request.url!.endsWith("/update.json")) {
        response.writeHead(200, {"Content-Type": "application/json"})
        response.end(`{ "url": "${this.getServerUrl()}/app.zip" }`)
      }
      else {
        response.writeHead(404)
        response.end()

      }
    })
    server.listen(0, "127.0.0.1", 16, () => {
      this.nativeUpdater.setFeedURL(`${this.getServerUrl()}`, Object.assign({"Cache-Control": "no-cache"}, this.computeRequestHeaders(fileInfo)))
    })
  }

  protected doDownloadUpdate(versionInfo: VersionInfo, fileInfo: FileInfo, cancellationToken: CancellationToken) {
    this.nativeUpdater.checkForUpdates()
    return BluebirdPromise.resolve()
  }

  quitAndInstall(): void {
    this.nativeUpdater.quitAndInstall()
  }

  private getServerUrl() {
    const address = this.server!.address()
    return `http://${address.address}:${address.port}`
  }
}