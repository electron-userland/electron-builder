const debug = require("debug")("electron-download")
const envPaths = require("env-paths")
import { download } from "builder-util/out/binDownload"
import { ensureDir, pathExists, rename, unlink } from "fs-extra-p"
import * as os from "os"
import * as path from "path"

const ChecksumValidator = require("sumchecker").ChecksumValidator

let tmpFileCounter = 0

export type ElectronPlatformName = "darwin" | "linux" | "win32" | "mas"

export interface ElectronDownloadOptions {
  // https://github.com/electron-userland/electron-builder/issues/3077
  // must be optional
  version?: string

  /**
   * The [cache location](https://github.com/electron-userland/electron-download#cache-location).
   */
  cache?: string | null

  /**
   * The mirror.
   */
  mirror?: string | null

  /** @private */
  customDir?: string | null
  /** @private */
  customFilename?: string | null

  quiet?: boolean

  strictSSL?: boolean
  isVerifyChecksum?: boolean

  /** @private */
  force?: boolean

  platform?: ElectronPlatformName
  arch?: string
}

// noinspection SpellCheckingInspection
const checksumFilename =  "SHASUMS256.txt"

class ElectronDownloader {
  private readonly options: ElectronDownloadOptions
  private cacheDir: string

  constructor(options: ElectronDownloadOptions) {
    if (!options.version) {
      throw new Error("version not specified")
    }

    // use passed argument or XDG environment variable fallback to OS default
    this.options = {
      platform: os.platform() as ElectronPlatformName,
      arch: os.arch(),
      ...options,
    }

    this.options.isVerifyChecksum = this.options.isVerifyChecksum !== false
    this.cacheDir = this.options.cache || process.env.ELECTRON_CACHE || envPaths("electron", {suffix: ""}).cache
  }

  get baseUrl() {
    return process.env.NPM_CONFIG_ELECTRON_MIRROR ||
      process.env.npm_config_electron_mirror ||
      process.env.ELECTRON_MIRROR ||
      this.options.mirror ||
      "https://github.com/electron/electron/releases/download/v"
  }

  get middleUrl() {
    return process.env.ELECTRON_CUSTOM_DIR || this.options.customDir || this.options.version
  }

  get urlSuffix() {
    return process.env.ELECTRON_CUSTOM_FILENAME || this.options.customFilename || this.filename
  }

  private get cachedChecksum() {
    return path.join(this.cacheDir, `${checksumFilename}-${this.options.version}`)
  }

  get checksumUrl() {
    return `${this.baseUrl}${this.middleUrl}/${checksumFilename}`
  }

  private get filename() {
    const type = `${this.options.platform}-${this.options.arch}`
    const suffix = `v${this.options.version}-${type}`
    return `electron-${suffix}.zip`
  }

  private async verifyFile(cachedFile: string, removeIfInvalid: boolean): Promise<boolean> {
    if (!this.options.isVerifyChecksum) {
      return true
    }

    debug("Verifying file with checksum")
    if (!await pathExists(this.cachedChecksum)) {
      await this.downloadFile(this.checksumUrl, this.cachedChecksum)
    }

    const checker = new ChecksumValidator("sha256", this.cachedChecksum)
    try {
      await checker.validate(path.dirname(cachedFile), path.basename(cachedFile))
    }
    catch (e) {
      if (!removeIfInvalid) {
        throw e
      }

      try {
        await unlink(cachedFile)
      }
      catch (ignore) {
        // ignore
      }
      return false
    }
    return true
  }

  private async downloadFile(url: string, destination: string) {
    const tempFileName = `tmp-${process.pid}-${(tmpFileCounter++).toString(16)}-${path.basename(destination)}`
    const cacheDir = this.cacheDir
    debug("downloading", url, "to", cacheDir)
    const tempFile = path.join(cacheDir, tempFileName)
    await download(url, tempFile)

    debug("moving", tempFile, "from", cacheDir, "to", destination)
    try {
      await rename(tempFile, destination)
    }
    catch (e) {
      try {
        await unlink(tempFile)
      }
      catch (cleanupError) {
        try {
          console.error(`Error deleting cache file: ${cleanupError.message}`)
        }
        catch (ignore) {
          // ignore
        }
        throw e
      }
    }
  }

  private get cachedZip() {
    return path.join(this.cacheDir, this.options.customFilename || this.filename)
  }

  async downloadIfNotCached(): Promise<string> {
    const url = `${this.baseUrl}${this.middleUrl}/${this.urlSuffix}`
    let cachedFile = this.cachedZip
    debug("info", {cachedFile, url})
    const exists = await pathExists(cachedFile)
    if (exists) {
      debug("file exists", cachedFile)
      if (await this.verifyFile(cachedFile, true)) {
        return cachedFile
      }
    }

    debug("creating cache dir")
    try {
      await ensureDir(this.cacheDir)
    }
    catch (e) {
      if (e.code !== "EACCES") {
        throw e
      }

      // try local folder if homedir is off limits (e.g. some linuxes return '/' as homedir)
      const localCache = path.resolve("./.electron")
      await ensureDir(localCache)
      this.cacheDir = localCache
      cachedFile = this.cachedZip
    }

    await this.downloadFile(url, cachedFile)
    await this.verifyFile(cachedFile, false)
    return cachedFile
  }
}

export function downloadElectron(options: ElectronDownloadOptions): Promise<string> {
  return new ElectronDownloader(options).downloadIfNotCached()
}
