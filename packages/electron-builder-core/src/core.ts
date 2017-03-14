export enum Arch {
  ia32, x64, armv7l
}

export type ArchType = "x64" | "ia32" | "armv7l"

export function getArchSuffix(arch: Arch): string {
  return arch === Arch.x64 ? "" : `-${Arch[arch]}`
}

export type TargetConfigType = Array<string | TargetConfig> | string | TargetConfig | null

export interface TargetConfig {
  /**
   * The target name. e.g. `snap`.
   */
  readonly target: string

  /**
   * The arch or list of archs.
   */
  readonly arch?: Array<"x64" | "ia32" | "armv7l"> | string
}

export function toLinuxArchString(arch: Arch) {
  return arch === Arch.ia32 ? "i386" : (arch === Arch.x64 ? "amd64" : "armv7l")
}

export function archFromString(name: string): Arch {
  if (name === "x64") {
    return Arch.x64
  }
  if (name === "ia32") {
    return Arch.ia32
  }
  if (name === "armv7l") {
    return Arch.armv7l
  }

  throw new Error(`Unsupported arch ${name}`)
}

export class Platform {
  static MAC = new Platform("mac", "mac", "darwin")
  static LINUX = new Platform("linux", "linux", "linux")
  static WINDOWS = new Platform("windows", "win", "win32")

  // deprecated
  //noinspection JSUnusedGlobalSymbols
  static OSX = Platform.MAC

  constructor(public name: string, public buildConfigurationKey: string, public nodeName: string) {
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

  constructor(readonly name: string, readonly isAsyncSupported: boolean = true) {
  }

  abstract build(appOutDir: string, arch: Arch): Promise<any>

  finishBuild(): Promise<any> {
    return Promise.resolve()
  }
}

export interface TargetSpecificOptions {
  /**
   The [artifact file name pattern](https://github.com/electron-userland/electron-builder/wiki/Options#artifact-file-name-pattern).
   */
  readonly artifactName?: string | null

  readonly forceCodeSigning?: boolean
}

export const DEFAULT_TARGET = "default"
export const DIR_TARGET = "dir"

export interface AuthorMetadata {
  readonly name: string
  readonly email?: string
}

export type CompressionLevel = "store" | "normal" | "maximum"

export interface RepositoryInfo {
  readonly url: string
}

export interface FilePattern {
  from?: string
  to?: string
  filter?: Array<string> | string
}

export interface AsarOptions {
  smartUnpack?: boolean

  ordering?: string | null

  extraMetadata?: any | null
}

export interface BeforeBuildContext {
  readonly appDir: string
  readonly electronVersion: string
  readonly platform: Platform
  readonly arch: string
}

/**
 * File associations.
 * 
 * macOS (corresponds to [CFBundleDocumentTypes](https://developer.apple.com/library/content/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-101685)) and NSIS only.
 * 
 * On Windows works only if [nsis.perMachine](https://github.com/electron-userland/electron-builder/wiki/Options#NsisOptions-perMachine) is set to `true`.
 */
export interface FileAssociation {
  /**
   * The extension (minus the leading period). e.g. `png`.
   */
  readonly ext: string | Array<string>

  /**
   * The name. e.g. `PNG`. Defaults to `ext`.
   */
  readonly name?: string | null

  /**
   * *windows-only.* The description.
   */
  readonly description?: string | null

  /**
   * The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon.
   */
  readonly icon?: string | null

  /**
   * *macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Corresponds to `CFBundleTypeRole`.
   * @default Editor
   */
  readonly role?: string

  /**
   * *macOS-only* Whether the document is distributed as a bundle. If set to true, the bundle directory is treated as a file. Corresponds to `LSTypeIsPackage`.
   */
  readonly isPackage?: boolean
}

/**
 * URL Protocol Schemes. Protocols to associate the app with. macOS only.
 * 
 * Please note — on macOS [you need to register an `open-url` event handler](http://electron.atom.io/docs/api/app/#event-open-url-macos).
 */
export interface Protocol {
  /**
   * The name. e.g. `IRC server URL`.
   */
  readonly name: string

  /**
   * *macOS-only* The app’s role with respect to the type. 
   * @default Editor
   */
  readonly role?: "Editor" | "Viewer" | "Shell" | "None"

  /**
   * The schemes. e.g. `["irc", "ircs"]`.
  */
  readonly schemes: Array<string>
}

/**
 * `directories`
 */
export interface MetadataDirectories {
  /**
   * The path to build resources.
   * @default build
   */
  readonly buildResources?: string | null

  /**
   * The output directory.
   * @default dist
   */
  readonly output?: string | null

  /**
   * The application directory (containing the application package.json), defaults to `app`, `www` or working directory.
   */
  readonly app?: string | null
}

export interface SourceRepositoryInfo {
  type: string
  domain: string
  user: string
  project: string
}