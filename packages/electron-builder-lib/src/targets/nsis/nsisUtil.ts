import BluebirdPromise from "bluebird-lst"
import { Arch, warn } from "builder-util"
import { PackageFileInfo } from "builder-util-runtime"
import { unlink } from "fs-extra-p"
import { getTemplatePath } from "../../util/pathManager"
import { NsisTarget } from "./NsisTarget"
import { copyFile } from "builder-util/out/fs"
import * as path from "path"
import { Lazy } from "lazy-val"
import { getBinFromGithub } from "builder-util/out/binDownload"

export const nsisTemplatesDir = getTemplatePath("nsis")

// noinspection SpellCheckingInspection
export const NSIS_PATH = new Lazy(() => getBinFromGithub("nsis", "3.0.1.13", "2921dd404ce9b69679088a6f1409a56dd360da2077fe1019573c0712c9edf057"))

export class AppPackageHelper {
  private readonly archToFileInfo = new Map<Arch, Promise<PackageFileInfo>>()
  private readonly infoToIsDelete = new Map<PackageFileInfo, boolean>()

  /** @private */
  refCount = 0

  constructor(private readonly elevateHelper: CopyElevateHelper) {
  }

  async packArch(arch: Arch, target: NsisTarget): Promise<PackageFileInfo> {
    let infoPromise = this.archToFileInfo.get(arch)
    if (infoPromise == null) {
      const appOutDir = target.archs.get(arch)!
      infoPromise = this.elevateHelper.copy(appOutDir, target)
        .then(() => target.buildAppPackage(appOutDir, arch))
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
        filesToDelete.push(info.path)
      }
    }

    await BluebirdPromise.map(filesToDelete, it => unlink(it))
  }
}

export class CopyElevateHelper {
  private readonly copied = new Map<string, Promise<string>>()

  copy(appOutDir: string, target: NsisTarget): Promise<any> {
    let isPackElevateHelper = target.options.packElevateHelper
    if (isPackElevateHelper === false && target.options.perMachine === true) {
      isPackElevateHelper = true
      warn("`packElevateHelper = false` is ignored, because `perMachine` is set to `true`")
    }

    if (isPackElevateHelper === false) {
      return BluebirdPromise.resolve()
    }

    let promise = this.copied.get(appOutDir)
    if (promise != null) {
      return promise
    }

    promise = NSIS_PATH.value.then(it => copyFile(path.join(it, "elevate.exe"), path.join(appOutDir, "resources", "elevate.exe"), false))
    this.copied.set(appOutDir, promise)
    return promise
  }
}