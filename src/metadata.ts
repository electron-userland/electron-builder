import { AsarOptions } from "asar-electron-builder"
import { PlatformPackager } from "./platformPackager"
import { MacOptions, DmgOptions, MasBuildOptions } from "./options/macOptions"
import { PublishConfiguration } from "./options/publishOptions"
import { WinBuildOptions, NsisOptions } from "./options/winOptions"

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

  /*
   Whether to package the application's source code into an archive, using [Electron's archive format](https://github.com/electron/asar). Defaults to `true`.
   Reasons why you may want to disable this feature are described in [an application packaging tutorial in Electron's documentation](http://electron.atom.io/docs/latest/tutorial/application-packaging/#limitations-on-node-api/).

   Or you can pass object of any asar options.

   Node modules, that must be unpacked, will be detected automatically, you don't need to explicitly set `asar.unpackDir` - please file issue if this doesn't work.
   */
  readonly asar?: AsarOptions | boolean | null

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

  // deprecated
  readonly osx?: MacOptions | null

  /*
   See [.build.mas](#MasBuildOptions).
   */
  readonly mas?: MasBuildOptions | null

  /**
   See [.build.win](#WinBuildOptions).
   */
  readonly win?: WinBuildOptions  | null

  /**
   See [.build.nsis](#NsisOptions).
   */
  readonly nsis?: NsisOptions  | null

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
   *two package.json structure only* Whether to [rebuild](https://docs.npmjs.com/cli/rebuild) native dependencies (`npm rebuild`) before starting to package the app. Defaults to `true`.
   */
  readonly npmRebuild?: boolean

  /*
   Whether to execute `node-gyp rebuild` before starting to package the app. Defaults to `false`.
   */
  readonly nodeGypRebuild?: boolean

  /**
  The path to custom Electron build (e.g. `~/electron/out/R`). Only macOS supported, file issue if need for Linux or Windows.
   */
  readonly electronDist?: string

  readonly icon?: string | null

  // deprecated
  readonly "app-bundle-id"?: string | null

  readonly dereference?: boolean

  readonly publish?: string | Array<string> | null | PublishConfiguration
}

export interface AfterPackContext {
  readonly appOutDir: string

  // deprecated
  readonly options: any

  readonly packager: PlatformPackager<any>
}

/*
 ### `.build.linux`

 Linux specific build options.
 */
export interface LinuxBuildOptions extends PlatformSpecificBuildOptions {
  /*
   The [application category](https://specifications.freedesktop.org/menu-spec/latest/apa.html#main-category-registry).
   */
  readonly category?: string | null

  /*
  The [package category](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Section). Not applicable for AppImage.
   */
  readonly packageCategory?: string | null

  /*
   As [description](#AppMetadata-description) from application package.json, but allows you to specify different for Linux.
   */
  readonly description?: string | null

  /*
   Target package type: list of `AppImage`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`. Defaults to `AppImage`.

   The most effective [xz](https://en.wikipedia.org/wiki/Xz) compression format used by default.

   Only `deb` and `AppImage` is tested. Feel free to file issues for `rpm` and other package formats.
   */
  readonly target?: Array<string> | null

  /*
   *deb-only.* The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
   */
  readonly synopsis?: string | null

  /*
   The maintainer. Defaults to [author](#AppMetadata-author).
   */
  readonly maintainer?: string | null

  /*
   The vendor. Defaults to [author](#AppMetadata-author).
   */
  readonly vendor?: string | null

  // should be not documented, only to experiment
  readonly fpm?: Array<string> | null

  /**
   The [Desktop file](https://developer.gnome.org/integration-guide/stable/desktop-files.html.en) entries.
   */
  readonly desktop?: { [key: string]: string; } | null

  readonly afterInstall?: string | null
  readonly afterRemove?: string | null

  /*
  *deb-only.* The compression type, one of `gz`, `bzip2`, `xz`. Defaults to `xz`.
   */
  readonly compression?: string | null

  /*
   Package dependencies. Defaults to `["libappindicator1", "libnotify-bin"]`.
   */
  readonly depends?: string[] | null
}

/*
 ### `.build.fileAssociations`

 NSIS and MacOS only.
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

  readonly asar?: AsarOptions | boolean

  readonly target?: Array<string> | null

  readonly icon?: string | null

  readonly fileAssociations?: Array<FileAssociation> | FileAssociation

  readonly publish?: string | Array<string> | null
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

  toJSON() {
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
      case "osx":
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
  ia32, x64
}

export function archFromString(name: string): Arch {
  if (name === "x64") {
    return Arch.x64
  }
  if (name === "ia32") {
    return Arch.ia32
  }

  throw new Error(`Unsupported arch ${name}`)
}