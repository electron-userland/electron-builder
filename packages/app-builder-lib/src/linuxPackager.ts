import { Arch } from "builder-util"
<<<<<<< HEAD
<<<<<<< HEAD
import { sanitizeFileName } from "builder-util/internal"
=======
import { sanitizeFileName } from "builder-util"
>>>>>>> c92b22265 (tmp save for .js extension migration)
import { DIR_TARGET, Platform, Target } from "./core.js"
import { LinuxConfiguration } from "./options/linuxOptions.js"
import { Packager } from "./packager.js"
import { PlatformPackager } from "./platformPackager.js"
<<<<<<< HEAD
import AppImageTarget from "./targets/appimage/AppImageTarget.js"
import FlatpakTarget from "./targets/FlatpakTarget.js"
import FpmTarget from "./targets/FpmTarget.js"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper.js"
import SnapTarget from "./targets/snap/SnapTarget.js"
import { createCommonTarget } from "./targets/targetFactory.js"
=======
import { sanitizeFileName } from "builder-util/out/filename"
import { DIR_TARGET, Platform, Target } from "./core.js.js"
import { LinuxConfiguration } from "./options/linuxOptions.js.js"
import { Packager } from "./packager.js.js"
import { PlatformPackager } from "./platformPackager.js.js"
import AppImageTarget from "./targets/AppImageTarget.js.js"
import FlatpakTarget from "./targets/FlatpakTarget.js.js"
import FpmTarget from "./targets/FpmTarget.js.js"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper.js.js"
import SnapTarget from "./targets/snap.js.js"
import { createCommonTarget } from "./targets/targetFactory.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import AppImageTarget from "./targets/AppImageTarget.js"
import FlatpakTarget from "./targets/FlatpakTarget.js"
import FpmTarget from "./targets/FpmTarget.js"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper.js"
import SnapTarget from "./targets/snap.js"
import { createCommonTarget } from "./targets/targetFactory.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

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
            return AppImageTarget
          case "snap":
            return SnapTarget
          case "flatpak":
            return FlatpakTarget
          case "deb":
          case "rpm":
          case "sh":
          case "freebsd":
          case "pacman":
          case "apk":
          case "p5p":
            return FpmTarget
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
