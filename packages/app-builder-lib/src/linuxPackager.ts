import { Arch, AsyncTaskManager, log } from "builder-util"
import sanitizeFileName from "sanitize-filename"
import { DIR_TARGET, Platform, Target, TargetSpecificOptions } from "./core"
import { LinuxConfiguration } from "./options/linuxOptions"
import { Packager } from "./packager"
import { PlatformPackager } from "./platformPackager"
import { RemoteBuilder } from "./remoteBuilder/RemoteBuilder"
import AppImageTarget from "./targets/AppImageTarget"
import FpmTarget from "./targets/fpm"
import { LinuxTargetHelper } from "./targets/LinuxTargetHelper"
import SnapTarget from "./targets/snap"
import { createCommonTarget } from "./targets/targetFactory"

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

    let remoteBuilder: RemoteBuilder | null = null

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

      mapper(name, outDir => {
        if (targetClass === null) {
          return createCommonTarget(name, outDir, this)
        }

        const target = new targetClass(name, this, getHelper(), outDir)
        if (process.platform === "win32" || process.env._REMOTE_BUILD) {
          if (remoteBuilder == null) {
            remoteBuilder = new RemoteBuilder(this)
          }
          // return remoteBuilder.buildTarget(this, arch, appOutDir, this.packager)
          return new RemoteTarget(target, remoteBuilder)
        }
        return target
      })
    }
  }
}

class RemoteTarget extends Target {
  private buildTaskManager = new AsyncTaskManager(this.remoteBuilder.packager.info.cancellationToken)

  get options(): TargetSpecificOptions | null | undefined {
    return this.target.options
  }

  get outDir(): string {
    return this.target.outDir
  }

  constructor(private readonly target: Target, private readonly remoteBuilder: RemoteBuilder) {
    super(target.name, true /* all must be scheduled in time (so, on finishBuild RemoteBuilder will have all targets added - so, we must set isAsyncSupported to true (resolved promise is returned)) */)
  }

  async finishBuild() {
    await this.buildTaskManager.awaitTasks()
    await this.remoteBuilder.build()
  }

  build(appOutDir: string, arch: Arch) {
    const promise = this.doBuild(appOutDir, arch)
    this.buildTaskManager.addTask(promise)
    return promise
  }

  private async doBuild(appOutDir: string, arch: Arch) {
    log.info({target: this.target.name, arch: Arch[arch]}, "scheduling remote build")
    await this.target.checkOptions()
    this.remoteBuilder.scheduleBuild(this.target, arch, appOutDir)
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