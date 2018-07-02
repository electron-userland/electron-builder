import BluebirdPromise from "bluebird-lst"
import { Arch, log } from "builder-util"
import { PackageFileInfo } from "builder-util-runtime"
import { getBinFromGithub } from "builder-util/out/binDownload"
import { copyFile } from "builder-util/out/fs"
import { unlink } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { getTemplatePath } from "../../util/pathManager"
import { NsisTarget } from "./NsisTarget"

export const nsisTemplatesDir = getTemplatePath("nsis")

export const NSIS_PATH = new Lazy(() => {
  const custom = process.env.ELECTRON_BUILDER_NSIS_DIR
  if (custom != null && custom.length > 0) {
    return Promise.resolve(custom.trim())
  }
  // noinspection SpellCheckingInspection
  return getBinFromGithub("nsis", "3.0.3.1", "rYRTO0OqNStw1uFP1RJ4aCGyK+GCz4AIy4uSO3g/sPmuONYDPhp8B0Q6xUx4aTb8hLaFeWyvo7tsp++9nrMoSw==")
})

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
    for (const [info, isDelete] of this.infoToIsDelete.entries()) {
      if (isDelete) {
        filesToDelete.push(info.path)
      }
    }

    await BluebirdPromise.map(filesToDelete, it => unlink(it))
  }
}

export class CopyElevateHelper {
  private readonly copied = new Map<string, Promise<any>>()

  copy(appOutDir: string, target: NsisTarget): Promise<any> {
    let isPackElevateHelper = target.options.packElevateHelper
    if (isPackElevateHelper === false && target.options.perMachine === true) {
      isPackElevateHelper = true
      log.warn("`packElevateHelper = false` is ignored, because `perMachine` is set to `true`")
    }

    if (isPackElevateHelper === false) {
      return Promise.resolve()
    }

    let promise = this.copied.get(appOutDir)
    if (promise != null) {
      return promise
    }

    promise = NSIS_PATH.value
      .then(it => {
        const outFile = path.join(appOutDir, "resources", "elevate.exe")
        const promise = copyFile(path.join(it, "elevate.exe"), outFile, false)
        if (target.packager.platformSpecificBuildOptions.signAndEditExecutable !== false) {
          return promise.then(() => target.packager.sign(outFile))
        }
        return promise
      })
    this.copied.set(appOutDir, promise)
    return promise
  }
}