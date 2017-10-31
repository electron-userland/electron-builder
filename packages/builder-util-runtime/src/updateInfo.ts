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
  /**
   * The file size. Used when block map data is embedded into the file (appimage, windows web installer package).
   */
  size?: number

  /**
   * The block map file size. Used when block map data is embedded into the file (appimage, windows web installer package).
   * This information can be obtained from the file itself, but it requires additional HTTP request,
   * so, to reduce request count, block map size is specified in the update metadata too.
   */
  blockMapSize?: number

  /**
   * The file checksum.
   */
  readonly sha512: string
}

export interface PackageFileInfo extends BlockMapDataHolder {
  readonly size: number

  readonly path: string

  /**
   * The header size. This number of bytes are downloaded as is and not included into the block map.
   */
  headerSize?: number

  /**
   * Used and not null only during build time.
   * We cannot pack blockMap file as part of package file because of chicken and egg problem — we build blockMap for package file (and we don't to complicate).
   */
  blockMapData?: Buffer
}

export interface UpdateFileInfo extends BlockMapDataHolder {
  url: string
}

export interface UpdateInfo {
  /**
   * The version.
   */
  readonly version: string

  readonly files: Array<UpdateFileInfo>

  /** @deprecated */
  readonly path: string

  /** @deprecated */
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
  releaseDate: string

  /**
   * The [staged rollout](auto-update.md#staged-rollouts) percentage, 0-100.
   */
  readonly stagingPercentage?: number
}

export interface WindowsUpdateInfo extends UpdateInfo {
  packages?: { [arch: string]: PackageFileInfo } | null

  /**
   * @deprecated
   * @private
   */
  sha2?: string
}
