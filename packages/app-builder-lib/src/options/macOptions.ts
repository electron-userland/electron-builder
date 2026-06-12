import { TargetConfiguration, TargetSpecificOptions } from "../core.js"
import { PlatformSpecificBuildOptions } from "./PlatformSpecificBuildOptions.js"
import { CustomMacSign } from "../macPackager.js"
import type { OnlySignOptions } from "@electron/osx-sign"
import type { MakeUniversalOpts } from "@electron/universal"

/**
 * Options forwarded to `@electron/universal`'s `makeUniversalApp`.
 * Electron-builder fills in the app paths and `force`; everything else is configurable here
 * and auto-tracks upstream additions to `MakeUniversalOpts`.
 *
 * @see https://github.com/electron/universal
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ElectronUniversalOptions extends Omit<MakeUniversalOpts, "x64AppPath" | "arm64AppPath" | "outAppPath" | "force"> {}

/**
 * Signing options passed to `@electron/osx-sign`. Electron-builder owns the fields it must control
 * itself — `app`, `keychain`, `platform`, `version`, `optionsForFile`, and `type` (derived from the
 * build flavor: `mas-dev` → `development`, otherwise `distribution`) — and forwards everything else.
 *
 * Additionally exposes a small set of per-file convenience fields that electron-builder maps
 * internally through `optionsForFile`.
 *
 * @see https://packages.electronjs.org/osx-sign
 */
export interface ElectronSignOptions extends Omit<OnlySignOptions, "optionsForFile" | "version" | "type"> {
  /**
   * The signing identity (certificate name or SHA-1 hash). Applies to both app signing and DMG signing.
   * Prefer the environment variables `CSC_LINK` / `CSC_NAME` over hardcoding this value.
   *
   * - **Not set** (default): electron-builder searches the keychain for a valid certificate.
   * - **`null`**: skip signing entirely.
   * - **`"-"`**: ad-hoc signing (requires disabling library validation — see `hardenedRuntime`).
   */
  readonly identity?: string | null
  /**
   * Path to the main app entitlements file.
   * Falls back to `build/entitlements.mac.plist` if it exists, then to `@electron/osx-sign`'s
   * built-in defaults.
   */
  readonly entitlements?: string | null
  /**
   * Path to child entitlements inherited by embedded frameworks and bundles.
   * Falls back to `build/entitlements.mac.inherit.plist` if it exists.
   */
  readonly entitlementsInherit?: string | null
  /**
   * Path to entitlements for the Login Helper.
   * Required when using App Sandbox, because the Login Helper cannot inherit entitlements.
   * Defaults to the value of `entitlements`.
   */
  readonly entitlementsLoginHelper?: string | null
  /**
   * Whether to enable [Hardened Runtime](https://developer.apple.com/documentation/security/hardened_runtime).
   *
   * Hardened Runtime is a prerequisite for notarization (mandatory on macOS 10.15+).
   * Defaults to `true` for `darwin` builds and `false` for `mas-dev`.
   *
   * @see https://github.com/electron/fuses
   */
  readonly hardenedRuntime?: boolean
  /**
   * Path to a [requirements file](https://developer.apple.com/library/mac/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html).
   * Not applicable for MAS.
   */
  readonly requirements?: string | null
  /**
   * URL of the timestamp authority server. Passed per-file to `codesign --timestamp=<url>`.
   */
  readonly timestamp?: string | null
  /**
   * Extra arguments passed to each `codesign` invocation.
   * @example ["--deep"]
   */
  readonly additionalArguments?: Array<string> | null
}

export type MacOsTargetName = "default" | "dmg" | "mas" | "mas-dev" | "pkg" | "7z" | "zip" | "tar.xz" | "tar.lz" | "tar.gz" | "tar.bz2" | "dir"

export interface MacConfiguration extends PlatformSpecificBuildOptions {
  /**
   * The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.
   *
   * For example, `"category": "public.app-category.developer-tools"` will set the application category to *Developer Tools*.
   *
   * Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).
   */
  readonly category?: string | null

  /**
   * The target package type: list of `default`, `dmg`, `mas`, `mas-dev`, `pkg`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`.
   * Note: Squirrel.Mac auto update mechanism requires both `dmg` and `zip` to be enabled, even when only `dmg` is used. Disabling `zip` will break auto update in `dmg` packages.
   * @default default (dmg and zip for Squirrel.Mac)
   */
  readonly target?: Array<MacOsTargetName | TargetConfiguration> | MacOsTargetName | TargetConfiguration | null

  /**
   * The path to application icon.
   * Accepts `.icns` (legacy) or `.icon` (Icon Composer asset).
   * If a `.icon` asset is provided, it will be preferred and compiled to an asset catalog.
   * @default build/icon.icns
   */
  readonly icon?: string | null

  /**
   * The `CFBundleVersion`. Do not use it unless [you need to](https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643).
   */
  readonly bundleVersion?: string | null

  /**
   * The `CFBundleShortVersionString`. Do not use it unless you need to.
   */
  readonly bundleShortVersion?: string | null

  /**
   * Whether a dark mode is supported. If your app does have a dark mode, you can make your app follow the system-wide dark mode setting.
   * @default false
   */
  readonly darkModeSupport?: boolean

  /**
   * The bundle identifier to use in the application helper's plist.
   * @default ${appBundleIdentifier}.helper
   */
  readonly helperBundleId?: string | null

  /**
   * The bundle identifier to use in the Renderer helper's plist.
   * @default ${appBundleIdentifier}.helper.Renderer
   */
  readonly helperRendererBundleId?: string | null

  /**
   * The bundle identifier to use in the Plugin helper's plist.
   * @default ${appBundleIdentifier}.helper.Plugin
   */
  readonly helperPluginBundleId?: string | null

  /**
   * The bundle identifier to use in the GPU helper's plist.
   * @default ${appBundleIdentifier}.helper.GPU
   */
  readonly helperGPUBundleId?: string | null

  /**
   * The bundle identifier to use in the EH helper's plist.
   * @default ${appBundleIdentifier}.helper.EH
   */
  readonly helperEHBundleId?: string | null

  /**
   * The bundle identifier to use in the NP helper's plist.
   * @default ${appBundleIdentifier}.helper.NP
   */
  readonly helperNPBundleId?: string | null

  /**
   * The extra entries for `Info.plist`.
   */
  readonly extendInfo?: any

  /**
   * The minimum version of macOS required for the app to run. Corresponds to `LSMinimumSystemVersion`.
   */
  readonly minimumSystemVersion?: string | null

  /** @private */
  readonly cscInstallerLink?: string | null
  /** @private */
  readonly cscInstallerKeyPassword?: string | null

  /**
   * Extra files to put in archive. Not applicable for `tar.*`.
   */
  readonly extraDistFiles?: Array<string> | string | null

  /**
   * Codesigning configuration. The signing certificate is selected via `sign.identity` (or the
   * `CSC_LINK` / `CSC_NAME` environment variables).
   *
   * - **Not set** (default): electron-builder auto-discovers a valid certificate in the keychain. If none is found, signing is skipped.
   * - **`null`**: skip signing entirely.
   * - **`string`**: path or module ID of a file that exports a {@link CustomMacSign} function.
   * - **{@link CustomMacSign}**: inline custom signing function (JS/TS config only).
   * - **{@link ElectronSignOptions}**: options forwarded directly to `@electron/osx-sign`.
   *
   * @see {@link ElectronSignOptions}
   * @see https://www.electron.build/code-signing
   */
  readonly sign?: CustomMacSign | ElectronSignOptions | string | null

  /**
   * Options forwarded to `@electron/universal` when building a universal (multi-arch) app.
   * Has no effect unless the target arch is `universal`.
   *
   * @see {@link ElectronUniversalOptions}
   * @see https://github.com/electron/universal
   */
  readonly universal?: ElectronUniversalOptions | null

  /**
   * Whether to disable electron-builder's [@electron/notarize](https://github.com/electron/notarize) integration.
   *
   * Note: In order to activate the notarization step You MUST specify one of the following via environment variables:
   *
   * 1. `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`.
   * 2. `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`
   * 3. `APPLE_KEYCHAIN` and `APPLE_KEYCHAIN_PROFILE`
   *
   * For security reasons it is recommended to use the first option (see https://github.com/electron-userland/electron-builder/issues/7859)
   */
  readonly notarize?: boolean
}

export interface DmgOptions extends TargetSpecificOptions {
  /**
   * The path to background image (default: `build/background.tiff` or `build/background.png` if exists). The resolution of this file determines the resolution of the installer window.
   * If background is not specified, use `window.size`. Default locations expected background size to be 540x380.
   * @see [DMG with Retina background support](http://stackoverflow.com/a/11204769/1910191).
   */
  background?: string | null

  /**
   * The background color (accepts css colors). Used when no background image is set.
   * @default #ffffff
   */
  backgroundColor?: string | null

  /**
   * The path to DMG icon (badge icon), which will be shown when mounted, relative to the [build resources](https://www.electron.build/contents#extraresources) or to the project directory.
   */
  badgeIcon?: string | null

  /**
   * The path to DMG icon (volume icon), which will be shown when mounted, relative to the [build resources](https://www.electron.build/contents#extraresources) or to the project directory.
   * Defaults to the application icon (`build/icon.icns`).
   */
  icon?: string | null

  /**
   * The size of all the icons inside the DMG.
   * @default 80
   */
  readonly iconSize?: number | null

  /**
   * The size of all the icon texts inside the DMG.
   * @default 12
   */
  readonly iconTextSize?: number | null

  /**
   * The title of the produced DMG, which will be shown when mounted (volume name).
   *
   * Macro `${productName}`, `${version}` and `${name}` are supported.
   * @default ${productName} ${version}
   */
  readonly title?: string | null

  /**
   * The content — to customize icon locations. The x and y coordinates refer to the position of the **center** of the icon (at 1x scale), and do not take the label into account.
   */
  contents?: Array<DmgContent>

  /**
   * The disk image format. `ULFO` (lzfse-compressed image (OS X 10.11+ only)).
   * @default UDZO
   */
  format?: "UDRW" | "UDRO" | "UDCO" | "UDZO" | "UDBZ" | "ULFO"

  /**
   * The filesystem for the DMG volume (e.g. `"APFS"` or `"HFS+"`)
   * This will be changed to APFS in the next major release, so it is recommended to set it explicitly to HFS+ if you want to keep using HFS+ (e.g. for better compatibility with older macOS versions).
   * @default HFS+
   */
  readonly filesystem?: "HFS+" | "APFS" | null

  /**
   * The initial size of the DMG filesystem. Accepts the same syntax as the `-size` argument to `hdiutil`, e.g. `"150m"`, `"4g"`.
   * If not specified, the size is calculated automatically.
   * Set this explicitly for large apps or apps with sparse files to avoid "No space left on device" errors.
   */
  readonly size?: string | null

  /**
   * Whether to shrink the DMG filesystem to the minimum size after copying files.
   * Set to `false` to preserve the explicit `size` you specified.
   * @default true
   */
  readonly shrink?: boolean

  /**
   * The DMG window position and size. With y co-ordinates running from bottom to top.
   *
   * The Finder makes sure that the window will be on the user’s display, so if you want your window at the top left of the display you could use `"x": 0, "y": 100000` as the x, y co-ordinates.
   * It is not to be possible to position the window relative to the [top left](https://github.com/electron-userland/electron-builder/issues/3990#issuecomment-512960957) or relative to the center of the user’s screen.
   */
  window?: DmgWindow

  /**
   * Whether to create internet-enabled disk image (when it is downloaded using a browser it will automatically decompress the image, put the application on the desktop, unmount and remove the disk image file).
   * @default false
   */
  readonly internetEnabled?: boolean

  /**
   * Whether to sign the DMG or not. Signing is not required and will lead to unwanted errors in combination with notarization requirements.
   * @default false
   */
  readonly sign?: boolean

  /**
   * License agreement to display when the DMG is mounted.
   *
   * Accepts a single file path (`.rtf`, `.txt`, or `.html`) used as the English/default license,
   * or a language-code → file-path map for multi-language builds.
   *
   * When set, this takes precedence over the file-naming convention
   * (`license_en.txt`, etc. in the build resources directory).
   * Paths are resolved relative to the build resources directory or project root.
   *
   * @example Single language
   * ```yaml
   * dmg:
   *   license: "build/license.rtf"
   * ```
   *
   * @example Multi-language
   * ```yaml
   * dmg:
   *   license:
   *     en_US: "build/license.rtf"
   *     de_DE: "build/license_de.txt"
   *     ja_JP: "build/license_ja.txt"
   * ```
   *
   * If not set, electron-builder scans the build resources directory for
   * `license_LANG.{rtf,txt,html}` files automatically.
   */
  license?: string | Record<string, string> | null

  /**
   * @private
   * @default true
   */
  writeUpdateInfo?: boolean
}

export interface DmgWindow {
  /**
   * The X position relative to left of the screen.
   * @default 400
   */
  x?: number

  /**
   * The Y position relative to bottom of the screen.
   * @default 100
   */
  y?: number

  /**
   * The width. Defaults to background image width or 540.
   */
  width?: number

  /**
   * The height. Defaults to background image height or 380.
   */
  height?: number
}

export interface DmgContent {
  /**
   * The device-independent pixel offset from the left of the window to the **center** of the icon.
   */
  x: number
  /**
   * The device-independent pixel offset from the top of the window to the **center** of the icon.
   */
  y: number
  type?: "link" | "file" | "dir"

  /**
   * The name of the file within the DMG. Defaults to basename of `path`.
   */
  name?: string

  /**
   * The path of the file within the DMG.
   */
  path?: string
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MasConfiguration extends MacConfiguration {}
