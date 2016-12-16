import * as path from "path"
import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform } from "./metadata"
import FpmTarget from "./targets/fpm"
import { createCommonTarget, DIR_TARGET, Target } from "./targets/targetFactory"
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

    const executableName = this.platformSpecificBuildOptions.executableName
    this.executableName = sanitizeFileName(executableName == null ? this.appInfo.name : executableName).toLowerCase()
  }

  get defaultTarget(): Array<string> {
    return ["appimage"]
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
    let helper: LinuxTargetHelper | null
    const getHelper = () => {
      if (helper == null) {
        helper = new LinuxTargetHelper(this)
      }
      return helper
    }

    for (const name of targets) {
      if (name === DIR_TARGET) {
        continue
      }

      const targetClass: typeof AppImageTarget | typeof SnapTarget | typeof FpmTarget | null = (() => {
        switch (name) {
          case "appimage":
            return require("./targets/appImage").default
          case "snap":
            return require("./targets/snap").default
          case "deb":
          case "rpm":
          case "sh":
          case "freebsd":
          case "pacman":
          case "apk":
          case "p5p":
            return require("./targets/fpm").default
          default:
            return null
        }
      })()

      mapper(name, outDir => targetClass === null ? createCommonTarget(name, outDir, this) : new targetClass(name, this, getHelper(), outDir))
    }
  }

  get platform() {
    return Platform.LINUX
  }

  protected postInitApp(appOutDir: string): Promise<any> {
    return rename(path.join(appOutDir, "electron"), path.join(appOutDir, this.executableName))
  }
}