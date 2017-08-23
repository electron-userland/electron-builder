import BluebirdPromise from "bluebird-lst"
import { Arch, subTask } from "electron-builder-util"
import { unlink } from "fs-extra-p"
import { NsisTarget } from "./nsis"
import { getTemplatePath } from "../../util/pathManager"

export const nsisTemplatesDir = getTemplatePath("nsis")

interface PackageFileInfo {
  file: string
}

export class AppPackageHelper {
  private readonly archToFileInfo = new Map<Arch, Promise<PackageFileInfo>>()
  private readonly infoToIsDelete = new Map<PackageFileInfo, boolean>()

  /** @private */
  refCount = 0

  async packArch(arch: Arch, target: NsisTarget) {
    let infoPromise = this.archToFileInfo.get(arch)
    if (infoPromise == null) {
      infoPromise = subTask(`Packaging NSIS installer for arch ${Arch[arch]}`, target.buildAppPackage(target.archs.get(arch)!, arch))
        .then(it => ({file: it}))
      this.archToFileInfo.set(arch, infoPromise)
    }

    const info = await infoPromise
    if (target.isWebInstaller) {
      this.infoToIsDelete.set(info, false)
    }
    else if (!this.infoToIsDelete.has(info)) {
      this.infoToIsDelete.set(info, true)
    }
    return info.file
  }

  async finishBuild(): Promise<any> {
    if (--this.refCount > 0) {
      return
    }

    const filesToDelete: Array<string> = []
    for (const [info, isDelete]  of this.infoToIsDelete.entries()) {
      if (isDelete) {
        filesToDelete.push(info.file)
      }
    }

    await BluebirdPromise.map(filesToDelete, it => unlink(it))
  }
}