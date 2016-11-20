import { AsarOptions } from "asar-electron-builder"
import { PlatformPackager } from "./platformPackager"
import { MacOptions, DmgOptions, MasBuildOptions } from "./options/macOptions"
import { Publish } from "./options/publishOptions"
import { WinBuildOptions, NsisOptions, SquirrelWindowsOptions, AppXOptions } from "./options/winOptions"
import { LinuxBuildOptions } from "./options/linuxOptions"

export interface Metadata {
  readonly repository?: string | RepositoryInfo | null

  dependencies?: { [key: string]: string }
}

/*
 # Application `package.json`
 */
export interface AppMetadata extends Metadata {
  readonly version?: string

  /*
   The application name.
   */
  readonly name: string

  /*
   As [name](#AppMetadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters
   not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).
   */
  readonly productName?: string | null

  /*
   The application description.
   */
  readonly description?: string

  readonly main?: string | null

  readonly author?: AuthorMetadata

  /*
   The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).

   If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default.
   */
  readonly homepage?: string | null

  /*
   *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.
   */
  readonly license?: string | null
}

/*
 # Development `package.json`
 */
export interface DevMetadata extends Metadata {
  /*
   See [.build](#BuildMetadata).
   */
  readonly build: BuildMetadata

  // deprecated
  readonly homepage?: string | null

  // deprecated
  readonly license?: string | null

  /*
   See [.directories](#MetadataDirectories)
   */
  readonly directories?: MetadataDirectories | null
}

export interface RepositoryInfo {
  readonly url: string
}

export interface AuthorMetadata {
  readonly name: string
  readonly email?: string
}

export type CompressionLevel = "store" | "normal" | "maximum"

/*
 ## `.build`
 */
export interface BuildMetadata {
  /*
  The application id. Used as
  [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070) for MacOS and as
  [Application User Model ID](https://msdn.microsoft.com/en-us/library/windows/desktop/dd378459(v=vs.85).aspx) for Windows (NSIS target only, Squirrel.Windows not supported).

  Defaults to `com.electron.${name}`. It is strongly recommended that an explicit ID be set.
   */
  readonly appId?: string | null

  /*
  The human-readable copyright line for the app. Defaults to `Copyright © year author`.
   */
  readonly copyright?: string | null

  // deprecated
  readonly iconUrl?: string | null

  /*
   See [AppMetadata.productName](#AppMetadata-productName).
   */
  readonly productName?: string | null

  /**
   A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the [app directory](#MetadataDirectories-app), which specifies which files to include when copying files to create the package.

   See [File Patterns](#multiple-glob-patterns).
   */
  readonly files?: Array<string> | string | null

  /**
   A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the project directory, when specified, copy the file or directory with matching names directly into the app's resources directory (`Contents/Resources` for MacOS, `resources` for Linux/Windows).

   Glob rules the same as for [files](#multiple-glob-patterns).
   */
  readonly extraResources?: Array<string> | string | null

  /**
   The same as [extraResources](#BuildMetadata-extraResources) but copy into the app's content directory (`Contents` for MacOS, root directory for Linux/Windows).
   */
  readonly extraFiles?: Array<string> | string | null

  /*
   Whether to package the application's source code into an archive, using [Electron's archive format](http://electron.atom.io/docs/tutorial/application-packaging/). Defaults to `true`.
   Reasons why you may want to disable this feature are described in [an application packaging tutorial in Electron's documentation](http://electron.atom.io/docs/tutorial/application-packaging/#limitations-of-the-node-api).

   Or you can pass object of any asar options.

   Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set `asarUnpack` - please file issue if this doesn't work.
   */
  readonly asar?: AsarOptions | boolean | null

  /**
   A [glob patterns](https://www.npmjs.com/package/glob#glob-primer) relative to the [app directory](#MetadataDirectories-app), which specifies which files to unpack when creating the [asar](http://electron.atom.io/docs/tutorial/application-packaging/) archive.
   */
  readonly asarUnpack?: Array<string> | string | null

  /*
  The file associations. See [.build.fileAssociations](#FileAssociation).
   */
  readonly fileAssociations?: Array<FileAssociation> | FileAssociation

  /*
  The URL protocol scheme(s) to associate the app with. See [.build.protocol](#Protocol).
  */
  readonly protocols?: Array<Protocol> | Protocol

  /*
   See [.build.mac](#MacOptions).
   */
  readonly mac?: MacOptions | null

  /*
   See [.build.dmg](#DmgOptions).
   */
  readonly dmg?: DmgOptions | null

  /*
   See [.build.mas](#MasBuildOptions).
   */
  readonly mas?: MasBuildOptions | null

  /*
   See [.build.win](#WinBuildOptions).
   */
  readonly win?: WinBuildOptions  | null

  /*
   See [.build.nsis](#NsisOptions).
   */
  readonly nsis?: NsisOptions  | null

  /*
   See [.build.squirrelWindows](#SquirrelWindowsOptions).
   */
  readonly squirrelWindows?: SquirrelWindowsOptions  | null

  /*
   See [.build.appx](#AppXOptions).
   */
  readonly appx?: AppXOptions  | null

  /*
   See [.build.linux](#LinuxBuildOptions).
   */
  readonly linux?: LinuxBuildOptions | null

  readonly deb?: LinuxBuildOptions | null

  /*
   The compression level, one of `store`, `normal`, `maximum` (default: `normal`). If you want to rapidly test build, `store` can reduce build time significantly.
   */
  readonly compression?: CompressionLevel | null

  /*
   *programmatic API only* The function to be run after pack (but before pack into distributable format and sign). Promise must be returned.
   */
  readonly afterPack?: (context: AfterPackContext) => Promise<any> | null

  /*
   Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies (`npm rebuild`) before starting to package the app. Defaults to `true`.
   */
  readonly npmRebuild?: boolean

  /*
   Whether to omit using [--build-from-source](https://github.com/mapbox/node-pre-gyp#options) flag when installing app native deps. Defaults to `false`.
   */
  readonly npmSkipBuildFromSource?: boolean

  /*
   Additional command line arguments to use when installing app native deps. Defaults to `null`.
   */
  readonly npmArgs?: Array<string> | string | null

  /*
   Whether to execute `node-gyp rebuild` before starting to package the app. Defaults to `false`.
   */
  readonly nodeGypRebuild?: boolean

  /*
  The path to custom Electron build (e.g. `~/electron/out/R`). Only macOS supported, file issue if need for Linux or Windows.
   */
  readonly electronDist?: string

  /*
  The [electron-download](https://github.com/electron-userland/electron-download#usage) options.
   */
  readonly electronDownload?: any

  readonly icon?: string | null

  // deprecated
  readonly "app-bundle-id"?: string | null

  readonly dereference?: boolean

  /*
  See [.build.publish](#PublishConfiguration).
   */
  readonly publish?: Publish
}

export interface AfterPackContext {
  readonly appOutDir: string

  // deprecated
  readonly options: any

  readonly packager: PlatformPackager<any>
}

/*
 ### `.build.fileAssociations`

 macOS and NSIS only. Array of option objects.
 */
export interface FileAssociation {
  /*
  The extension (minus the leading period). e.g. `png`.
   */
  readonly ext: string | Array<string>

  /*
   The name. e.g. `PNG`.
   */
  readonly name: string

  /*
   *windows-only.* The description.
   */
  readonly description?: string

  /*
   The path to icon (`.icns` for MacOS and `.ico` for Windows), relative to `build` (build resources directory). Defaults to `${firstExt}.icns`/`${firstExt}.ico` (if several extensions specified, first is used) or to application icon.
   */
  readonly icon?: string

  /*
  *macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Defaults to `Editor`.
   */
  readonly role?: string
}

/*
 ### `.build.protocols`

 macOS only.

 Please note — on macOS [you need to register an `open-url` event handler](http://electron.atom.io/docs/api/app/#event-open-url-macos).
 */
export interface Protocol {
  /*
   The name. e.g. `IRC server URL`.
   */
  readonly name: string

  /*
  *macOS-only* The app’s role with respect to the type. The value can be `Editor`, `Viewer`, `Shell`, or `None`. Defaults to `Editor`.
  */
  readonly role?: string

  /*
  The schemes. e.g. `["irc", "ircs"]`.
  */
  readonly schemes: Array<string>
}

/*
 ## `.directories`
 */
export interface MetadataDirectories {
  /*
   The path to build resources, defaults to `build`.
   */
  readonly buildResources?: string | null

  /*
   The output directory, defaults to `dist`.
   */
  readonly output?: string | null

  /*
   The application directory (containing the application package.json), defaults to `app`, `www` or working directory.
   */
  readonly app?: string | null
}

export interface PlatformSpecificBuildOptions {
  readonly files?: Array<string> | null
  readonly extraFiles?: Array<string> | null
  readonly extraResources?: Array<string> | null

  readonly asarUnpack?: Array<string> | null

  readonly asar?: AsarOptions | boolean

  readonly target?: Array<string> | null

  readonly icon?: string | null

  readonly fileAssociations?: Array<FileAssociation> | FileAssociation

  readonly publish?: Publish
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
    const archToType = new Map()
    if (this === Platform.MAC) {
      archs = [Arch.x64]
    }

    for (let arch of (archs == null || archs.length === 0 ? [archFromString(process.arch)] : archs)) {
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

export enum Arch {
  ia32, x64, armv7l
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