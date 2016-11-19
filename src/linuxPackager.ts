import * as path from "path"
import { PlatformPackager, BuildInfo, Target } from "./platformPackager"
import { Platform } from "./metadata"
import FpmTarget from "./targets/fpm"
import { createCommonTarget, DEFAULT_TARGET, DIR_TARGET } from "./targets/targetFactory"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper"
import AppImageTarget from "./targets/appImage"
import { rename } from "fs-extra-p"
import { LinuxBuildOptions } from "./options/linuxOptions"
import sanitizeFileName from "sanitize-filename"
import SnapTarget from "./targets/snap"

export class LinuxPackager extends PlatformPackager<LinuxBuildOptions> {
  readonly executableName: string

  constructor(info: BuildInfo) {
    super(info)

    let executableName = this.platformSpecificBuildOptions.executableName
    this.executableName = sanitizeFileName(executableName == null ? this.appInfo.name : executableName).toLowerCase()
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
      if (name === DIR_TARGET) {
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
      else if (name === "snap") {
        const targetClass: typeof SnapTarget = require("./targets/snap").default
        mapper("snap", outDir => new targetClass(this, getHelper(), outDir))
      }
      else if (name === "deb" || name === "rpm" || name === "sh" || name === "freebsd" || name === "pacman" || name === "apk" || name === "p5p") {
        const targetClass: typeof FpmTarget = require("./targets/fpm").default
        mapper(name, outDir => new targetClass(name, this,  getHelper(), outDir))
      }
      else {
        mapper(name, outDir => createCommonTarget(name, outDir, this))
      }
    }
  }

  get platform() {
    return Platform.LINUX
  }

  protected postInitApp(appOutDir: string): Promise<any> {
    return rename(path.join(appOutDir, "electron"), path.join(appOutDir, this.executableName))
  }
}