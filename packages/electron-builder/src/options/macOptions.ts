import { TargetConfig, TargetSpecificOptions } from "electron-builder-core"
import { PlatformSpecificBuildOptions } from "../metadata"

export type MacOsTargetName = "default" | "dmg" | "mas" | "pkg" | "7z" | "zip" | "tar.xz" | "tar.lz" | "tar.gz" | "tar.bz2" | "dir"

/**
 ### `mac` macOS Specific Options
 */
export interface MacOptions extends PlatformSpecificBuildOptions {
  /**
   The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.

   For example, `"category": "public.app-category.developer-tools"` will set the application category to *Developer Tools*.

   Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).
   */
  readonly category?: string | null

  /**
   The target package type: list of `default`, `dmg`, `mas`, `pkg`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `default` (dmg and zip for Squirrel.Mac).
  */
  readonly target?: Array<MacOsTargetName | TargetConfig> | MacOsTargetName | TargetConfig | null

  /**
   The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing) instead of specifying this option.
   MAS installer identity is specified in the [mas](#MasBuildOptions-identity).
   */
  readonly identity?: string | null

  /**
   The path to application icon. Defaults to `build/icon.icns` (consider using this convention instead of complicating your configuration).
   */
  readonly icon?: string | null

  /**
   The path to entitlements file for signing the app. `build/entitlements.mac.plist` will be used if exists (it is a recommended way to set).
   MAS entitlements is specified in the [mas](#MasBuildOptions-entitlements).
   */
  readonly entitlements?: string | null

  /**
   The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mac.inherit.plist` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).

   This option only applies when signing with `entitlements` provided.
   */
  readonly entitlementsInherit?: string | null

  /**
  The `CFBundleVersion`. Do not use it unless [you need to](see (https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643)).
   */
  readonly bundleVersion?: string | null

  /**
  The bundle identifier to use in the application helper's plist. Defaults to `${appBundleIdentifier}.helper`.
   */
  readonly helperBundleId?: string | null

  /**
   Whether to sign app for development or for distribution. One of `development`, `distribution`. Defaults to `distribution`.
   */
  readonly type?: "distribution" | "development" | null

  /**
   The extra entries for `Info.plist`.
   */
  readonly extendInfo?: any
}

/**
 ### `pkg` macOS Product Archive Options
 */
export interface PkgOptions extends TargetSpecificOptions {
  /**
  The scripts directory, relative to `build` (build resources directory). Defaults to `build/pkg-scripts`.
  See [Scripting in installer packages](http://macinstallers.blogspot.de/2012/07/scripting-in-installer-packages.html).
  The scripts can be in any language so long as the files are marked executable and have the appropriate shebang indicating the path to the interpreter.

  Scripts are required to be executable (`chmod +x file`).
   */
  readonly scripts?: string | null

  // should be not documented, only to experiment
  readonly productbuild?: Array<string> | null

  /**
  The install location. Defaults to `/Applications`.
   */
  readonly installLocation?: string | null

  readonly identity?: string | null
}

/**
 ### `dmg` macOS DMG Options
 */
export interface DmgOptions extends TargetSpecificOptions {
  /**
   The path to background image (default: `build/background.tiff` or `build/background.png` if exists). The resolution of this file determines the resolution of the installer window.
   If background is not specified, use `window.size`. Default locations expected background size to be 540x380.

   See [DMG with Retina background support](http://stackoverflow.com/a/11204769/1910191).
   */
  readonly background?: string | null

  /**
  The background color (accepts css colors). Defaults to `#ffffff` (white) if no background image.
   */
  readonly backgroundColor?: string | null

  /**
   The path to DMG icon (volume icon), which will be shown when mounted, relative to the the [build resources](https://github.com/electron-userland/electron-builder/wiki/Options#MetadataDirectories-buildResources) or to the project directory.
   Defaults to the application icon (`build/icon.icns`).
   */
  readonly icon?: string | null

  /**
  The size of all the icons inside the DMG. Defaults to 80.
   */
  readonly iconSize?: number | null

  /**
  The size of all the icon texts inside the DMG. Defaults to 12.
   */
  readonly iconTextSize?: number | null

  /**
  The title of the produced DMG, which will be shown when mounted (volume name). Defaults to `${productName} ${version}`

  Macro `${productName}`, `${version}` and `${name}` are supported.
   */
  readonly title?: string | null

  /**
  The content — to customize icon locations.
   */
  readonly contents?: Array<DmgContent>

  /**
   The disk image format, one of `UDRW`, `UDRO`, `UDCO`, `UDZO`, `UDBZ`, `ULFO` (lzfse-compressed image (OS X 10.11+ only)). Defaults to `UDBZ` (bzip2-compressed image).
   */
  readonly format?: string

  /**
  The DMG windows position and size. See [dmg.window](#DmgWindow).
   */
  window?: DmgWindow
}

/**
 ### `dmg.window` DMG Windows Position and Size
 */
export interface DmgWindow {
  /**
  The X position relative to left of the screen. Defaults to 400.
   */
  x?: number
  /**
   The Y position relative to top of the screen. Defaults to 100.
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
  x: number
  y: number
  type?: "link" | "file"
  /**
  The name of the file within the DMG. Defaults to basename of `path`.
   */
  name?: string
  path?: string
}

/**
 ### `mas` MAS (Mac Application Store) Specific Options
 */
export interface MasBuildOptions extends MacOptions {
  /**
   The path to entitlements file for signing the app. `build/entitlements.mas.plist` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist).
   */
  readonly entitlements?: string | null

  /**
   The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mas.inherit.plist` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist).
   */
  readonly entitlementsInherit?: string | null
}