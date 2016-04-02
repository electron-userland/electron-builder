export interface Metadata {
  readonly repository: string | RepositoryInfo
}

/**
 # Application `package.json`
 */
export interface AppMetadata extends Metadata {
  readonly version: string

  /**
   The application name.
   */
  readonly name: string

  /**
   As [name](#AppMetadata-name), but allows you to specify a product name for your executable which contains spaces and other special characters
   not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).
   */
  readonly productName?: string

  readonly description: string

  readonly author: AuthorMetadata
}

/**
 # Development `package.json`
 */
export interface DevMetadata extends Metadata {
  /**
   The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).

   If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default.
   */
  readonly homepage?: string

  /**
   *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name for this package.
   */
  readonly license?: string

  /**
   See [.build](#BuildMetadata).
   */
  readonly build?: BuildMetadata

  readonly directories?: MetadataDirectories
}

export interface RepositoryInfo {
  readonly url: string
}

export interface AuthorMetadata {
  readonly name: string
  readonly email: string
}

export interface MetadataDirectories {
  readonly buildResources?: string
}

/**
 ## `.build`
 */
export interface BuildMetadata {
  readonly "app-bundle-id": string
  readonly "app-category-type": string

  /**
   *windows-only.* A URL to an ICO file to use as the application icon (displayed in Control Panel > Programs and Features). Defaults to the Atom icon.

   Please note — [local icon file url is not accepted](https://github.com/atom/grunt-electron-installer/issues/73), must be https/http.

   * If you don't plan to build windows installer, you can omit it.
   * If your project repository is public on GitHub, it will be `https://raw.githubusercontent.com/${user}/${project}/master/build/icon.ico` by default.
   */
  readonly iconUrl: string

  /**
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

  /**
   See [OS X options](https://www.npmjs.com/package/appdmg#json-specification)
   */
  readonly osx?: appdmg.Specification

  /**
   See [windows-installer options](https://github.com/electronjs/windows-installer#usage)
   */
  readonly win?: any,

  /**
   See [.linux](#DebOptions).
   */
  readonly linux?: any
}

/**
 ### `.build.linux`
 */
export interface DebOptions {
  name: string
  comment: string

  maintainer: string

  //.desktop file template
  desktop?: string

  afterInstall?: string
  afterRemove?: string

  /*
  *deb-only.* The compression type to use, must be one of gz, bzip2, xz. (default: `xz`)
   */
  readonly compression?: string
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

  public static fromNodePlatform(name: string): Platform {
    switch (name) {
      case Platform.OSX.nodeName: return Platform.OSX
      case Platform.WINDOWS.nodeName: return Platform.WINDOWS
      case Platform.LINUX.nodeName: return Platform.LINUX
    }

    throw new Error("Unknown platform: " + name)
  }
}

export function getProductName(metadata: AppMetadata, devMetadata: DevMetadata) {
  return devMetadata.build.productName || metadata.productName || metadata.name
}