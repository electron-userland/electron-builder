import { VersionInfo } from "electron-builder-http/out/updateInfo"
import { FileInfo } from "./main"

let isEqual: any

export class DownloadedUpdateHelper {
  private setupPath: string | null
  private versionInfo: VersionInfo | null
  private fileInfo: FileInfo | null

  get file() {
    return this.setupPath
  }

  getDownloadedFile(versionInfo: VersionInfo, fileInfo: FileInfo): string | null {
    if (this.setupPath == null) {
      return null
    }

    if (isEqual == null) {
      isEqual = require("lodash.isequal")
    }

    if (isEqual(this.versionInfo, versionInfo) && isEqual(this.fileInfo, fileInfo)) {
      return this.setupPath
    }
    return null
  }

  setDownloadedFile(file: string, versionInfo: VersionInfo, fileInfo: FileInfo) {
    this.setupPath = file
    this.versionInfo = versionInfo
    this.fileInfo = fileInfo
  }

  clear() {
    this.setupPath = null
    this.versionInfo = null
    this.fileInfo = null
  }
}