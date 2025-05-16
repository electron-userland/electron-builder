import { Arch } from "builder-util"
import { sanitizeFileName } from "builder-util"
import { DIR_TARGET, Platform, Target } from "./core.js"
import { LinuxConfiguration } from "./options/linuxOptions.js"
import { Packager } from "./packager.js"
import { PlatformPackager } from "./platformPackager.js"
import AppImageTarget from "./targets/AppImageTarget.js"
import FlatpakTarget from "./targets/FlatpakTarget.js"
import FpmTarget from "./targets/FpmTarget.js"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper.js"
import SnapTarget from "./targets/snap.js"
import { createCommonTarget } from "./targets/targetFactory.js"

export class LinuxPackager extends PlatformPackager<LinuxConfiguration> {
  readonly executableName: string

  constructor(info: Packager) {
    super(info, Platform.LINUX)

    const executableName = this.platformSpecificBuildOptions.executableName ?? info.config.executableName
    this.executableName = executableName == null ? this.appInfo.sanitizedName.toLowerCase() : sanitizeFileName(executableName)
  }

  get defaultTarget(): Array<string> {
    return ["snap", "appimage"]
  }

  async createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): Promise<void> {
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

      const targetClass: typeof AppImageTarget | typeof SnapTarget | typeof FlatpakTarget | typeof FpmTarget = await (() => {
        switch (name) {
          case "appimage":
            return import("./targets/AppImageTarget.js")
          case "snap":
            return import("./targets/snap.js")
          case "flatpak":
            return import("./targets/FlatpakTarget.js")
          case "deb":
          case "rpm":
          case "sh":
          case "freebsd":
          case "pacman":
          case "apk":
          case "p5p":
            return import("./targets/FpmTarget.js")
          default:
            return null
        }
      })()!.then(m => m.default)

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
