export interface VersionInfo {
  /**
   * The version.
   */
  readonly version: string
}

export interface ReleaseNoteInfo {
  /**
   * The version.
   */
  readonly version: string

  /**
   * The note.
   */
  readonly note: string | null
}

export interface BlockMapDataHolder {
  size: number
  blockMapSize: number
  readonly sha512: string
}

export interface PackageFileInfo extends BlockMapDataHolder {
  readonly path: string

  headerSize?: number

  // we cannot pack blockMap file as part of package file because of chicken and egg problem — we build blockMap for package file (and we don't to complicate)
  // used and not null only during build time
  blockMapData?: string
}

export interface UpdateInfo extends VersionInfo {
  readonly path: string
  readonly sha512: string

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
   * The [staged rollout](auto-update.md#staged-rollouts) percentage, 0-100.
   */
  readonly stagingPercentage?: number
}

//tslint:disable-next-line:no-empty-interface
export interface AppImageUpdateInfo extends UpdateInfo, BlockMapDataHolder {
}

export interface WindowsUpdateInfo extends UpdateInfo {
  packages?: { [arch: string]: PackageFileInfo } | null

  /**
   * @deprecated
   * @private
   */
  sha2?: string
}
