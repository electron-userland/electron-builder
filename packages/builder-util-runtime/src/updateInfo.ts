export interface VersionInfo {
  /**
   * The version.
   */
  readonly version: string
}

export interface ReleaseNoteInfo {
  readonly version: string

  readonly note: string | null
}

export interface PackageFileInfo {
  file: string
  size: number
  sha512: string

  headerSize?: number
  blockMapSize?: number

  // we cannot pack blockMap file as part of package file because of chicken and egg problem — we build blockMap for package file (and we don't to complicate)
  // used and not null only during build time
  blockMapData?: string
}

export interface UpdateInfo extends VersionInfo {
  readonly path: string

  packages?: { [arch: string]: PackageFileInfo } | null

  githubArtifactName?: string | null

  /**
   * The release name.
   */
  readonly releaseName?: string | null

  /**
   * The release notes.
   */
  readonly releaseNotes?: string | Array<ReleaseNoteInfo> | null

  /**
   * The release date.
   */
  readonly releaseDate: string

  /**
   * @deprecated
   * @private
   */
  readonly sha2?: string

  readonly sha512?: string

  /**
   * The [staged rollout](auto-update.md#staged-rollouts) percentage, 0-100.
   */
  readonly stagingPercentage?: number
}