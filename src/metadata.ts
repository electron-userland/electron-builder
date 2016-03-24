export interface Metadata {
  readonly repository: string | RepositoryInfo
}

/*
  Application `package.json`
 */
export interface AppMetadata extends Metadata {
  readonly version: string

  /**
   The application name.
   */
  readonly name: string

  /**
   As [name](#name), but allows you to specify a product name for your executable which contains spaces and other special characters
   not allowed in the [name property](https://docs.npmjs.com/files/package.json#name}).
   */
  readonly productName?: string

  readonly description: string

  readonly author: AuthorMetadata
}

/*
  Development `package.json`
 */
export interface DevMetadata extends Metadata {
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

export interface BuildMetadata {
  readonly "app-bundle-id": string
  readonly "app-category-type": string

  readonly iconUrl: string

  /**
   See [AppMetadata.productName](#AppMetadata-productName).
   */
  readonly productName?: string

  readonly osx?: appdmg.Specification
  readonly win?: any,
  readonly linux?: any

  readonly extraResources?: Array<string>
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