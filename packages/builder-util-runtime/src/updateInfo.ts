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
   * Base64-encoded Ed25519 signature over the manifest's integrity-critical fields (the `EBUM1` payload),
   * populated at publish time when update manifest signing is enabled. Verified by electron-updater against
   * the configured `updateManifestPublicKey` before any download starts. See `canonicalizeForSigning`.
   *
   * Always the `EBUM1` signature of the *first* configured signing key; `signatures` carries the same value
   * (tagged with its key id) plus the other entries. Kept so updaters that only know this single-signature
   * form keep verifying.
   */
  readonly signature?: string

  /**
   * The manifest's Ed25519 signatures, each tagged with the id of the key that produced it (see
   * `computeUpdateManifestKeyId`) and the payload `format` it signs. electron-builder writes one `EBUM1` entry
   * per signing key, then one `EBUM2` entry per signing key. A manifest carrying entries from several keys is
   * "dual-signed": an install verifies it as long as *any* of its trusted keys matches *any* entry, which is what
   * makes key rotation possible without a flag day.
   */
  readonly signatures?: Array<UpdateManifestSignature>
}

/**
 * Payload format of a manifest signature:
 * - `EBUM1` — a fixed list of integrity-critical fields (see `canonicalizeForSigning`); electron-updater 7.0.0-alpha.8 and later.
 * - `EBUM2` — every top-level field except `signature`, `signatures`, `releaseName` and `releaseNotes`, as canonical JSON
 *   (see `canonicalizeForSigningV2`); electron-updater 7.0.0-alpha.12 and later.
 */
export type UpdateManifestSignatureFormat = "EBUM1" | "EBUM2"

export interface UpdateManifestSignature {
  /** Lowercase hex SHA-256 of the SPKI DER encoding of the signing key's public half. */
  readonly keyId: string
  /** Base64-encoded Ed25519 signature over the canonical manifest payload of `format`. */
  readonly signature: string
  /**
   * The payload this signature covers. Absent means `EBUM1`, the only format before `EBUM2` existed. Updaters that
   * predate `format` ignore it and simply fail to verify an `EBUM2` entry, so they fall through to the `EBUM1` entries.
   */
  readonly format?: UpdateManifestSignatureFormat
}

export interface WindowsUpdateInfo extends UpdateInfo {
  packages?: { [arch: string]: PackageFileInfo } | null

  /**
   * Whether electron-updater's default Authenticode verification accepts a valid signature that Windows reports from a security catalog
   * for this update's installer, when the catalog signer matches `publisherName` (like `NsisUpdater.allowCatalogSignature`, for this
   * update only). Written by electron-builder for `win.allowCatalogSignature: true`.
   *
   * electron-updater honors it only when the signature of this manifest was verified against a trusted key (`updateManifestPublicKey`);
   * otherwise it is ignored with a warning. When `true` it is covered by the manifest signature, so changing it means signing the manifest
   * again. A value that is not a boolean makes a signed manifest invalid.
   */
  readonly allowCatalogSignature?: boolean

  /**
   * @deprecated
   * @private
   */
  sha2?: string
}
