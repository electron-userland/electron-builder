import { Arch, archFromString, ArchType, AsyncTaskManager } from "builder-util"
import { AllPublishOptions, CancellationToken, Nullish } from "builder-util-runtime"

// https://github.com/YousefED/typescript-json-schema/issues/80
export type Publish = AllPublishOptions | Array<AllPublishOptions> | null

export type TargetConfigType = Array<string | TargetConfiguration> | string | TargetConfiguration | null

export interface TargetConfiguration {
  /**
   * The target name. e.g. `snap`.
   */
  readonly target: string

  /**
   * The arch or list of archs.
   */
  readonly arch?: Array<ArchType> | ArchType
}

export class Platform {
  static MAC = new Platform("mac", "mac", "darwin")
  static LINUX = new Platform("linux", "linux", "linux")
  static WINDOWS = new Platform("windows", "win", "win32")

  constructor(
    public name: string,
    public buildConfigurationKey: string,
    public nodeName: NodeJS.Platform
  ) {}

  toString() {
    return this.name
  }

  createTarget(type?: string | Array<string> | null, ...archs: Array<Arch>): Map<Platform, Map<Arch, Array<string>>> {
    if (type == null && (archs == null || archs.length === 0)) {
      return new Map([[this, new Map()]])
    }

    const archToType = new Map()

    for (const arch of archs == null || archs.length === 0 ? [archFromString(process.arch)] : archs) {
      archToType.set(arch, type == null ? [] : Array.isArray(type) ? type : [type])
    }
    return new Map([[this, archToType]])
  }

  static current(): Platform {
    return Platform.fromString(process.platform)
  }

  static fromString(name: string): Platform {
    name = name.toLowerCase()
    switch (name) {
      case Platform.MAC.nodeName:
      case Platform.MAC.name:
        return Platform.MAC

      case Platform.WINDOWS.nodeName:
      case Platform.WINDOWS.name:
      case Platform.WINDOWS.buildConfigurationKey:
        return Platform.WINDOWS

      case Platform.LINUX.nodeName:
        return Platform.LINUX

      default:
        throw new Error(`Unknown platform: ${name}`)
    }
  }
}

export abstract class Target {
  abstract readonly outDir: string
  abstract readonly options: TargetSpecificOptions | Nullish

  // use only for tasks that cannot be executed in parallel (such as signing on windows and hdiutil on macOS due to file locking)
  readonly buildQueueManager = new AsyncTaskManager(new CancellationToken())

  public constructor(
    readonly name: string,
    readonly isAsyncSupported: boolean = true
  ) {}

  async checkOptions(): Promise<any> {
    // ignore
  }

  /**
   * Whether this target's artifacts carry auto-update metadata (`isWriteUpdateInfo`), known before anything is built.
   * The publish preflight uses it to enforce update-manifest signing before the first upload of the whole build.
   * A target that emits update info without saying so here is still enforced when its artifact is created - only
   * uploads of other targets that finished earlier can slip through - so custom targets should override it.
   * "Emits update info" means an artifact event with `isWriteUpdateInfo: true` and no explicit `publishConfig`: an
   * artifact with an explicit `publishConfig` is only uploaded, and electron-builder writes no manifest for it.
   */
  get writesUpdateInfo(): boolean {
    return false
  }

  abstract build(appOutDir: string, arch: Arch): Promise<any>

  async finishBuild(): Promise<any> {
    await this.buildQueueManager.awaitTasks()
  }
}

export interface TargetSpecificOptions {
  /**
   * The [artifact file name template](https://www.electron.build/docs/configuration#artifact-file-name-template).
   * A target uses its own value, else its platform's (`mac`, `win`, `linux`), else the root value; when none is set,
   * the target's default name is used (see the target's options).
   */
  readonly artifactName?: string | null

  /**
   * Publisher configuration: where the artifacts are uploaded, and which feed the app's auto-update metadata points to.
   * See [Publish](https://www.electron.build/docs/publish). Can be set at the root, per platform and per target. The most specific level
   * that sets it is used as a whole and is never merged with a less specific one (`deb.publish` replaces `linux.publish`, and
   * `nsisWeb.publish` replaces `nsis.publish`); `null` turns publishing off unless a more specific level sets its own. The snap is the
   * exception: a `snapcraft.publish` that names a `snapStore` provider sends it only to the first one, one without a `snapStore` provider is
   * used as a whole (`[]` uploads it nowhere), and with `snapcraft.publish` unset or `null` the snap goes only to the first `snapStore`
   * provider of `linux.publish`, else of the root `publish`, else to the Snap Store, even if `linux.publish` or the root `publish` is `null`
   * (see [Publishing to the Snap Store](https://www.electron.build/docs/snap#publishing-to-the-snap-store)).
   * How the levels combine: [Which settings become the auto-update feed](https://www.electron.build/docs/publish#app-update-yml-feed).
   */
  publish?: Publish
}

export const DEFAULT_TARGET = "default"
export const DIR_TARGET = "dir"

export type CompressionLevel = "store" | "normal" | "maximum"

export interface BeforeBuildContext {
  readonly appDir: string
  readonly electronVersion: string
  readonly platform: Platform
  readonly arch: string
}

export interface SourceRepositoryInfo {
  type?: string
  domain?: string
  user: string
  project: string
  /**
   * Where the repository info was detected from: `package.json` (the `repository` field), the name of the CI
   * environment variable(s) it was read from, or `.git/config`. Absent when the info was supplied programmatically.
   */
  source?: string
}
