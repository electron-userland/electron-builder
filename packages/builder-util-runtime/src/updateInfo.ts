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

export interface UpdateInfo {
  /**
   * The version.
   */
  readonly version: string

  /**
   * @deprecated
   */
  readonly path: string

  readonly url: string | Array<string>

  readonly sha512: string

  /**
   * The release name.
   */
  releaseName?: string | null

  /**
   * The release notes. List if `updater.fullChangelog` is set to `true`, `string` otherwise.
   */
  releaseNotes?: string | Array<ReleaseNoteInfo> | null

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
