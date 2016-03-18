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
  public static OSX = new Platform("osx", "osx")
  public static LINUX = new Platform("linux", "linux")
  public static WINDOWS = new Platform("windows", "win")

  constructor(public name: string, public buildConfigurationKey: string) {
  }

  toString() {
    return this.name
  }

  public static fromNodePlatform(name: string): Platform {
    switch (name) {
      case "darwin": return Platform.OSX
      case "win32": return Platform.WINDOWS
      case "linux": return Platform.LINUX
    }

    throw new Error("Unknown platform: " + name)
  }
}

export function getProductName(metadata: AppMetadata, devMetadata: DevMetadata) {
  return devMetadata.build.productName || metadata.productName || metadata.name
}