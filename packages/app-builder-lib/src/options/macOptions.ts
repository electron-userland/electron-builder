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
   * The target package type: list of `default`, `dmg`, `mas`, `mas-dev`, `pkg`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `default` (`dmg` and `zip` for Squirrel.Mac). Note: Squirrel.Mac auto update mechanism requires both `dmg` and `zip` to be enabled, even when only `dmg` is used. Disabling `zip` will break auto update in `dmg` packages.
   */
  readonly target?: Array<MacOsTargetName | TargetConfiguration> | MacOsTargetName | TargetConfiguration | null

  /**
   * The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](/code-signing) instead of specifying this option.
   * MAS installer identity is specified in the [mas](/configuration/mas).
   */
  readonly identity?: string | null

  /**
   * The path to application icon.
   * @default build/icon.icns
   */
  readonly icon?: string | null

  /**
   * The path to entitlements file for signing the app. `build/entitlements.mac.plist` will be used if exists (it is a recommended way to set).
   * MAS entitlements is specified in the [mas](/configuration/mas).
   * See [this folder in osx-sign's repository](https://github.com/electron/osx-sign/tree/main/entitlements) for examples.
   * Be aware that your app may crash if the right entitlements are not set like `com.apple.security.cs.allow-jit` for example on arm64 builds with Electron 20+.
   * See [Signing and Notarizing macOS Builds from the Electron documentation](https://www.electronjs.org/docs/latest/tutorial/code-signing#signing--notarizing-macos-builds) for more information.
   */
  readonly entitlements?: string | null

  /**
   * The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mac.inherit.plist` will be used if exists (it is a recommended way to set).
   * See [this folder in osx-sign's repository](https://github.com/electron/osx-sign/tree/main/entitlements) for examples.
   *
   * This option only applies when signing with `entitlements` provided.
   */
  readonly entitlementsInherit?: string | null

  /**
   * Path to login helper entitlement file.
   * When using App Sandbox, the the `com.apple.security.inherit` key that is normally in the inherited entitlements cannot be inherited since the login helper is a standalone executable.
   * Defaults to the value provided for `entitlements`. This option only applies when signing with `entitlements` provided.
   */
  readonly entitlementsLoginHelper?: string | null

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

  /** @private */
  readonly cscInstallerLink?: string | null
  /** @private */
  readonly cscInstallerKeyPassword?: string | null

  /**
   * Extra files to put in archive. Not applicable for `tar.*`.
   */
  readonly extraDistFiles?: Array<string> | string | null

  /**
   * Whether your app has to be signed with hardened runtime.
   * @default true
   */
  readonly hardenedRuntime?: boolean

  /**
   * Whether to let @electron/osx-sign validate the signing or not.
   * @default false
   */
  readonly gatekeeperAssess?: boolean

  /**
   * Whether to let @electron/osx-sign verify the contents or not.
   * @default true
   */
  readonly strictVerify?: boolean

  /**
   * Whether to enable entitlements automation from @electron/osx-sign.
   * @default true
   */
  readonly preAutoEntitlements?: boolean

  /**
   * Regex or an array of regex's that signal skipping signing a file.
   */
  readonly signIgnore?: Array<string> | string | null

  /**
   * Specify the URL of the timestamp authority server
   */
  readonly timestamp?: string | null

  /**
   * Whether to merge ASAR files for different architectures or not.
   *
   * This option has no effect unless building for "universal" arch.
   * @default true
   */
  readonly mergeASARs?: boolean

  /**
   * Minimatch pattern of paths that are allowed to be present in one of the
   * ASAR files, but not in the other.
   *
   * This option has no effect unless building for "universal" arch and applies
   * only if `mergeASARs` is `true`.
   */
  readonly singleArchFiles?: string | null

  /**
   * Minimatch pattern of paths that are allowed to be x64 binaries in both
   * ASAR files
   *
   * This option has no effect unless building for "universal" arch and applies
   * only if `mergeASARs` is `true`.
   */
  readonly x64ArchFiles?: string | null

  /**
   * Options to use for @electron/notarize (ref: https://github.com/electron/notarize).
   * Supports both `legacy` and `notarytool` notarization tools. Use `false` to explicitly disable
   *
   * Note: You MUST specify `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` via environment variables to activate notarization step
   */
  readonly notarize?: NotarizeOptions | boolean | null
}

export interface NotarizeOptions {
  /**
   * The app bundle identifier your Electron app is using. E.g. com.github.electron. Useful if notarization ID differs from app ID (unlikely).
   * Only used by `legacy` notarization tool
   */
  readonly appBundleId?: string | null

  /**
   * Your Team Short Name. Only used by `legacy` notarization tool
   */
  readonly ascProvider?: string | null

  /**
   * The team ID you want to notarize under. Only needed if using `notarytool`
   */
  readonly teamId?: string | null
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
   * The path to DMG icon (volume icon), which will be shown when mounted, relative to the [build resources](/configuration/configuration#MetadataDirectories-buildResources) or to the project directory.
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

export interface MasConfiguration extends MacConfiguration {
  /**
   * The path to entitlements file for signing the app. `build/entitlements.mas.plist` will be used if exists (it is a recommended way to set).
   * See [this folder in osx-sign's repository](https://github.com/electron/osx-sign/tree/main/entitlements) for examples.
   * Be aware that your app may crash if the right entitlements are not set like `com.apple.security.cs.allow-jit` for example on arm64 builds with Electron 20+.
   * See [Signing and Notarizing macOS Builds from the Electron documentation](https://www.electronjs.org/docs/latest/tutorial/code-signing#signing--notarizing-macos-builds) for more information.
   */
  readonly entitlements?: string | null

  /**
   * The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mas.inherit.plist` will be used if exists (it is a recommended way to set).
   * See [this folder in osx-sign's repository](https://github.com/electron/osx-sign/tree/main/entitlements) for examples.
   */
  readonly entitlementsInherit?: string | null

  /**
   * Paths of any extra binaries that need to be signed.
   */
  readonly binaries?: Array<string> | null
}
