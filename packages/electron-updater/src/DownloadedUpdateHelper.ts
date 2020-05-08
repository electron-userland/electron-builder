import { UpdateInfo } from "builder-util-runtime"
import { createHash } from "crypto"
import { createReadStream } from "fs"
import isEqual from "lodash.isequal"
import { Logger, ResolvedUpdateFileInfo } from "./main"
import { pathExists, readJson, emptyDir, outputJson, unlink, pathExistsSync } from "fs-extra"
import * as path from "path"

/** @private **/
export class DownloadedUpdateHelper {
  private _file: string | null = null
  private _packageFile: string | null = null

  private versionInfo: UpdateInfo | null = null
  private fileInfo: ResolvedUpdateFileInfo | null = null

  constructor(readonly cacheDir: string) {
  }

  private _downloadedFileInfo: CachedUpdateInfo | null = null
  get downloadedFileInfo(): CachedUpdateInfo | null {
    return this._downloadedFileInfo
  }

  get file(): string | null {
    return this._file
  }

  get packageFile(): string | null {
    return this._packageFile
  }

  get cacheDirForPendingUpdate(): string {
    return path.join(this.cacheDir, "pending")
  }

  async validateDownloadedPath(updateFile: string, updateInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo, logger: Logger): Promise<string | null> {
    if (this.versionInfo != null && this.file === updateFile && this.fileInfo != null) {
      // update has already been downloaded from this running instance
      // check here only existence, not checksum
      if (isEqual(this.versionInfo, updateInfo) && isEqual(this.fileInfo.info, fileInfo.info) && (await pathExists(updateFile))) {
        return updateFile
      }
      else {
        return null
      }
    }

    // update has already been downloaded from some previous app launch
    const cachedUpdateFile = await this.getValidCachedUpdateFile(fileInfo, logger)
    if (cachedUpdateFile === null) {
      return null
    }
    logger.info(`Update has already been downloaded to ${updateFile}).`)
    this._file = cachedUpdateFile
    return cachedUpdateFile
  }

  async setDownloadedFile(downloadedFile: string, packageFile: string | null, versionInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo, updateFileName: string, isSaveCache: boolean): Promise<void> {
    this._file = downloadedFile
    this._packageFile = packageFile
    this.versionInfo = versionInfo
    this.fileInfo = fileInfo
    this._downloadedFileInfo = {
      fileName: updateFileName,
      sha512: fileInfo.info.sha512,
      isAdminRightsRequired: fileInfo.info.isAdminRightsRequired === true,
    }

    if (isSaveCache) {
      await outputJson(this.getUpdateInfoFile(), this._downloadedFileInfo)
    }
  }

  async clear(): Promise<void> {
    this._file = null
    this._packageFile = null
    this.versionInfo = null
    this.fileInfo = null
    await this.cleanCacheDirForPendingUpdate()
  }

  private async cleanCacheDirForPendingUpdate(): Promise<void> {
    try {
      // remove stale data
      await emptyDir(this.cacheDirForPendingUpdate)
    }
    catch (ignore) {
      // ignore
    }
  }

  /**
   * Returns "update-info.json" which is created in the update cache directory's "pending" subfolder after the first update is downloaded.  If the update file does not exist then the cache is cleared and recreated.  If the update file exists then its properties are validated.
   * @param fileInfo
   * @param logger
   */
  private async getValidCachedUpdateFile(fileInfo: ResolvedUpdateFileInfo, logger: Logger): Promise<string | null> {
    const updateInfoFilePath: string = this.getUpdateInfoFile()

    const doesUpdateInfoFileExist = await pathExistsSync(updateInfoFilePath);
    if(!doesUpdateInfoFileExist) {
      return null;
    }


    let cachedInfo: CachedUpdateInfo
    try {
      cachedInfo = await readJson(updateInfoFilePath)
    }
    catch (error) {
      let message = `No cached update info available`
      if (error.code !== "ENOENT") {
        await this.cleanCacheDirForPendingUpdate()
        message += ` (error on read: ${error.message})`
      }
      logger.info(message)
      return null
    }

    const isCachedInfoFileNameValid = cachedInfo?.fileName !== null ?? false
    if (!isCachedInfoFileNameValid) {
      logger.warn(`Cached update info is corrupted: no fileName, directory for cached update will be cleaned`)
      await this.cleanCacheDirForPendingUpdate()
      return null
    }

    if (fileInfo.info.sha512 !== cachedInfo.sha512) {
      logger.info(`Cached update sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${cachedInfo.sha512}, expected: ${fileInfo.info.sha512}. Directory for cached update will be cleaned`)
      await this.cleanCacheDirForPendingUpdate()
      return null
    }

    const updateFile = path.join(this.cacheDirForPendingUpdate, cachedInfo.fileName)
    if (!(await pathExists(updateFile))) {
      logger.info("Cached update file doesn't exist, directory for cached update will be cleaned")
      await this.cleanCacheDirForPendingUpdate()
      return null
    }

    const sha512 = await hashFile(updateFile)
    if (fileInfo.info.sha512 !== sha512) {
      logger.warn(`Sha512 checksum doesn't match the latest available update. New update must be downloaded. Cached: ${sha512}, expected: ${fileInfo.info.sha512}`)
      await this.cleanCacheDirForPendingUpdate()
      return null
    }
    this._downloadedFileInfo = cachedInfo
    return updateFile
  }

  private getUpdateInfoFile(): string {
    return path.join(this.cacheDirForPendingUpdate, "update-info.json")
  }
}

interface CachedUpdateInfo {
  fileName: string
  sha512: string
  readonly isAdminRightsRequired: boolean
}

function hashFile(file: string, algorithm = "sha512", encoding: "base64" | "hex" = "base64", options?: any): Promise<string> {
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

export async function createTempUpdateFile(name: string, cacheDir: string, log: Logger): Promise<string> {
  // https://github.com/electron-userland/electron-builder/pull/2474#issuecomment-366481912
  let nameCounter = 0
  let result = path.join(cacheDir, name)
  for (let i = 0; i < 3; i++) {
    try {
      await unlink(result)
      return result
    }
    catch (e) {
      if (e.code === "ENOENT") {
        return result
      }

      log.warn(`Error on remove temp update file: ${e}`)
      result = path.join(cacheDir, `${nameCounter++}-${name}`)
    }
  }
  return result
}
