import { DIR_TARGET, Platform, Target } from "electron-builder-core"
import { rename } from "fs-extra-p"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { LinuxBuildOptions } from "./options/linuxOptions"
import { BuildInfo } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import AppImageTarget from "./targets/appImage"
import FpmTarget from "./targets/fpm"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper"
import SnapTarget from "./targets/snap"
import { createCommonTarget } from "./targets/targetFactory"

export class LinuxPackager extends PlatformPackager<LinuxBuildOptions> {
  readonly executableName: string

  constructor(info: BuildInfo) {
    super(info)

    const executableName = this.platformSpecificBuildOptions.executableName
    this.executableName = sanitizeFileName(executableName == null ? this.appInfo.name.toLowerCase() : executableName)
  }

  get defaultTarget(): Array<string> {
    return ["appimage"]
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