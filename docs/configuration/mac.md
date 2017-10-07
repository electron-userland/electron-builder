The top-level [mac](configuration.md#Configuration-mac) key contains set of options instructing electron-builder on how it should build macOS targets. These options applicable for any macOS target.

<!-- do not edit. start of generated block -->
* <code id="MacConfiguration-category">category</code> String - The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.
  
  For example, `"category": "public.app-category.developer-tools"` will set the application category to *Developer Tools*.
  
  Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).
* <code id="MacConfiguration-target">target</code> String | [TargetConfiguration](/configuration/target.md#targetconfiguration) - The target package type: list of `default`, `dmg`, `mas`, `mas-dev`, `pkg`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `default` (dmg and zip for Squirrel.Mac).
* <code id="MacConfiguration-identity">identity</code> String - The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](/code-signing.md) instead of specifying this option. MAS installer identity is specified in the [mas](mas.md).
* <code id="MacConfiguration-icon">icon</code> = `build/icon.icns` String - The path to application icon.
* <code id="MacConfiguration-entitlements">entitlements</code> String - The path to entitlements file for signing the app. `build/entitlements.mac.plist` will be used if exists (it is a recommended way to set). MAS entitlements is specified in the [mas](mas.md).
* <code id="MacConfiguration-entitlementsInherit">entitlementsInherit</code> String - The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mac.inherit.plist` will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.darwin.inherit.plist).
  
  This option only applies when signing with `entitlements` provided.
* <code id="MacConfiguration-bundleVersion">bundleVersion</code> String - The `CFBundleVersion`. Do not use it unless [you need to](https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643).
* <code id="MacConfiguration-bundleShortVersion">bundleShortVersion</code> String - The `CFBundleShortVersionString`. Do not use it unless you need to.
* <code id="MacConfiguration-helperBundleId">helperBundleId</code> = `${appBundleIdentifier}.helper` String - The bundle identifier to use in the application helper's plist.
* <code id="MacConfiguration-type">type</code> = `distribution` "distribution" | "development" - Whether to sign app for development or for distribution.
* <code id="MacConfiguration-extendInfo">extendInfo</code> any - The extra entries for `Info.plist`.
* <code id="MacConfiguration-binaries">binaries</code> Array&lt;String&gt; - Paths of any extra binaries that need to be signed.
* <code id="MacConfiguration-requirements">requirements</code> String - Path of [requirements file](https://developer.apple.com/library/mac/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html) used in signing. Not applicable for MAS.
<!-- end of generated block -->