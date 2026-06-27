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
   * The file size. Used to verify downloaded size (save one HTTP request to get length).
   * Also used when block map data is embedded into the file (appimage, windows web installer package).
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

  readonly isAdminRightsRequired?: boolean
}

export interface PackageFileInfo extends BlockMapDataHolder {
  readonly path: string
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

  /**
   * Legacy top-level download descriptor for electron-updater 1.x – 2.15.0. Modern clients read `files`.
   * Only emitted when `electronUpdaterCompatibility` includes legacy clients, so it may be absent.
   * @deprecated
   */
  readonly path?: string

  /**
   * Legacy top-level checksum for electron-updater 1.x – 2.15.0. Modern clients read `files[].sha512`.
   * Only emitted when `electronUpdaterCompatibility` includes legacy clients, so it may be absent.
   * @deprecated
   */
  readonly sha512?: string

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
   * The [staged rollout](https://www.electron.build/auto-update#staged-rollouts) percentage, 0-100.
   */
  readonly stagingPercentage?: number

  /**
   * The minimum version of system required for the app to run. Sample value: macOS `23.1.0`, Windows `10.0.22631`.
   * Same with os.release() value, this is a kernel version.
   */
  readonly minimumSystemVersion?: string
}

export interface WindowsUpdateInfo extends UpdateInfo {
  packages?: { [arch: string]: PackageFileInfo } | null

  /**
   * @deprecated
   * @private
   */
  sha2?: string
}
