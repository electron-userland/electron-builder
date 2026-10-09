import { Arch, log } from "builder-util"
import { sanitizeFileName } from "builder-util/internal"
import { Nullish } from "builder-util-runtime"
import { DIR_TARGET, Platform, Target } from "./core.js"
import { LinuxConfiguration } from "./options/linuxOptions.js"
import { Packager } from "./packager.js"
import { PlatformPackager } from "./platformPackager.js"
import AppImageTarget from "./targets/linux/appimage/AppImageTarget.js"
import FlatpakTarget from "./targets/linux/FlatpakTarget.js"
import FpmTarget from "./targets/linux/FpmTarget.js"
import { LinuxTargetHelper } from "./targets/linux/LinuxTargetHelper.js"
import SnapTarget from "./targets/linux/snap/SnapTarget.js"
import { createCommonTarget } from "./targets/targetFactory.js"

/** Desktop Entry field codes — the DE substitutes these in `Exec`, they are not literal arguments. */
const DESKTOP_FIELD_CODE = /^%[a-zA-Z]$/

/**
 * v26 passed a field code through to the .desktop `Exec` key unquoted and skipped appending `%U`.
 * v27 routes executableArgs through the generated `<executableName>-launcher` script, where they are
 * single-quoted — so `%F` reaches the app as the literal string "%F" instead of the file list, and
 * a file-handling app silently stops receiving the files it was opened with.
 */
function warnAboutDesktopFieldCodes(executableArgs: Array<string> | Nullish): void {
  const fieldCodes = (executableArgs ?? []).filter(arg => DESKTOP_FIELD_CODE.test(arg))
  if (fieldCodes.length === 0) {
    return
  }
  log.warn(
    { fieldCodes: fieldCodes.join(", "), solution: "remove the field code from executableArgs and set linux.desktop.entry.Exec if you need a custom Exec line" },
    "linux.executableArgs contains desktop-entry field codes, which are no longer expanded. " +
      "In v27 executableArgs are injected into the generated *-launcher script and quoted, so these reach your app as literal arguments. " +
      "See https://www.electron.build/docs/migration/v27-breaking-changes#linux-launcher-entrypoint"
  )
}

export class LinuxPackager extends PlatformPackager<LinuxConfiguration> {
  readonly executableName: string

  constructor(info: Packager) {
    super(info, Platform.LINUX)

    const executableName = this.platformSpecificBuildOptions.executableName ?? info.config.executableName
    this.executableName = executableName == null ? this.appInfo.sanitizedName.toLowerCase() : sanitizeFileName(executableName)

    warnAboutDesktopFieldCodes(this.platformSpecificBuildOptions.executableArgs)
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
