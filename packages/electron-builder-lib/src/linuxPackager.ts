import { rename } from "fs-extra-p"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { AfterPackContext } from "./configuration"
import { DIR_TARGET, Platform, Target } from "./core"
import { LinuxConfiguration } from "./options/linuxOptions"
import { Packager } from "./packager"
import { PlatformPackager } from "./platformPackager"
import AppImageTarget from "./targets/AppImageTarget"
import FpmTarget from "./targets/fpm"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper"
import SnapTarget from "./targets/snap"
import { createCommonTarget } from "./targets/targetFactory"

export class LinuxPackager extends PlatformPackager<LinuxConfiguration> {
  readonly executableName: string

  constructor(info: Packager) {
    super(info)

    const executableName = this.platformSpecificBuildOptions.executableName
    this.executableName = executableName == null ? this.appInfo.sanitizedName.toLowerCase() : sanitizeFileName(executableName)
  }

  get defaultTarget(): Array<string> {
    return ["appimage"]
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
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
            return require("./targets/AppImageTarget").default
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

  protected postInitApp(packContext: AfterPackContext): Promise<any> {
    return rename(path.join(packContext.appOutDir, this.electronDistExecutableName), path.join(packContext.appOutDir, this.executableName))
  }
}