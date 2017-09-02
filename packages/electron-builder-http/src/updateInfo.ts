export interface VersionInfo {
  /**
   * The version.
   */
  readonly version: string
}

export interface PackageFileInfo {
  file: string
  size: number
  sha512: string
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
  readonly releaseNotes?: string | null

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