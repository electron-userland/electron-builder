import { UpdateInfo } from "builder-util-runtime"
import { createHash } from "crypto"
import { createReadStream } from "fs"
import isEqual from "lodash.isequal"
import { Logger, ResolvedUpdateFileInfo } from "./main"
import { pathExists } from "fs-extra-p"

/** @private **/
export class DownloadedUpdateHelper {
  private _file: string | null = null
  private _packageFile: string | null = null

  private versionInfo: UpdateInfo | null = null
  private fileInfo: ResolvedUpdateFileInfo | null = null

  constructor(readonly cacheDir: string) {
  }

  get file() {
    return this._file
  }

  get packageFile() {
    return this._packageFile
  }

  async validateDownloadedPath(updateFile: string, versionInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo, logger: Logger): Promise<boolean> {
    if (this.versionInfo != null && this.file === updateFile) {
      // update has already been downloaded from this running instance
      // check here only existence, not checksum
      return isEqual(this.versionInfo, versionInfo) && isEqual(this.fileInfo, fileInfo) && (await pathExists(updateFile))
    }

    // update has already been downloaded from some previous app launch
    if (await DownloadedUpdateHelper.isUpdateValid(updateFile, fileInfo, logger)) {
      logger.info(`Update has already been downloaded ${updateFile}).`)
      return true
    }

    return false
  }

  setDownloadedFile(downloadedFile: string, packageFile: string | null, versionInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo) {
    this._file = downloadedFile
    this._packageFile = packageFile
    this.versionInfo = versionInfo
    this.fileInfo = fileInfo
  }

  clear() {
    this._file = null
    this.versionInfo = null
    this.fileInfo = null
  }

  private static async isUpdateValid(updateFile: string, fileInfo: ResolvedUpdateFileInfo, logger: Logger): Promise<boolean> {
    if (!(await pathExists(updateFile))) {
      logger.info("No cached update available")
      return false
    }

    const sha512 = await hashFile(updateFile)
    if (fileInfo.info.sha512 !== sha512) {
      logger.warn(`Sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${sha512}, expected: ${fileInfo.info.sha512}`)
      return false
    }
    return true
  }
}

function hashFile(file: string, algorithm: string = "sha512", encoding: "base64" | "hex" = "base64", options?: any) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash(algorithm)
    hash
      .on("error", reject)
      .setEncoding(encoding)

    createReadStream(file, {...options, highWaterMark: 1024 * 1024 /* better to use more memory but hash faster */})
      .on("error", reject)
      .on("end", () => {
        hash.end()
        resolve(hash.read() as string)
      })
      .pipe(hash, {end: false})
  })
}