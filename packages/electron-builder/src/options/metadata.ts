import { Configuration } from "../configuration"

export interface Metadata {
  /**
   * The application name.
   * @required
   */
  readonly name?: string

  /**
   * The application description.
   */
  readonly description?: string

  /**
   * The url to the project [homepage](https://docs.npmjs.com/files/package.json#homepage) (NuGet Package `projectUrl` (optional) or Linux Package URL (required)).
   *
   * If not specified and your project repository is public on GitHub, it will be `https://github.com/${user}/${project}` by default.
   */
  readonly homepage?: string | null

  /**
   * *linux-only.* The [license](https://docs.npmjs.com/files/package.json#license) name.
   */
  readonly license?: string | null

  readonly author?: AuthorMetadata | null

  /**
   * The [repository](https://docs.npmjs.com/files/package.json#repository).
   */
  readonly repository?: string | RepositoryInfo | null

  /**
   * The electron-builder configuration.
   */
  readonly build?: Configuration

  /** @private */
  readonly dependencies?: { [key: string]: string }
  /** @private */
  readonly version?: string
  /** @private */
  readonly productName?: string | null
  /** @private */
  readonly main?: string | null
}

export interface AuthorMetadata {
  readonly name: string
  readonly email?: string
}

export interface RepositoryInfo {
  readonly url: string
}