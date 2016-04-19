export interface Metadata {
  readonly repository: string | RepositoryInfo
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
  readonly productName?: string

  /*
   The application description.
   */
  readonly description: string

  readonly author: AuthorMetadata

  /*
   The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).

   If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default.
   */
  readonly homepage?: string

  /*
   *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.
   */
  readonly license?: string
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
  readonly homepage?: string

  // deprecated
  readonly license?: string

  /*
   See [.directories](#MetadataDirectories)
   */
  readonly directories?: MetadataDirectories
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
   *OS X-only.* The bundle identifier to use in the application's plist.
   */
  readonly "app-bundle-id"?: string
  /*
   *OS X-only.* The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.

   For example, `app-category-type=public.app-category.developer-tools` will set the application category to *Developer Tools*.

   Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).
   */
  readonly "app-category-type"?: string

  /*
   *windows-only.* A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Electron icon.

   Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.

   * If you don't plan to build windows installer, you can omit it.
   * If your project repository is public on GitHub, it will be `https://raw.githubusercontent.com/${user}/${project}/master/build/icon.ico` by default.
   */
  readonly iconUrl?: string

  /*
   See [AppMetadata.productName](#AppMetadata-productName).
   */
  readonly productName?: string

  /**
   A [glob expression](https://www.npmjs.com/package/glob#glob-primer), when specified, copy the file or directory with matching names directly into the app's directory (`Contents/Resources` for OS X).

   You can use `${os}` (expanded to osx, linux or win according to current platform) and `${arch}` in the pattern.

   If directory matched, all contents are copied. So, you can just specify `foo` to copy `<project_dir>/foo` directory.

   May be specified in the platform options (i.e. in the `build.osx`).
   */
  readonly extraResources?: Array<string>

  /*
   See [.build.osx](#OsXBuildOptions).
   */
  readonly osx?: OsXBuildOptions

  /**
   See [.build.win](#LinuxBuildOptions).
   */
  readonly win?: any,

  /*
   See [.build.linux](#LinuxBuildOptions).
   */
  readonly linux?: LinuxBuildOptions

  /*
   The compression level, one of `store`, `normal`, `maximum` (default: `normal`). If you want to rapidly test build, `store` can reduce build time significantly.
   */
  readonly compression?: "store" | "normal" | "maximum"

  readonly "build-version": string
}

/*
 ### `.build.osx`

 See all [appdmg options](https://www.npmjs.com/package/appdmg#json-specification).
 */
export interface OsXBuildOptions extends PlatformSpecificBuildOptions {
  /*
   The path to icon, which will be shown when mounted (default: `build/icon.icns`).
   */
  readonly icon?: string

  /*
   The path to background (default: `build/background.png`).
   */
  readonly background?: string
}

/*
 ### `.build.win`

 See all [windows-installer options](https://github.com/electron/windows-installer#usage).
 */
export interface WinBuildOptions extends PlatformSpecificBuildOptions {
  readonly certificateFile?: string
  readonly certificatePassword?: string

  readonly iconUrl?: string

  /*
   The path to a .gif file to display during install. `build/install-spinner.gif` will be used if exists
   (otherwise [default](https://github.com/electron/windows-installer/blob/master/resources/install-spinner.gif)).
   */
  readonly loadingGif?: string

  /**
   Whether to create an MSI installer. Defaults to `true` (MSI is not created).
   */
  readonly noMsi?: boolean
}

/*
 ### `.build.linux`
 */
export interface LinuxBuildOptions {
  /*
   As [description](#AppMetadata-description) from application package.json, but allows you to specify different for Linux.
   */
  description?: string

  /*
   *deb-only.* The [short description](https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-Description).
   */
  synopsis?: string

  /*
   The maintainer. Defaults to [author](#AppMetadata-author).
   */
  maintainer?: string

  /*
   The vendor. Defaults to [author](#AppMetadata-author).
   */
  vendor?: string

  // should be not documented, only to experiment
  fpm?: string[]

  //.desktop file template
  desktop?: string

  afterInstall?: string
  afterRemove?: string

  /*
  *deb-only.* The compression type, one of `gz`, `bzip2`, `xz` (default: `xz`).
   */
  readonly compression?: string
}

/*
 ## `.directories`
 */
export interface MetadataDirectories {
  /*
   The path to build resources, default `build`.
   */
  readonly buildResources?: string

  /*
   The output directory, default `dist`.
   */
  readonly output?: string
}

export interface PlatformSpecificBuildOptions {
  readonly extraResources?: Array<string>
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