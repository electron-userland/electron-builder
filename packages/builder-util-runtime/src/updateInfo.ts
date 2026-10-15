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

  /**
   * URL of the file's blockmap, for a blockmap that is not at `${url}.blockmap` with the file's query string (e.g. a separately
   * pre-signed URL). A relative value is resolved like `url` (against the feed URL); an absolute URL is used as-is, with its own host and query. Not written by
   * electron-builder; covered by the manifest signature when present.
   */
  blockMapUrl?: string
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
   * The [staged rollout](https://www.electron.build/docs/features/auto-update#staged-rollouts) percentage, 0-100.
   */
  readonly stagingPercentage?: number

  /**
   * The minimum version of system required for the app to run. Sample value: macOS `23.1.0`, Windows `10.0.22631`.
   * Same with os.release() value, this is a kernel version.
   */
  readonly minimumSystemVersion?: string

  /**
   * Base64-encoded Ed25519 signature over the manifest's integrity-critical fields, populated at
   * publish time when update manifest signing is enabled. Verified by electron-updater against the
   * configured `updateManifestPublicKey` before any download starts. See `canonicalizeForSigning`.
   *
   * Always the first configured signing key's signature over the legacy `EBUM1` payload; `signatures` carries the
   * same value (tagged with its key id) plus the other entries. Kept so updaters that only know this
   * single-signature form keep verifying.
   */
  readonly signature?: string

  /**
   * The Ed25519 signatures the manifest was signed with, each tagged with the id of the key that produced it
   * (see `computeUpdateManifestKeyId`). electron-builder writes two entries per signing key: first one per key over
   * the legacy `EBUM1` payload (what electron-updater 7.0.0-alpha.8 and alpha.9 verify), then one per key over the
   * current `EBUM2` payload (see `canonicalizeForSigning`). An install verifies the manifest as long as *any* of its
   * trusted keys matches *any* entry in a format it accepts, which is what makes key rotation possible without a
   * flag day and lets older updaters ignore the entries they do not understand.
   */
  readonly signatures?: Array<UpdateManifestSignature>
}

export interface UpdateManifestSignature {
  /** Lowercase hex SHA-256 of the SPKI DER encoding of the signing key's public half. */
  readonly keyId: string
  /** Base64-encoded Ed25519 signature over the canonical manifest payload. */
  readonly signature: string
}

export interface WindowsUpdateInfo extends UpdateInfo {
  packages?: { [arch: string]: PackageFileInfo } | null

  /**
   * @deprecated
   * @private
   */
  sha2?: string
}
