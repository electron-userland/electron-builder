import ElectronPackagerOptions = ElectronPackager.ElectronPackagerOptions
export interface Metadata {
  readonly repository?: string | RepositoryInfo | null
}

/*
 # Application `package.json`
 */
export interface AppMetadata extends Metadata {
  readonly version: string

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
  readonly description: string

  readonly main?: string | null

  readonly author: AuthorMetadata

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
  readonly email: string
}

/*
 ## `.build`
 */
export interface BuildMetadata {
  /*
   *OS X-only.* The app bundle ID. See [CFBundleIdentifier](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070).
   */
  readonly "app-bundle-id"?: string | null
  /*
   *OS X-only.* The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.

   For example, `app-category-type=public.app-category.developer-tools` will set the application category to *Developer Tools*.

   Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).
   */
  readonly "app-category-type"?: string | null

  /*
   Whether to package the application's source code into an archive, using [Electron's archive format](https://github.com/electron/asar). Defaults to `true`.
    Reasons why you may want to disable this feature are described in [an application packaging tutorial in Electron's documentation](http://electron.atom.io/docs/latest/tutorial/application-packaging/#limitations-on-node-api/).
   */
  readonly asar?: boolean

  // deprecated
  readonly iconUrl?: string | null

  /*
   See [AppMetadata.productName](#AppMetadata-productName).
   */
  readonly productName?: string | null

  /**
   A [glob expression](https://www.npmjs.com/package/glob#glob-primer), when specified, copy the file or directory with matching names directly into the app's directory (`Contents/Resources` for OS X).

   You can use `${os}` (expanded to osx, linux or win according to current platform) and `${arch}` in the pattern.

   If directory matched, all contents are copied. So, you can just specify `foo` to copy `<project_dir>/foo` directory.

   May be specified in the platform options (i.e. in the `build.osx`).
   */
  readonly extraResources?: Array<string> | null

  /*
   See [.build.osx](#OsXBuildOptions).
   */
  readonly osx?: OsXBuildOptions | null

  /*
   See [.build.mas](#MasBuildOptions).
   */
  readonly mas?: MasBuildOptions | null

  /**
   See [.build.win](#LinuxBuildOptions).
   */
  readonly win?: WinBuildOptions  | null

  /*
   See [.build.linux](#LinuxBuildOptions).
   */
  readonly linux?: LinuxBuildOptions | null

  /*
   The compression level, one of `store`, `normal`, `maximum` (default: `normal`). If you want to rapidly test build, `store` can reduce build time significantly.
   */
  readonly compression?: "store" | "normal" | "maximum" | null

  readonly "build-version"?: string | null

  /*
   *programmatic API only* The function to be run after pack (but before pack into distributable format and sign). Promise must be returned.
   */
  readonly afterPack?: (context: AfterPackContext) => Promise<any> | null
}

export interface AfterPackContext {
  readonly appOutDir: string
  readonly options: ElectronPackagerOptions
}

/*
 ### `.build.osx`

 See all [appdmg options](https://www.npmjs.com/package/appdmg#json-specification).
 */
export interface OsXBuildOptions extends PlatformSpecificBuildOptions {
  /*
   The path to icon, which will be shown when mounted (default: `build/icon.icns`).
   */
  readonly icon?: string | null

  /*
   The path to background (default: `build/background.png` if exists). The resolution of this file determines the resolution of the installer window.
   If background is not specified, use `window.size`, see [specification](https://github.com/LinusU/node-appdmg#json-specification).
   */
  readonly background?: string | null

  /*
   Target package type: list of `default`, `dmg`, `zip`, `mas`, `7z`, `tar.xz`, `tar.gz`, `tar.bz2`, `tar.7z`. Defaults to `default` (dmg and zip for Squirrel.Mac).
  */
  readonly target?: Array<string> | null

  /*
   The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
   MAS installer identity is specified in the [.build.mas](#MasBuildOptions-identity).
   */
  readonly identity?: string | null

  /*
   The path to entitlements file for signing the app. `build/osx.entitlements` will be used if exists (it is a recommended way to set).
   MAS entitlements is specified in the [.build.mas](#MasBuildOptions-entitlements).
   */
  readonly entitlements?: string | null

  /*
   The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/osx.inherit.entitlements` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.darwin.inherit.entitlements).

   This option only applies when signing with `entitlements` provided.
   */
  readonly entitlementsInherit?: string | null
}

/*
 ### `.build.mas`

 MAS (Mac Application Store) specific options (in addition to `build.osx`).
 */
export interface MasBuildOptions extends OsXBuildOptions {
  /*
   The name of certificate to use when signing. Consider using environment variables [CSC_INSTALLER_LINK or CSC_INSTALLER_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
  */
  readonly identity?: string | null

  /*
   The path to entitlements file for signing the app. `build/mas.entitlements` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.mas.entitlements).
   */
  readonly entitlements?: string | null

  /*
   The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/mas.inherit.entitlements` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.mas.inherit.entitlements).
   */
  readonly entitlementsInherit?: string | null
}

/*
 ### `.build.win`
 */
export interface WinBuildOptions extends PlatformSpecificBuildOptions {
  readonly certificateFile?: string
  readonly certificatePassword?: string

  /*
   A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Electron icon.

   Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.

   * If you don't plan to build windows installer, you can omit it.
   * If your project repository is public on GitHub, it will be `https://github.com/${u}/${p}/blob/master/build/icon.ico?raw=true` by default.
   */
  readonly iconUrl?: string | null

  /*
   The path to a .gif file to display during install. `build/install-spinner.gif` will be used if exists (it is a recommended way to set)
   (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).
   */
  readonly loadingGif?: string | null

  /*
   Whether to create an MSI installer. Defaults to `false` (MSI is not created).
   */
  readonly msi?: boolean

  /*
   A URL to your existing updates. If given, these will be downloaded to create delta updates.
   */
  readonly remoteReleases?: string | null

  /*
   Authentication token for remote updates
   */
  readonly remoteToken?: string | null
}

/*
 ### `.build.linux`
 */
export interface LinuxBuildOptions extends PlatformSpecificBuildOptions {
  /*
   As [description](#AppMetadata-description) from application package.json, but allows you to specify different for Linux.
   */
  description?: string | null

  /*
   *deb-only.* The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
   */
  synopsis?: string | null

  /*
   The maintainer. Defaults to [author](#AppMetadata-author).
   */
  maintainer?: string | null

  /*
   The vendor. Defaults to [author](#AppMetadata-author).
   */
  vendor?: string | null

  // should be not documented, only to experiment
  fpm?: Array<string> | null

  //.desktop file template
  desktop?: string | null

  afterInstall?: string | null
  afterRemove?: string | null

  /*
  *deb-only.* The compression type, one of `gz`, `bzip2`, `xz` (default: `xz`).
   */
  readonly compression?: string | null

  /*
   Package dependencies. Defaults to `["libappindicator1", "libnotify-bin"]`.
   */
  readonly depends?: string[] | null

  /*
   Target package type: list of `default`, `deb`, `rpm`, `freebsd`, `pacman`, `p5p`, `apk`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`. Defaults to `default` (`deb`).

   Only `deb` is tested. Feel free to file issues for `rpm` and other package formats.
   */
  readonly target?: Array<string> | null
}

/*
 ## `.directories`
 */
export interface MetadataDirectories {
  /*
   The path to build resources, default `build`.
   */
  readonly buildResources?: string | null

  /*
   The output directory, default `dist`.
   */
  readonly output?: string | null

  /*
   The application directory (containing the application package.json), default `app`, `www` or working directory.
   */
  readonly app?: string | null
}

export interface PlatformSpecificBuildOptions {
  readonly extraResources?: Array<string> | null

  readonly target?: Array<string> | null
}

export class Platform {
  public static OSX = new Platform("osx", "osx", "darwin")
  public static LINUX = new Platform("linux", "linux", "linux")
  public static WINDOWS = new Platform("windows", "win", "win32")

  constructor(public name: string, public buildConfigurationKey: string, public nodeName: string) {
  }

  toString() {
    return this.name
  }

  public static fromString(name: string): Platform {
    switch (name) {
      case Platform.OSX.nodeName:
      case Platform.OSX.name:
        return Platform.OSX

      case Platform.WINDOWS.nodeName:
      case Platform.WINDOWS.name:
      case Platform.WINDOWS.buildConfigurationKey:
        return Platform.WINDOWS

      case Platform.LINUX.nodeName:
        return Platform.LINUX
    }

    throw new Error("Unknown platform: " + name)
  }
}

export function getProductName(metadata: AppMetadata, devMetadata: DevMetadata) {
  return devMetadata.build.productName || metadata.productName || metadata.name
}
