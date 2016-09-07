import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo, Target, TargetEx } from "./platformPackager"
import { Platform, LinuxBuildOptions, Arch } from "./metadata"
import FpmTarget from "./targets/fpm"
import { createCommonTarget, DEFAULT_TARGET } from "./targets/targetFactory"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper"
import AppImageTarget from "./targets/appImage"
import { rename } from "fs-extra-p"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter")

export class LinuxPackager extends PlatformPackager<LinuxBuildOptions> {
  constructor(info: BuildInfo) {
    super(info)
  }

  normalizePlatformSpecificBuildOptions(options: LinuxBuildOptions | n): LinuxBuildOptions {
    if (options != null && options.description != null) {
      return options
    }
    else {
      return Object.assign({
        description: this.info.appInfo.description,
      }, options)
    }
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void, cleanupTasks: Array<() => Promise<any>>): void {
    for (let name of targets) {
      if (name === "dir") {
        continue
      }

      let helper: LinuxTargetHelper | null
      const getHelper = () => {
        if (helper == null) {
          helper = new LinuxTargetHelper(this)
        }
        return helper
      }

      if (name === DEFAULT_TARGET || name === "appimage") {
        const targetClass: typeof AppImageTarget = require("./targets/appImage").default
        mapper("appimage", outDir => new targetClass(this, getHelper(), outDir))
      }
      else if (name === "deb" || name === "rpm" || name === "sh" || name === "freebsd" || name === "pacman" || name === "apk" || name === "p5p") {
        const targetClass: typeof FpmTarget = require("./targets/fpm").default
        mapper(name, outDir => new targetClass(name, this,  getHelper(), outDir))
      }
      else {
        mapper(name, () => createCommonTarget(name))
      }
    }
  }

  get platform() {
    return Platform.LINUX
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    const appOutDir = this.computeAppOutDir(outDir, arch)
    await this.doPack(outDir, appOutDir, this.platform.nodeName, arch, this.platformSpecificBuildOptions)
    postAsyncTasks.push(this.packageInDistributableFormat(outDir, appOutDir, arch, targets))
  }

  protected postInitApp(appOutDir: string): Promise<any> {
    return rename(path.join(appOutDir, "electron"), path.join(appOutDir, this.appInfo.productFilename))
  }

  protected async packageInDistributableFormat(outDir: string, appOutDir: string, arch: Arch, targets: Array<Target>): Promise<any> {
    // todo fix fpm - if run in parallel, get strange tar errors
    for (let t of targets) {
      if (t instanceof TargetEx) {
        await t.build(appOutDir, arch)
      }
    }

    const promises: Array<Promise<any>> = []
    // https://github.com/electron-userland/electron-builder/issues/460
    // for some reasons in parallel to fmp we cannot use tar
    for (let t of targets) {
      const target = t.name
      if (target === "zip" || target === "7z" || target.startsWith("tar.")) {
        const destination = path.join(outDir, this.generateName(target, arch, true))
        promises.push(this.archiveApp(target, appOutDir, destination)
          .then(() => this.dispatchArtifactCreated(destination)))
      }
    }

    if (promises.length > 0) {
      await BluebirdPromise.all(promises)
    }
  }
}