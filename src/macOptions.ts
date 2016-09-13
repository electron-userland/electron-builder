import { PlatformSpecificBuildOptions } from "./metadata"

/*
 ### `.build.mac`

 MacOS specific build options.
 */
export interface MacOptions extends PlatformSpecificBuildOptions {
  /*
   The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.

   For example, `"category": "public.app-category.developer-tools"` will set the application category to *Developer Tools*.

   Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).
   */
  readonly category?: string | null

  /*
   Target package type: list of `default`, `dmg`, `mas`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`. Defaults to `default` (dmg and zip for Squirrel.Mac).
  */
  readonly target?: Array<string> | null

  /*
   The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](https://github.com/electron-userland/electron-builder/wiki/Code-Signing).
   MAS installer identity is specified in the [.build.mas](#MasBuildOptions-identity).
   */
  readonly identity?: string | null

  /*
   The path to application icon. Defaults to `build/icon.icns` (consider using this convention instead of complicating your configuration).
   */
  readonly icon?: string | null

  /*
   The path to entitlements file for signing the app. `build/entitlements.mac.plist` will be used if exists (it is a recommended way to set).
   MAS entitlements is specified in the [.build.mas](#MasBuildOptions-entitlements).
   */
  readonly entitlements?: string | null

  /*
   The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mac.inherit.plist` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).

   This option only applies when signing with `entitlements` provided.
   */
  readonly entitlementsInherit?: string | null

  /*
  The `CFBundleVersion`. Do not use it unless [you need to](see (https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643)).
   */
  readonly bundleVersion?: string | null

  /*
  The bundle identifier to use in the application helper's plist. Defaults to `${appBundleIdentifier}.helper`.
   */
  readonly helperBundleId?: string | null
}

/*
 ### `.build.dmg`

 MacOS DMG specific options.

 See all [appdmg options](https://www.npmjs.com/package/appdmg#json-specification).
 */
export interface DmgOptions {
  /*
   The path to DMG icon, which will be shown when mounted. Defaults to `build/icon.icns`.
   */
  readonly icon?: string | null

  /*
   The path to background (default: `build/background.png` if exists). The resolution of this file determines the resolution of the installer window.
   If background is not specified, use `window.size`, see [specification](https://github.com/LinusU/node-appdmg#json-specification).
   */
  readonly background?: string | null
}

/*
 ### `.build.mas`

 MAS (Mac Application Store) specific options (in addition to `build.mac`).
 */
export interface MasBuildOptions extends MacOptions {
  /*
   The path to entitlements file for signing the app. `build/entitlements.mas.plist` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist).
   */
  readonly entitlements?: string | null

  /*
   The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mas.inherit.plist` will be used if exists (it is a recommended way to set).
   Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist).
   */
  readonly entitlementsInherit?: string | null
}