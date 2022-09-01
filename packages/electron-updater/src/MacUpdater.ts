import { AllPublishOptions, newError, safeStringifyJson } from "builder-util-runtime"
import { stat } from "fs-extra"
import { createReadStream } from "fs"
import { createServer, IncomingMessage, Server, ServerResponse } from "http"
import { AddressInfo } from "net"
import { AppAdapter } from "./AppAdapter"
import { AppUpdater, DownloadUpdateOptions } from "./AppUpdater"
import { ResolvedUpdateFileInfo, UpdateDownloadedEvent } from "./main"
import { findFile } from "./providers/Provider"
import AutoUpdater = Electron.AutoUpdater
import { execFileSync } from "child_process"

/** 安装包发送给 squirrel 的安全操作时间间隔 */
const SEND_TO_SQUIRREL_SAFE_TIME = 6000

export class MacUpdater extends AppUpdater {
  private readonly nativeUpdater: AutoUpdater = require("electron").autoUpdater

  private squirrelDownloadedUpdate = false

  /** 是否正在退出。退出时不会判断是否需需要 abort squirrel */
  private isQuitting = false

  /** 最近一次下载好的文件信息 */
  private lastDownloadZipFileInfo: ResolvedUpdateFileInfo | null = null
  /** 最近一次下载好的事件 */
  private lastDownloadEvent: UpdateDownloadedEvent | null = null

  /** squirrel 使用的本地 server 实例 */
  private server: Server | null = null

  /** 上次尝试调用发送到 squirrel 的时间 */
  private sendToSquirrelTime = 0
  /** 已发送给 squirrel 的 server 引用 */
  private sendToSquirrelServer: Server | null = null
  /** 发送给 squirrel 的定时任务 id */
  private squirrelServerScheduleId: NodeJS.Timeout | null = null

  public get autoInstallOnAppQuit() {
    return this._autoInstallOnAppQuit
  }

  public set autoInstallOnAppQuit(value: boolean) {
    if (this._autoInstallOnAppQuit === value) {
      // 去重
      return
    }
    this._autoInstallOnAppQuit = value
    if (value) {
      this.debug("turn on auto install")
      // 打开自动升级
      if (this.squirrelDownloadedUpdate) {
        // squirrel 已准备好，无需操作
        this.debug("squirrel update is ready, do nothing")
      } else {
        // squirrel 未准备好，尝试开启
        // 反复调用时，可能存在重复 server
        this.debug("squirrel is not ready, try start it")
        this.scheduleSquirrelServerSafely()
      }
    } else {
      this.debug("turn off auto install")
      // 关掉自动升级
      this.abortSquirrelMacAutoUpdate()
    }
  }

  constructor(options?: AllPublishOptions, app?: AppAdapter) {
    super(options, app)

    this.nativeUpdater.on("error", it => {
      this._logger.warn(it)
      this.emit("error", it)
    })
    this.nativeUpdater.on("update-downloaded", () => {
      this.squirrelDownloadedUpdate = true
      this.debug("receive squirrel update ready")
      // 非退出的情况下，当 update 准备好时，如果没有开启自动升级，则 abort squirrel
      if (!this.isQuitting && !this._autoInstallOnAppQuit) {
        this.debug("now its not quitting and not auto update, try abort squirrel")
        this.abortSquirrelMacAutoUpdate()
        return
      }
    })
  }

  private debug(message: string): void {
    if (this._logger.debug != null) {
      this._logger.debug(message)
    }
  }

  /**
   * 放弃 squirrel mac 已注册的服务
   *  ~/Library/Caches/<bundleId>.ShipIt/
   */
  private abortSquirrelMacAutoUpdate() {
    if (!this._bundleId) {
      this.debug("bundle id need to be set before prevent squirrel mac auto update")
      return
    }
    try {
      const result = execFileSync("launchctl", ["remove", `${this._bundleId}.ShipIt`], { encoding: "utf8" })
      this.debug(`remove squirrel service if possible: ${result}`)
    } catch (err) {
      this.debug(`remove squirrel service error: ${err instanceof Error ? err.message : String(err)}`)
    }
    this.squirrelDownloadedUpdate = false
    this.cancelScheduledSquirrelServer()
    this.debug("squirrel update aborted")
  }

  /** 发送安装包到 squirrel */
  private sendUpdateToSquirrel() {
    this.nativeUpdater.checkForUpdates()
    this.sendToSquirrelTime = Date.now()
  }

  /** 开启尽量安全创建 squirrel server 的定时任务 */
  private scheduleSquirrelServerSafely() {
    this.cancelScheduledSquirrelServer()
    const remainTime = SEND_TO_SQUIRREL_SAFE_TIME - (Date.now() - this.sendToSquirrelTime)
    // 等待时间由距离上次尝试的时间决定
    const timeout = remainTime < 0 ? 0 : remainTime

    this.debug(`schedule server in ${timeout}ms`)
    this.squirrelServerScheduleId = setTimeout(() => {
      this.startSquirrelServer().catch(err => {
        this.debug(`start squirrel server error: ${err.message}`)
      })
    }, timeout)
  }

  /** 取消已创建的 squirrel server 定时任务 */
  private cancelScheduledSquirrelServer() {
    if (this.squirrelServerScheduleId) {
      this.debug(`find scheduled server ${this.squirrelServerScheduleId}, cancel it`)
      clearTimeout(this.squirrelServerScheduleId)
      this.squirrelServerScheduleId = null
    }
  }

  /** 清除 server. 手动 quitAndInstall 时可能需要维持 server 实例 */
  private clearServer() {
    if (!this.server) {
      return
    }
    this.server.close()
    this.server = null
  }

  /** 创建 server */
  private getServer() {
    this.clearServer()
    this.server = createServer()
    return this.server
  }

  protected async doDownloadUpdate(downloadUpdateOptions: DownloadUpdateOptions): Promise<Array<string>> {
    let files = downloadUpdateOptions.updateInfoAndProvider.provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info)

    const log = this._logger

    // detect if we are running inside Rosetta emulation
    const sysctlRosettaInfoKey = "sysctl.proc_translated"
    let isRosetta = false
    try {
      this.debug("Checking for macOS Rosetta environment")
      const result = execFileSync("sysctl", [sysctlRosettaInfoKey], { encoding: "utf8" })
      isRosetta = result.includes(`${sysctlRosettaInfoKey}: 1`)
      log.info(`Checked for macOS Rosetta environment (isRosetta=${isRosetta})`)
    } catch (e) {
      log.warn(`sysctl shell command to check for macOS Rosetta environment failed: ${e}`)
    }

    let isArm64Mac = false
    try {
      this.debug("Checking for arm64 in uname")
      const result = execFileSync("uname", ["-a"], { encoding: "utf8" })
      const isArm = result.includes("ARM")
      log.info(`Checked 'uname -a': arm64=${isArm}`)
      isArm64Mac = isArm64Mac || isArm
    } catch (e) {
      log.warn(`uname shell command to check for arm64 failed: ${e}`)
    }

    isArm64Mac = isArm64Mac || process.arch === "arm64" || isRosetta

    // allow arm64 macs to install universal or rosetta2(x64) - https://github.com/electron-userland/electron-builder/pull/5524
    const isArm64 = (file: ResolvedUpdateFileInfo) => file.url.pathname.includes("arm64") || file.info.url?.includes("arm64")
    if (isArm64Mac && files.some(isArm64)) {
      files = files.filter(file => isArm64Mac === isArm64(file))
    } else {
      files = files.filter(file => !isArm64(file))
    }

    const zipFileInfo = findFile(files, "zip", ["pkg", "dmg"])

    if (zipFileInfo == null) {
      throw newError(`ZIP file not provided: ${safeStringifyJson(files)}`, "ERR_UPDATER_ZIP_FILE_NOT_FOUND")
    }

    return this.executeDownload({
      fileExtension: "zip",
      fileInfo: zipFileInfo,
      downloadUpdateOptions,
      task: (destinationFile, downloadOptions) => {
        return this.httpExecutor.download(zipFileInfo.url, destinationFile, downloadOptions)
      },
      done: event => this.afterUpdateDownloaded(zipFileInfo, event),
    })
  }

  private async afterUpdateDownloaded(zipFileInfo: ResolvedUpdateFileInfo, event: UpdateDownloadedEvent): Promise<Array<string>> {
    this.lastDownloadZipFileInfo = zipFileInfo
    this.lastDownloadEvent = event
    return this.startSquirrelServer(true)
  }

  private async startSquirrelServer(dispatchEvent = true): Promise<Array<string>> {
    if (!this.lastDownloadZipFileInfo || !this.lastDownloadEvent) {
      this.debug("cannot find last downloaded update files, give up squirrel setup")
      return []
    }

    const zipFileInfo = this.lastDownloadZipFileInfo
    const event = this.lastDownloadEvent

    const downloadedFile = event.downloadedFile
    const updateFileSize = zipFileInfo.info.size ?? (await stat(downloadedFile)).size

    const log = this._logger
    const logContext = `fileToProxy=${zipFileInfo.url.href}`
    this.debug(`Creating proxy server for native Squirrel.Mac (${logContext})`)
    const server = this.getServer()
    this.debug(`Proxy server for native Squirrel.Mac is created (${logContext})`)
    server.on("close", () => {
      log.info(`Proxy server for native Squirrel.Mac is closed (${logContext})`)
    })

    // must be called after server is listening, otherwise address is null
    function getServerUrl(): string {
      const address = server.address() as AddressInfo
      return `http://127.0.0.1:${address.port}`
    }

    return await new Promise<Array<string>>((resolve, reject) => {
      // insecure random is ok
      const fileUrl = `/${Date.now().toString(16)}-${Math.floor(Math.random() * 9999).toString(16)}.zip`
      server.on("request", (request: IncomingMessage, response: ServerResponse) => {
        const requestUrl = request.url!
        log.info(`${requestUrl} requested`)
        if (requestUrl === "/") {
          const data = Buffer.from(`{ "url": "${getServerUrl()}${fileUrl}" }`)
          response.writeHead(200, { "Content-Type": "application/json", "Content-Length": data.length })
          response.end(data)
          return
        }

        if (!requestUrl.startsWith(fileUrl)) {
          log.warn(`${requestUrl} requested, but not supported`)
          response.writeHead(404)
          response.end()
          return
        }

        log.info(`${fileUrl} requested by Squirrel.Mac, pipe ${downloadedFile}`)

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
            log.warn(`cannot end response: ${e}`)
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

      this.debug(`Proxy server for native Squirrel.Mac is starting to listen (${logContext})`)
      server.listen(0, "127.0.0.1", () => {
        this.debug(`Proxy server for native Squirrel.Mac is listening (address=${getServerUrl()}, ${logContext})`)
        this.nativeUpdater.setFeedURL({
          url: getServerUrl(),
          headers: { "Cache-Control": "no-cache" },
        })

        // The update has been downloaded and is ready to be served to Squirrel
        if (dispatchEvent) {
          this.dispatchUpdateDownloaded(event)
        }

        if (this._autoInstallOnAppQuit) {
          this.nativeUpdater.once("error", reject)
          // This will trigger fetching and installing the file on Squirrel side
          this.sendToSquirrelServer = server
          this.sendUpdateToSquirrel()
        } else {
          resolve([])
        }
      })
    })
  }

  quitAndInstall(): void {
    this.isQuitting = true
    if (this.squirrelDownloadedUpdate) {
      // update already fetched by Squirrel, it's ready to install
      this.nativeUpdater.quitAndInstall()
    } else {
      // Quit and install as soon as Squirrel get the update
      this.nativeUpdater.on("update-downloaded", () => {
        this.debug("quit and install receive update downloaded")
        this.nativeUpdater.quitAndInstall()
      })
      this._autoInstallOnAppQuit = true
      // 服务在监听状态，且未发送到 squirrel, 则发送给 squirrel
      // 应对未选择自动更新，但又手动调用了该方法的情况
      // 防止重复触发 checkForUpdate 导致的报错 The command is disabled and cannot be executed
      if (this.server?.listening && this.sendToSquirrelServer !== this.server) {
        this.debug("server is listening and not used yet, send update to squirrel")
        this.sendUpdateToSquirrel()
      } else {
        // 其他情况存在 squirrel 真实状态的不确定性，等待几秒降低不确定性
        this.debug("server is not listening, schedule server")
        this.scheduleSquirrelServerSafely()
      }
    }
  }
}
