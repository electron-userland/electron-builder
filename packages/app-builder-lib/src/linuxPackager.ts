import { Arch, AsyncTaskManager } from "builder-util"
import { sanitizeFileName } from "builder-util/out/filename"
import * as path from "path"
import { DIR_TARGET, Platform, Target } from "./core"
import { LinuxConfiguration } from "./options/linuxOptions"
import { Packager } from "./packager"
import { PlatformPackager } from "./platformPackager"
import AppImageTarget from "./targets/appimage/AppImageTarget"
import FlatpakTarget from "./targets/FlatpakTarget"
import FpmTarget from "./targets/FpmTarget"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper"
import SnapTarget from "./targets/snap"
import { createCommonTarget } from "./targets/targetFactory"

export class LinuxPackager extends PlatformPackager<LinuxConfiguration> {
  readonly executableName: string
  private _helper: LinuxTargetHelper | null = null
  private readonly emittedDesktopFiles = new Set<string>()

  constructor(info: Packager) {
    super(info, Platform.LINUX)

    const executableName = this.platformSpecificBuildOptions.executableName ?? info.config.executableName
    this.executableName = executableName == null ? this.appInfo.sanitizedName.toLowerCase() : sanitizeFileName(executableName)
  }

  get defaultTarget(): Array<string> {
    return ["snap", "appimage"]
  }

  getHelper(): LinuxTargetHelper {
    if (this._helper == null) {
      this._helper = new LinuxTargetHelper(this)
    }
    return this._helper
  }

  override async pack(outDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): Promise<any> {
    await super.pack(outDir, arch, targets, taskManager)

    for (const target of targets) {
      if (target.name === DIR_TARGET) {
        continue
      }

      const targetConfig: any = (this.config as any)[target.name] ?? {}
      // Target-specific `desktop: null` opts out; `undefined` inherits platform-level config
      const hasTargetSpecificDesktop = "desktop" in targetConfig
      const effectiveDesktop = hasTargetSpecificDesktop ? targetConfig.desktop : this.platformSpecificBuildOptions.desktop
      if (effectiveDesktop == null || effectiveDesktop === false) {
        continue
      }

      // When a target has its own explicit desktop config, use a target-specific filename
      // to avoid silently dropping different configs when multiple targets are built.
      // Targets that only inherit the platform-level `linux.desktop` all share one file.
      const desktopFileName = hasTargetSpecificDesktop ? `${this.executableName}-${target.name.toLowerCase()}.desktop` : `${this.executableName}.desktop`
      const desktopEntryPath = path.join(outDir, desktopFileName)
      if (this.emittedDesktopFiles.has(desktopEntryPath)) {
        continue
      }
      this.emittedDesktopFiles.add(desktopEntryPath)

      // Normalize boolean `true` to an empty LinuxDesktopFile so computeDesktopEntry
      // can safely access .entry and .desktopActions via optional chaining.
      const mergedOptions = { ...this.platformSpecificBuildOptions, ...targetConfig, desktop: effectiveDesktop === true ? {} : effectiveDesktop }
      await this.getHelper().writeDesktopEntry(mergedOptions, undefined, desktopEntryPath)
      await this.info.emitArtifactBuildCompleted({
        file: desktopEntryPath,
        arch,
        target: null,
        packager: this,
      })
    }
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
    for (const name of targets) {
      if (name === DIR_TARGET) {
        continue
      }

      const targetClass: typeof AppImageTarget | typeof SnapTarget | typeof FlatpakTarget | typeof FpmTarget | null = (() => {
        switch (name) {
          case "appimage":
            return require("./targets/appimage/AppImageTarget").default
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

        return new targetClass(name, this, this.getHelper(), outDir)
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
