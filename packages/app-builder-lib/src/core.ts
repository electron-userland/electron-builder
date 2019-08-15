import { Arch, archFromString, ArchType } from "builder-util"
import { AllPublishOptions } from "builder-util-runtime"
import { SnapStoreOptions } from "./publish/SnapStorePublisher"

// https://github.com/YousefED/typescript-json-schema/issues/80
export type Publish = AllPublishOptions | SnapStoreOptions | Array<AllPublishOptions | SnapStoreOptions> | null

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

  constructor(public name: string, public buildConfigurationKey: string, public nodeName: NodeJS.Platform) {
  }

  toString() {
    return this.name
  }

  createTarget(type?: string | Array<string> | null, ...archs: Array<Arch>): Map<Platform, Map<Arch, Array<string>>> {
    if (type == null && (archs == null || archs.length === 0)) {
      return new Map([[this, new Map()]])
    }

    const archToType = new Map()
    if (this === Platform.MAC) {
      archs = [Arch.x64]
    }

    for (const arch of (archs == null || archs.length === 0 ? [archFromString(process.arch)] : archs)) {
      archToType.set(arch, type == null ? [] : (Array.isArray(type) ? type : [type]))
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
  abstract readonly options: TargetSpecificOptions | null | undefined

  protected constructor(readonly name: string, readonly isAsyncSupported: boolean = true) {
  }

  async checkOptions(): Promise<any> {
    // ignore
  }

  abstract build(appOutDir: string, arch: Arch): Promise<any>

  finishBuild(): Promise<any> {
    return Promise.resolve()
  }
}

export interface TargetSpecificOptions {
  /**
   The [artifact file name template](/configuration/configuration#artifact-file-name-template).
   */
  readonly artifactName?: string | null

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
}