import BluebirdPromise from "bluebird-lst"
import { Arch, subTask } from "builder-util"
import { PackageFileInfo } from "electron-builder-http/out/updateInfo"
import { unlink } from "fs-extra-p"
import { getTemplatePath } from "../../util/pathManager"
import { NsisTarget } from "./nsis"

export const nsisTemplatesDir = getTemplatePath("nsis")

export class AppPackageHelper {
  private readonly archToFileInfo = new Map<Arch, Promise<PackageFileInfo>>()
  private readonly infoToIsDelete = new Map<PackageFileInfo, boolean>()

  /** @private */
  refCount = 0

  async packArch(arch: Arch, target: NsisTarget): Promise<PackageFileInfo> {
    let infoPromise = this.archToFileInfo.get(arch)
    if (infoPromise == null) {
      infoPromise = subTask(`Packaging NSIS installer for arch ${Arch[arch]}`, target.buildAppPackage(target.archs.get(arch)!, arch))
      this.archToFileInfo.set(arch, infoPromise)
    }

    const info = await infoPromise
    if (target.isWebInstaller) {
      this.infoToIsDelete.set(info, false)
    }
    else if (!this.infoToIsDelete.has(info)) {
      this.infoToIsDelete.set(info, true)
    }
    return info
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