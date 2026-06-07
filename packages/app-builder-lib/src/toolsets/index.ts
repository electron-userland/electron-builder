
/**
 * Configuration of toolsets utilized by electron-builder
 */
export interface ToolsetConfig {
  /**
   * `win-codesign` version to use for signing Windows artifacts.
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=win-codesign&expanded=true
   *
   * Stable:
   *
   * Beta:
   * v0.0.0 - (winCodeSign) [legacy]
   * v1.0.0, v1.1.0 - (Windows Kits 10.0.26100.0)
   *
   * @default "1.1.0"
   */
  readonly winCodeSign?: "0.0.0" | "1.0.0" | "1.1.0" | ToolsetCustom | null

  /**
   * `appimage` bundle version to use for Appimage packaging and runtime.
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=appimage&expanded=true
   *
   * 0.0.0 - (FUSE2) [legacy]
   * 1.0.3 - (Runtime 20251108)
   *
   * @default "1.0.3"
   */
  readonly appimage?: "0.0.0" | "1.0.3" | ToolsetCustom | null

  /**
   * `nsis` bundle version to use for NSIS installer compilation.
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=nsis&expanded=true
   *
   * 0.0.0 - (nsis-3.0.4.1 + nsis-resources-3.4.1) [legacy]
   * 1.2.1 - (makensis 3.12)
   *
   * @default "1.2.1"
   */
  readonly nsis?: "0.0.0" | "1.2.1" | ToolsetCustom | null

  /**
   * `wine` bundle version to use for running Windows tools on non-Windows platforms.
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=wine&expanded=true
   *
   * 0.0.0 - (wine 4.0.1 portable; mac-only support) [legacy]
   * 1.0.1 - (wine 11)
   *
   * @default "1.0.1"
   */
  readonly wine?: "0.0.0" | "1.0.1" | ToolsetCustom | null

  /**
   * `fpm` bundle version to use for building Linux packages (deb, rpm, tar, etc.).
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=fpm&expanded=true
   *
   * 1.0.0 - (FPM 1.17.0 + Ruby 3.4.3)
   *
   * @default "1.0.0"
   */
  readonly fpm?: "1.0.0" | ToolsetCustom | null

  /**
   * `linux-tools-mac` bundle supplying Linux binaries (ar, lzip, gtar) for
   * cross-building Linux packages on macOS.
   * Located at https://github.com/electron-userland/electron-builder-binaries/releases?q=linux-tools-mac&expanded=true
   *
   * 1.0.0 - (GNU binutils / gtar / lzip for darwin-x86_64 and darwin-arm64)
   *
   * @default "1.0.0"
   */
  readonly linuxToolsMac?: "1.0.0" | ToolsetCustom | null
}

export interface ToolsetCustom {
  /**
   * URL pointing to the custom toolset bundle. Two schemes are accepted:
   *
   * - **`https://`**: complete URL to the archive file (e.g. `https://example.com/releases/my-tool-1.0.tar.gz`).
   *   The archive is downloaded, its SHA-256 is validated against `checksum`, and it is extracted to the local cache.
   * - **`file://`**: absolute path to a local archive file (e.g. `file:///opt/toolsets/my-tool.tar.gz`).
   *   The archive's SHA-256 is validated against `checksum` before extraction.
   *
   * The toolset file structure must match the expected layout of the corresponding built-in toolset
   * (e.g. `win-codesign`, `nsis`, `fpm`). Inspect the official bundle from
   * `electron-userland/electron-builder-binaries` to replicate the structure.
   *
   * Toolset build scripts: https://github.com/electron-userland/electron-builder-binaries/tree/master/packages
   *
   * Supported archive formats: `.tar.gz`, `.tgz`, `.tar.xz`, `.txz`, `.zip`, `.7z`
   */
  url: string
  /**
   * SHA-256 hex checksum of the toolset bundle. Validated against the downloaded or local archive
   * before extraction.
   */
  checksum: string
  /**
   * Optional version string for the custom toolset. Used as the first segment of the extraction
   * cache-directory name (e.g. `1.0.0-<urlHash>`). When omitted, the first 8 characters of
   * `checksum` are used instead.
   */
  version?: string
}
