import { Arch } from "builder-util"
import { sanitizeFileName } from "builder-util/out/cjs/filename"
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

export class LinuxPackager extends PlatformPackager<LinuxConfiguration> {
  get executableName(): string {
    const executableName = this.platformSpecificBuildOptions.executableName ?? this.info.config.executableName
    return executableName == null ? this.appInfo.sanitizedName.toLowerCase() : sanitizeFileName(executableName)
  }

  constructor(info: Packager) {
    super(info, Platform.LINUX)
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

      const targetClass: typeof AppImageTarget | typeof SnapTarget | typeof FlatpakTarget | typeof FpmTarget | null = await (async () => {
        switch (name) {
          case "appimage":
            return (await import("./targets/AppImageTarget")).default
          case "snap":
            return (await import("./targets/snap")).default
          case "flatpak":
            return (await import("./targets/FlatpakTarget")).default
          case "deb":
          case "rpm":
          case "sh":
          case "freebsd":
          case "pacman":
          case "apk":
          case "p5p":
            return (await import("./targets/FpmTarget")).default
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
