import { UpdateInfo } from "builder-util-runtime"
import isEqual from "lodash.isequal"
import { ResolvedUpdateFileInfo } from "./main"
import { existsSync, mkdirsSync } from "fs-extra-p"
import * as path from "path"

/** @private **/
export class DownloadedUpdateHelper {
  private setupFolderPath: string | null = null
  private setupInstallerName: string = "new-installer.exe"
  private _packagePath: string | null = null

  private versionInfo: UpdateInfo | null = null
  private fileInfo: ResolvedUpdateFileInfo | null = null

  get file() {
    if (this.setupFolderPath != null) {
      return path.join(this.setupFolderPath, this.setupInstallerName)
    }

    return null
  }

  get folder() {
    return this.setupFolderPath
  }

  get packagePath() {
    return this._packagePath
  }

  getDownloadedPath(versionInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo): string | null {
    if (this.setupFolderPath == null) {
      return null
    }

    // Check installer existence.
    // An installer has already been downloaded from this running instance.
    if (this.versionInfo != null) {
      return isEqual(this.versionInfo, versionInfo) && isEqual(this.fileInfo, fileInfo) && this.file != null && existsSync(this.file) ? this.file : null
    }

    return null
  }

  setDownloadedFile(folderPath: string, packagePath: string | null, versionInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo) {
    this.setupFolderPath = folderPath
    this._packagePath = packagePath

    this.versionInfo = versionInfo
    this.fileInfo = fileInfo
  }

  setDownloadData(downloadFolder: string, installerName?: string) {
    if (downloadFolder.length > 0) {
      if (!existsSync(downloadFolder)) {
        // TODO: Handle error
        mkdirsSync(downloadFolder)
      }

      this.setupFolderPath = downloadFolder
      if (installerName !== undefined) {
        this.setupInstallerName = installerName
      }
    }
  }

  clear() {
    this.setupFolderPath = null
    this._packagePath = null

    this.versionInfo = null
    this.fileInfo = null
  }
}