import { PlatformSpecificBuildOptions, TargetConfiguration, TargetSpecificOptions } from "../index"

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
   * The target package type: list of `default`, `dmg`, `mas`, `mas-dev`, `pkg`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `default` (dmg and zip for Squirrel.Mac).
  */
  readonly target?: Array<MacOsTargetName | TargetConfiguration> | MacOsTargetName | TargetConfiguration | null

  /**
   * The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](/code-signing.md) instead of specifying this option.
   * MAS installer identity is specified in the [mas](mas.md).
   */
  readonly identity?: string | null

  /**
   * The path to application icon.
   * @default build/icon.icns
   */
  readonly icon?: string | null

  /**
   * The path to entitlements file for signing the app. `build/entitlements.mac.plist` will be used if exists (it is a recommended way to set).
   * MAS entitlements is specified in the [mas](mas.md).
   */
  readonly entitlements?: string | null

  /**
   * The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mac.inherit.plist` will be used if exists (it is a recommended way to set).
   * Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).
   *
   * This option only applies when signing with `entitlements` provided.
   */
  readonly entitlementsInherit?: string | null

  /**
   * The path to the provisioning profile to use when signing, absolute or relative to the app root.
   */
  readonly provisioningProfile?: string | null

  /**
   * The `CFBundleVersion`. Do not use it unless [you need to](https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643).
   */
  readonly bundleVersion?: string | null

  /**
   * The `CFBundleShortVersionString`. Do not use it unless you need to.
   */
  readonly bundleShortVersion?: string | null

  /**
   * The bundle identifier to use in the application helper's plist.
   * @default ${appBundleIdentifier}.helper
   */
  readonly helperBundleId?: string | null

  /**
   * Whether to sign app for development or for distribution.
   * @default distribution
   */
  readonly type?: "distribution" | "development" | null

  /**
   * The extra entries for `Info.plist`.
   */
  readonly extendInfo?: any

  /**
   * Paths of any extra binaries that need to be signed.
   */
  readonly binaries?: Array<string> | null

  /**
   * The minimum version of macOS required for the app to run. Corresponds to `LSMinimumSystemVersion`.
   */
  readonly minimumSystemVersion?: string | null

  /**
   * Path of [requirements file](https://developer.apple.com/library/mac/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html) used in signing. Not applicable for MAS.
   */
  readonly requirements?: string | null

  /**
   * The electron-updater compatibility semver range. e.g. `>= 2.16`, `>=1.0.0`. Defaults to `>=1.0.0`
   *
   * 1.0.0 latest-mac.json
   * 2.15.0 path
   * 2.16.0 files
   */
  readonly electronUpdaterCompatibility?: string | null

  /**
   * The electron locales. By default Electron locales used as is.
   */
  readonly electronLanguages?: Array<string> | string

  /** @private */
  readonly cscInstallerLink?: string | null
  /** @private */
  readonly cscInstallerKeyPassword?: string | null
}

/**
 * macOS product archive options.
 */
export interface PkgOptions extends TargetSpecificOptions {
  /**
   * The scripts directory, relative to `build` (build resources directory).
   * The scripts can be in any language so long as the files are marked executable and have the appropriate shebang indicating the path to the interpreter.
   * Scripts are required to be executable (`chmod +x file`).
   * @default build/pkg-scripts
   * @see [Scripting in installer packages](http://macinstallers.blogspot.de/2012/07/scripting-in-installer-packages.html).
   */
  readonly scripts?: string | null

  /**
   * should be not documented, only to experiment
   * @private
   */
  readonly productbuild?: Array<string> | null

  /**
   * The install location. [Do not use it](https://stackoverflow.com/questions/12863944/how-do-you-specify-a-default-install-location-to-home-with-pkgbuild) to create per-user package.
   * Mostly never you will need to change this option. `/Applications` would install it as expected into `/Applications` if the local system domain is chosen, or into `$HOME/Applications` if the home installation is chosen.
   * @default /Applications
   */
  readonly installLocation?: string | null

  /**
   * Whether can be installed at the root of any volume, including non-system volumes. Otherwise, it cannot be installed at the root of a volume.
   *
   * Corresponds to [enable_anywhere](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
   * @default true
   */
  readonly allowAnywhere?: boolean | null

  /**
   * Whether can be installed into the current user’s home directory.
   * A home directory installation is done as the current user (not as root), and it cannot write outside of the home directory.
   * If the product cannot be installed in the user’s home directory and be not completely functional from user’s home directory.
   *
   * Corresponds to [enable_currentUserHome](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
   * @default true
   */
  readonly allowCurrentUserHome?: boolean | null

  /**
   * Whether can be installed into the root directory. Should usually be `true` unless the product can be installed only to the user’s home directory.
   *
   * Corresponds to [enable_localSystem](https://developer.apple.com/library/content/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html#//apple_ref/doc/uid/TP40005370-CH100-SW70).
   * @default true
   */
  readonly allowRootDirectory?: boolean | null

  /**
   * The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](../code-signing.md) instead of specifying this option.
   */
  readonly identity?: string | null

  /**
   * The path to EULA license file. Defaults to `license.txt` or `eula.txt` (or uppercase variants). In addition to `txt, `rtf` and `html` supported (don't forget to use `target="_blank"` for links).
   */
  readonly license?: string | null
}

export interface DmgOptions extends TargetSpecificOptions {
  /**
   * The path to background image (default: `build/background.tiff` or `build/background.png` if exists). The resolution of this file determines the resolution of the installer window.
   * If background is not specified, use `window.size`. Default locations expected background size to be 540x380.
   * @see [DMG with Retina background support](http://stackoverflow.com/a/11204769/1910191).
   */
  background?: string | null

  /**
   * The background color (accepts css colors). Defaults to `#ffffff` (white) if no background image.
   */
  backgroundColor?: string | null

  /**
   * The path to DMG icon (volume icon), which will be shown when mounted, relative to the [build resources](/configuration/configuration.md#MetadataDirectories-buildResources) or to the project directory.
   * Defaults to the application icon (`build/icon.icns`).
   */
  readonly icon?: string | null

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
   * The content — to customize icon locations.
   */
  contents?: Array<DmgContent>

  /**
   * The disk image format. `ULFO` (lzfse-compressed image (OS X 10.11+ only)).
   * @default UDZO
   */
  readonly format?: "UDRW" | "UDRO" | "UDCO" | "UDZO" | "UDBZ" | "ULFO"

  /**
   * The DMG windows position and size.
   */
  window?: DmgWindow

  /**
   * Whether to create internet-enabled disk image (when it is downloaded using a browser it will automatically decompress the image, put the application on the desktop, unmount and remove the disk image file).
   * @default false
   */
  readonly internetEnabled?: boolean
}

export interface DmgWindow {
  /**
   * The X position relative to left of the screen.
   * @default 400
   */
  x?: number

  /**
   * The Y position relative to top of the screen.
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
  x: number
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

export interface MasConfiguration extends MacConfiguration {
  /**
   * The path to entitlements file for signing the app. `build/entitlements.mas.plist` will be used if exists (it is a recommended way to set).
   * Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist).
   */
  readonly entitlements?: string | null

  /**
   * The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mas.inherit.plist` will be used if exists (it is a recommended way to set).
   * Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist).
   */
  readonly entitlementsInherit?: string | null

  /**
   * Paths of any extra binaries that need to be signed.
   */
  readonly binaries?: Array<string> | null
}
