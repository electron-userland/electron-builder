import { AsarOptions } from "asar-electron-builder"
import { PlatformPackager } from "./platformPackager"

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

  readonly icon?: string | null

  // deprecated
  readonly "app-bundle-id"?: string | null

  readonly dereference?: boolean

  readonly publish?: string | Array<string> | null
}

export interface AfterPackContext {
  readonly appOutDir: string

  // deprecated
  readonly options: any

  readonly packager: PlatformPackager<any>
}

/*
 ### `.build.mac`

 MacOS specific build options.
 */
export interface MacOptions extends PlatformSpecificBuildOptions {
  /*
   The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.

   For example, `"category": "public.app-category.developer-tools"` will set the application category to *Developer Tools*.

   Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).
   */
  readonly category?: string | null

  /*
   Target package type: list of `default`, `dmg`, `mas`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`. Defaults to `default` (dmg and zip for Squirrel.Mac).
  */
  readonly target?: Array<string> | null

  /*
   The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
   MAS installer identity is specified in the [.build.mas](#MasBuildOptions-identity).
   */
  readonly identity?: string | null

  /*
   The path to application icon. Defaults to `build/icon.icns` (consider using this convention instead of complicating your configuration).
   */
  readonly icon?: string | null

  /*
   The path to entitlements file for signing the app. `build/entitlements.mac.plist` will be used if exists (it is a recommended way to set).
   MAS entitlements is specified in the [.build.mas](#MasBuildOptions-entitlements).
   */
  readonly entitlements?: string | null

  /*
   The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mac.inherit.plist` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).

   This option only applies when signing with `entitlements` provided.
   */
  readonly entitlementsInherit?: string | null

  /*
  The `CFBundleVersion`. Do not use it unless [you need to](see (https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643)).
   */
  readonly bundleVersion?: string | null

  /*
  The bundle identifier to use in the application helper's plist. Defaults to `${appBundleIdentifier}.helper`.
   */
  readonly helperBundleId?: string | null
}

/*
 ### `.build.dmg`

 MacOS DMG specific options.

 See all [appdmg options](https://www.npmjs.com/package/appdmg#json-specification).
 */
export interface DmgOptions {
  /*
   The path to DMG icon, which will be shown when mounted. Defaults to `build/icon.icns`.
   */
  readonly icon?: string | null

  /*
   The path to background (default: `build/background.png` if exists). The resolution of this file determines the resolution of the installer window.
   If background is not specified, use `window.size`, see [specification](https://github.com/LinusU/node-appdmg#json-specification).
   */
  readonly background?: string | null
}

/*
 ### `.build.mas`

 MAS (Mac Application Store) specific options (in addition to `build.mac`).
 */
export interface MasBuildOptions extends MacOptions {
  /*
   The path to entitlements file for signing the app. `build/entitlements.mas.plist` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist).
   */
  readonly entitlements?: string | null

  /*
   The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mas.inherit.plist` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist).
   */
  readonly entitlementsInherit?: string | null
}

/*
 ### `.build.win`

 Windows specific build options.
 */
export interface WinBuildOptions extends PlatformSpecificBuildOptions {
  /*
   Target package type: list of `squirrel`, `nsis`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`. Defaults to `squirrel`.
  */
  readonly target?: Array<string> | null

  /*
   *Squirrel.Windows-only.* A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Electron icon.

   Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.

   * If you don't plan to build windows installer, you can omit it.
   * If your project repository is public on GitHub, it will be `https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true` by default.
   */
  readonly iconUrl?: string | null

  /*
   *Squirrel.Windows-only.* The path to a .gif file to display during install. `build/install-spinner.gif` will be used if exists (it is a recommended way to set)
   (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).
   */
  readonly loadingGif?: string | null

  /*
   *Squirrel.Windows-only.* Whether to create an MSI installer. Defaults to `false` (MSI is not created).
   */
  readonly msi?: boolean

  /*
   *Squirrel.Windows-only.* A URL to your existing updates. Or `true` to automatically set to your GitHub repository. If given, these will be downloaded to create delta updates.
   */
  readonly remoteReleases?: string | boolean | null

  /*
   *Squirrel.Windows-only.* Authentication token for remote updates
   */
  readonly remoteToken?: string | null

  /*
   Array of signing algorithms used. Defaults to `['sha1', 'sha256']`
   */
  readonly signingHashAlgorithms?: Array<string> | null

  /*
   The path to application icon. Defaults to `build/icon.ico` (consider using this convention instead of complicating your configuration).
   */
  readonly icon?: string | null

  /*
  The trademarks and registered trademarks.
   */
  readonly legalTrademarks?: string | null

  readonly certificateFile?: string
  readonly certificatePassword?: string

  /*
  The name of the subject of the signing certificate. Required only for EV Code Signing and works only on Windows.
   */
  readonly certificateSubjectName?: string

  /*
  The URL of the RFC 3161 time stamp server. Defaults to `http://timestamp.comodoca.com/rfc3161`.
   */
  readonly rfc3161TimeStampServer?: string
}

/*
 ### `.build.nsis`

 NSIS target support in progress — not polished and not fully tested and checked.

 See [NSIS target notes](https://github.com/electron-userland/electron-builder/wiki/NSIS).
 */
export interface NsisOptions {
  /*
  One-click installation. Defaults to `true`.
   */
  readonly oneClick?: boolean | null

  /*
  Defaults to `false`.

  If `oneClick` is `true` (default): Install per all users (per-machine).

  If `oneClick` is `false`: no install mode installer page (choice per-machine or per-user), always install per-machine.
   */
  readonly perMachine?: boolean | null

  /*
   *boring installer only.* Allow requesting for elevation. If false, user will have to restart installer with elevated permissions. Defaults to `true`.
   */
  readonly allowElevation?: boolean | null

  /*
   *one-click installer only.* Run application after finish. Defaults to `true`.
   */
  readonly runAfterFinish?: boolean | null

  /*
  See [GUID vs Application Name](https://github.com/electron-userland/electron-builder/wiki/NSIS#guid-vs-application-name).
   */
  readonly guid?: string | null

  /*
   *boring installer only.* `MUI_HEADERIMAGE`, relative to the project directory. Defaults to `build/installerHeader.bmp`
   */
  readonly installerHeader?: string | null

  /*
   *one-click installer only.* The path to header icon (above the progress bar), relative to the project directory. Defaults to `build/installerHeaderIcon.ico` or application icon.
   */
  readonly installerHeaderIcon?: string | null

  /*
  The path to NSIS include script to customize installer. Defaults to `build/installer.nsh`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
   */
  readonly include?: string | null

  /*
  The path to NSIS script to customize installer. Defaults to `build/installer.nsi`. See [Custom NSIS script](https://github.com/electron-userland/electron-builder/wiki/NSIS#custom-nsis-script).
   */
  readonly script?: string | null

  /*
   * [LCID Dec](https://msdn.microsoft.com/en-au/goglobal/bb964664.aspx), defaults to `1033`(`English - United States`).
   */
  readonly language?: string | null
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