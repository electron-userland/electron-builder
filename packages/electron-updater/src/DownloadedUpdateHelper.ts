import { UpdateInfo } from "builder-util-runtime"
import isEqual from "lodash.isequal"
import { ResolvedUpdateFileInfo } from "./main"

/** @private **/
export class DownloadedUpdateHelper {
  private setupPath: string | null
  private _packagePath: string | null

  private versionInfo: UpdateInfo | null
  private fileInfo: ResolvedUpdateFileInfo | null

  get file() {
    return this.setupPath
  }

  get packagePath() {
    return this._packagePath
  }

  getDownloadedFile(versionInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo): string | null {
    if (this.setupPath == null) {
      return null
    }

    return isEqual(this.versionInfo, versionInfo) && isEqual(this.fileInfo, fileInfo) ? this.setupPath : null
  }

  setDownloadedFile(file: string, packagePath: string | null, versionInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo) {
    this.setupPath = file
    this._packagePath = packagePath

    this.versionInfo = versionInfo
    this.fileInfo = fileInfo
  }

  clear() {
    this.setupPath = null
    this._packagePath = null

    this.versionInfo = null
    this.fileInfo = null
  }
}