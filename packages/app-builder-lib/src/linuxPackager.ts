import { Arch } from "builder-util"
import { DIR_TARGET, Platform, Target } from "./core"
import { LinuxConfiguration } from "./options/linuxOptions"
import { Packager } from "./packager"
import { PlatformPackager } from "./platformPackager"
import AppImageTarget from "./targets/AppImageTarget"
import FlatpakTarget from "./targets/FlatpakTarget"
import FpmTarget from "./targets/FpmTarget"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper"
import SnapTarget from "./targets/snap"
import { createCommonTarget } from "./targets/targetFactory"
import { sanitizeFileName } from "./util/filename"

export class LinuxPackager extends PlatformPackager<LinuxConfiguration> {
  readonly executableName: string

  constructor(info: Packager) {
    super(info, Platform.LINUX)

    const executableName = this.platformSpecificBuildOptions.executableName
    this.executableName = executableName == null ? this.appInfo.sanitizedName.toLowerCase() : sanitizeFileName(executableName)
  }

  get defaultTarget(): Array<string> {
    return ["snap", "appimage"]
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

      const targetClass: typeof AppImageTarget | typeof SnapTarget | typeof FlatpakTarget | typeof FpmTarget | null = (() => {
        switch (name) {
          case "appimage":
            return require("./targets/AppImageTarget").default
          case "snap":
            return require("./targets/snap").default
          case "flatpak":
            return require("./targets/FlatpakTarget").default
          case "deb":
          case "rpm":
          case "sh":
          case "freebsd":
          case "pacman":
          case "apk":
          case "p5p":
            return require("./targets/FpmTarget").default
          default:
            return null
        }
      })()

      mapper(name, outDir => {
        if (targetClass === null) {
          return createCommonTarget(name, outDir, this)
        }

        return new targetClass(name, this, getHelper(), outDir)
      })
    }
  }
}

export function toAppImageOrSnapArch(arch: Arch): string {
  switch (arch) {
    case Arch.x64:
      return "x86_64"
    case Arch.ia32:
      return "i386"
    case Arch.armv7l:
      return "arm"
    case Arch.arm64:
      return "arm_aarch64"

    default:
      throw new Error(`Unsupported arch ${arch}`)
  }
}
