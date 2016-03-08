export interface AppMetadata extends Metadata {
  readonly version: string

  /** The application name */
  readonly name: string

  /**
   * As {@link AppMetadata#name}, but allows you to specify a product name for your executable which contains spaces and other special characters
   * not allowed in the [name property]{@link https://docs.npmjs.com/files/package.json#name}.
   */
  readonly productName?: string

  readonly description: string
  readonly author: AuthorMetadata

  readonly build: BuildMetadata
}

export function getProductName(metadata: AppMetadata) {
  return metadata.build.productName || metadata.productName || metadata.name
}

export interface DevMetadata extends Metadata {
  readonly build: DevBuildMetadata

  readonly directories?: MetadataDirectories
}

export interface BuildMetadata {
  readonly "app-bundle-id": string
  readonly "app-category-type": string

  readonly iconUrl: string

  /**
   * See {@link AppMetadata#productName}.
   */
  readonly productName?: string
}

export interface RepositoryInfo {
  readonly url: string
}

export interface Metadata {
  readonly repository: string | RepositoryInfo
}

export interface AuthorMetadata {
  readonly name: string
  readonly email: string
}

export interface MetadataDirectories {
  readonly buildResources?: string
}

export interface DevBuildMetadata {
  readonly osx: appdmg.Specification
  readonly win: any,
  readonly linux: any
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
}