export interface VersionInfo {
  /**
   * The version.
   */
  readonly version: string
}

export interface UpdateInfo extends VersionInfo {
  readonly path: string
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
   * The [staged rollout](https://github.com/electron-userland/electron-builder/wiki/Auto-Update#staged-rollouts) percentage, 0-100.
   */
  readonly stagingPercentage?: number
}