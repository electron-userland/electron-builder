import { UpdateInfo } from "builder-util-runtime"
import isEqual from "lodash.isequal"
import { ResolvedUpdateFileInfo } from "./main"
import { existsSync } from "fs-extra-p"
import * as path from "path"

/** @private **/
export class DownloadedUpdateHelper {
  private setupFolderPath: string | null
  private _packagePath: string | null

  private versionInfo: UpdateInfo | null
  private fileInfo: ResolvedUpdateFileInfo | null

  get file() {
    if (this.setupFolderPath != null && this.versionInfo != null) {
      return path.join(this.setupFolderPath, this.versionInfo.path)
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
    if (versionInfo.path != null && existsSync(path.join(this.setupFolderPath, versionInfo.path))) {
      // An installer has already been downloaded from this running instance.
      if (this.versionInfo != null) {
        return isEqual(this.versionInfo, versionInfo) && isEqual(this.fileInfo, fileInfo) ? path.join(this.setupFolderPath, versionInfo.path) : null
      } else {
        return this.setupFolderPath
      }
    }

    // The installer might have been downloaded by another running instance.
    // For example, it might have been downloaded yesterday and then the user shut down the pc or did not gracefully shutdown the application.
    // The application developer might have defined a certain path to look for it, to avoid downloading the same file multiple times.
    // In case an installer has been modified without updating the delivered name, the new installer won't be downloaded again.
    // The application developer that used the setDownloadFolder should take care of finding the downloaded installer.
    return null
  }

  setDownloadedFile(folderPath: string, packagePath: string | null, versionInfo: UpdateInfo, fileInfo: ResolvedUpdateFileInfo) {
    this.setupFolderPath = folderPath
    this._packagePath = packagePath

    this.versionInfo = versionInfo
    this.fileInfo = fileInfo
  }

  setDownloadFolder(downloadFolder: string) {
    if (downloadFolder.length > 0) {
      this.setupFolderPath = downloadFolder
    }
  }

  clear() {
    this.setupFolderPath = null
    this._packagePath = null

    this.versionInfo = null
    this.fileInfo = null
  }
}