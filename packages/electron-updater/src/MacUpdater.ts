import { AllPublishOptions, newError, safeStringifyJson } from "builder-util-runtime"
import { pathExistsSync, copyFile } from "fs-extra"
import { chmod, writeFile } from "fs/promises"
import * as path from "path"
import { pathToFileURL } from "url"
import { AppAdapter } from "./AppAdapter"
import { AppUpdater, DownloadUpdateOptions } from "./AppUpdater"
import { ResolvedUpdateFileInfo } from "./main"
import { UpdateDownloadedEvent } from "./types"
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
      this.debug("nativeUpdater.update-downloaded")
    })
  }

  /** Filters update files to the appropriate architecture.
   * On arm64 Macs (including Rosetta), arm64 files are preferred when available.
   * On x64 Macs, arm64 files are excluded. */
  protected static filterFilesForArch(files: ResolvedUpdateFileInfo[], isArm64Mac: boolean): ResolvedUpdateFileInfo[] {
    const isArm64File = (file: ResolvedUpdateFileInfo) => file.url.pathname.includes("arm64") || file.info.url?.includes("arm64")
    if (isArm64Mac && files.some(isArm64File)) {
      return files.filter(file => isArm64Mac === isArm64File(file))
    }
    return files.filter(file => !isArm64File(file))
  }

  private debug(message: string): void {
    if (this._logger.debug != null) {
      this._logger.debug(message)
    }
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
    } catch (e: any) {
      log.warn(`sysctl shell command to check for macOS Rosetta environment failed: ${e}`)
    }

    let isArm64Mac = false
    try {
      this.debug("Checking for arm64 in uname")
      const result = execFileSync("uname", ["-a"], { encoding: "utf8" })
      const isArm = result.includes("ARM")
      log.info(`Checked 'uname -a': arm64=${isArm}`)
      isArm64Mac = isArm64Mac || isArm
    } catch (e: any) {
      log.warn(`uname shell command to check for arm64 failed: ${e}`)
    }

    isArm64Mac = isArm64Mac || process.arch === "arm64" || isRosetta

    // allow arm64 macs to install universal or rosetta2(x64) - https://github.com/electron-userland/electron-builder/pull/5524
    files = MacUpdater.filterFilesForArch(files, isArm64Mac)

    const zipFileInfo = findFile(files, "zip", ["pkg", "dmg"])

    if (zipFileInfo == null) {
      throw newError(`ZIP file not provided: ${safeStringifyJson(files)}`, "ERR_UPDATER_ZIP_FILE_NOT_FOUND")
    }

    const provider = downloadUpdateOptions.updateInfoAndProvider.provider
    const CURRENT_MAC_APP_ZIP_FILE_NAME = "update.zip"

    return this.executeDownload({
      fileExtension: "zip",
      fileInfo: zipFileInfo,
      downloadUpdateOptions,
      task: async (destinationFile, downloadOptions) => {
        const cachedUpdateFilePath = path.join(this.downloadedUpdateHelper!.cacheDir, CURRENT_MAC_APP_ZIP_FILE_NAME)
        const canDifferentialDownload = () => {
          if (!pathExistsSync(cachedUpdateFilePath)) {
            log.info("Unable to locate previous update.zip for differential download (is this first install?), falling back to full download")
            return false
          }
          return !downloadUpdateOptions.disableDifferentialDownload
        }
        let differentialDownloadFailed = true
        if (canDifferentialDownload()) {
          differentialDownloadFailed = await this.differentialDownloadInstaller(zipFileInfo, downloadUpdateOptions, destinationFile, provider, CURRENT_MAC_APP_ZIP_FILE_NAME)
        }

        if (differentialDownloadFailed) {
          await this.httpExecutor.download(zipFileInfo.url, destinationFile, downloadOptions)
        }
      },
      done: async event => {
        if (!downloadUpdateOptions.disableDifferentialDownload) {
          try {
            const cachedUpdateFilePath = path.join(this.downloadedUpdateHelper!.cacheDir, CURRENT_MAC_APP_ZIP_FILE_NAME)
            await copyFile(event.downloadedFile, cachedUpdateFilePath)
            await chmod(cachedUpdateFilePath, 0o600)
          } catch (error: any) {
            this._logger.warn(`Unable to copy file for caching for future differential downloads: ${error.message}`)
          }
        }
        return this.updateDownloaded(event)
      },
    })
  }

  private async updateDownloaded(event: UpdateDownloadedEvent): Promise<Array<string>> {
    const downloadedFile = event.downloadedFile
    await chmod(downloadedFile, 0o600)
    const feedPath = path.join(this.downloadedUpdateHelper!.cacheDir, "update-feed.json")

    await writeFile(feedPath, JSON.stringify({ url: pathToFileURL(downloadedFile).href }), { mode: 0o600 })
    this.debug(`Serving Squirrel.Mac update via file:// (feedPath=${feedPath})`)

    this.nativeUpdater.setFeedURL({ url: pathToFileURL(feedPath).href })
    this.dispatchUpdateDownloaded(event)

    if (!this.autoInstallOnAppQuit) {
      return []
    }

    return new Promise<Array<string>>((resolve, reject) => {
      const onError = (err: Error) => reject(err)
      this.nativeUpdater.once("error", onError)
      this.nativeUpdater.once("update-downloaded", () => {
        this.nativeUpdater.removeListener("error", onError)
        resolve([])
      })
      // This will trigger fetching and installing the file on Squirrel side
      this.nativeUpdater.checkForUpdates()
    })
  }

  private handleUpdateDownloaded() {
    if (this.autoRunAppAfterInstall) {
      this.nativeUpdater.quitAndInstall()
    } else {
      this.app.quit()
    }
  }

  quitAndInstall(): void {
    if (this.squirrelDownloadedUpdate) {
      // update already fetched by Squirrel, it's ready to install
      this.handleUpdateDownloaded()
    } else {
      // Quit and install as soon as Squirrel get the update
      this.nativeUpdater.on("update-downloaded", () => this.handleUpdateDownloaded())

      if (!this.autoInstallOnAppQuit) {
        /**
         * If this was not `true` previously then MacUpdater.doDownloadUpdate()
         * would not actually initiate the downloading by electron's autoUpdater
         */
        this.nativeUpdater.checkForUpdates()
      }
    }
  }
}
