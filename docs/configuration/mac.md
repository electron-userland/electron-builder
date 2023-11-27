The top-level [mac](configuration.md#Configuration-mac) key contains set of options instructing electron-builder on how it should build macOS targets. These options applicable for any macOS target.

<!-- do not edit. start of generated block -->
## MacConfiguration
undefined

* <code id="MacConfiguration-category">category</code> String | "undefined" - The application category type, as shown in the Finder via *View -> Arrange by Application Category* when viewing the Applications directory.
    
    For example, `"category": "public.app-category.developer-tools"` will set the application category to *Developer Tools*.
    
    Valid values are listed in [Apple's documentation](https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8).

* <code id="MacConfiguration-target">target</code> String | [TargetConfiguration](/cli#targetconfiguration) - The target package type: list of `default`, `dmg`, `mas`, `mas-dev`, `pkg`, `7z`, `zip`, `tar.xz`, `tar.lz`, `tar.gz`, `tar.bz2`, `dir`. Defaults to `default` (`dmg` and `zip` for Squirrel.Mac). Note: Squirrel.Mac auto update mechanism requires both `dmg` and `zip` to be enabled, even when only `dmg` is used. Disabling `zip` will break auto update in `dmg` packages.
* <code id="MacConfiguration-identity">identity</code> String | "undefined" - The name of certificate to use when signing. Consider using environment variables [CSC_LINK or CSC_NAME](/code-signing) instead of specifying this option. MAS installer identity is specified in the [mas](/configuration/mas).
* <code id="MacConfiguration-icon">icon</code> = `build/icon.icns` String | "undefined" - The path to application icon.
* <code id="MacConfiguration-entitlements">entitlements</code> String | "undefined" - The path to entitlements file for signing the app. `build/entitlements.mac.plist` will be used if exists (it is a recommended way to set). MAS entitlements is specified in the [mas](/configuration/mas). See [this folder in osx-sign's repository](https://github.com/electron/osx-sign/tree/main/entitlements) for examples. Be aware that your app may crash if the right entitlements are not set like `com.apple.security.cs.allow-jit` for example on arm64 builds with Electron 20+. See [Signing and Notarizing macOS Builds from the Electron documentation](https://www.electronjs.org/docs/latest/tutorial/code-signing#signing--notarizing-macos-builds) for more information.
* <code id="MacConfiguration-entitlementsInherit">entitlementsInherit</code> String | "undefined" - The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mac.inherit.plist` will be used if exists (it is a recommended way to set). See [this folder in osx-sign's repository](https://github.com/electron/osx-sign/tree/main/entitlements) for examples.
    
    This option only applies when signing with `entitlements` provided.

* <code id="MacConfiguration-entitlementsLoginHelper">entitlementsLoginHelper</code> String | "undefined" - Path to login helper entitlement file. When using App Sandbox, the the `com.apple.security.inherit` key that is normally in the inherited entitlements cannot be inherited since the login helper is a standalone executable. Defaults to the value provided for `entitlements`. This option only applies when signing with `entitlements` provided.
* <code id="MacConfiguration-provisioningProfile">provisioningProfile</code> String | "undefined" - The path to the provisioning profile to use when signing, absolute or relative to the app root.
* <code id="MacConfiguration-bundleVersion">bundleVersion</code> String | "undefined" - The `CFBundleVersion`. Do not use it unless [you need to](https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643).
* <code id="MacConfiguration-bundleShortVersion">bundleShortVersion</code> String | "undefined" - The `CFBundleShortVersionString`. Do not use it unless you need to.
* <code id="MacConfiguration-darkModeSupport">darkModeSupport</code> = `false` Boolean - Whether a dark mode is supported. If your app does have a dark mode, you can make your app follow the system-wide dark mode setting.
* <code id="MacConfiguration-helperBundleId">helperBundleId</code> = `${appBundleIdentifier}.helper` String | "undefined" - The bundle identifier to use in the application helper's plist.
* <code id="MacConfiguration-helperRendererBundleId">helperRendererBundleId</code> = `${appBundleIdentifier}.helper.Renderer` String | "undefined" - The bundle identifier to use in the Renderer helper's plist.
* <code id="MacConfiguration-helperPluginBundleId">helperPluginBundleId</code> = `${appBundleIdentifier}.helper.Plugin` String | "undefined" - The bundle identifier to use in the Plugin helper's plist.
* <code id="MacConfiguration-helperGPUBundleId">helperGPUBundleId</code> = `${appBundleIdentifier}.helper.GPU` String | "undefined" - The bundle identifier to use in the GPU helper's plist.
* <code id="MacConfiguration-helperEHBundleId">helperEHBundleId</code> = `${appBundleIdentifier}.helper.EH` String | "undefined" - The bundle identifier to use in the EH helper's plist.
* <code id="MacConfiguration-helperNPBundleId">helperNPBundleId</code> = `${appBundleIdentifier}.helper.NP` String | "undefined" - The bundle identifier to use in the NP helper's plist.
* <code id="MacConfiguration-type">type</code> = `distribution` "distribution" | "development" | "undefined" - Whether to sign app for development or for distribution.
* <code id="MacConfiguration-extendInfo">extendInfo</code> any - The extra entries for `Info.plist`.
* <code id="MacConfiguration-binaries">binaries</code> Array&lt;String&gt; | "undefined" - Paths of any extra binaries that need to be signed.
* <code id="MacConfiguration-minimumSystemVersion">minimumSystemVersion</code> String | "undefined" - The minimum version of macOS required for the app to run. Corresponds to `LSMinimumSystemVersion`.
* <code id="MacConfiguration-requirements">requirements</code> String | "undefined" - Path of [requirements file](https://developer.apple.com/library/mac/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html) used in signing. Not applicable for MAS.
* <code id="MacConfiguration-extraDistFiles">extraDistFiles</code> Array&lt;String&gt; | String | "undefined" - Extra files to put in archive. Not applicable for `tar.*`.
* <code id="MacConfiguration-hardenedRuntime">hardenedRuntime</code> = `true` Boolean - Whether your app has to be signed with hardened runtime.
* <code id="MacConfiguration-gatekeeperAssess">gatekeeperAssess</code> = `false` Boolean - Whether to let @electron/osx-sign validate the signing or not.
* <code id="MacConfiguration-strictVerify">strictVerify</code> = `true` Boolean - Whether to let @electron/osx-sign verify the contents or not.
* <code id="MacConfiguration-preAutoEntitlements">preAutoEntitlements</code> = `true` Boolean - Whether to enable entitlements automation from @electron/osx-sign.
* <code id="MacConfiguration-signIgnore">signIgnore</code> Array&lt;String&gt; | String | "undefined" - Regex or an array of regex's that signal skipping signing a file.
* <code id="MacConfiguration-timestamp">timestamp</code> String | "undefined" - Specify the URL of the timestamp authority server
* <code id="MacConfiguration-mergeASARs">mergeASARs</code> = `true` Boolean - Whether to merge ASAR files for different architectures or not.
    
    This option has no effect unless building for "universal" arch.

* <code id="MacConfiguration-singleArchFiles">singleArchFiles</code> String | "undefined" - Minimatch pattern of paths that are allowed to be present in one of the ASAR files, but not in the other.
    
    This option has no effect unless building for "universal" arch and applies only if `mergeASARs` is `true`.

* <code id="MacConfiguration-x64ArchFiles">x64ArchFiles</code> String | "undefined" - Minimatch pattern of paths that are allowed to be x64 binaries in both ASAR files
    
    This option has no effect unless building for "universal" arch and applies only if `mergeASARs` is `true`.

* <code id="MacConfiguration-notarize">notarize</code> [NotarizeLegacyOptions](#NotarizeLegacyOptions) | [NotarizeNotaryOptions](#NotarizeNotaryOptions) | Boolean | "undefined" - Options to use for @electron/notarize (ref: https://github.com/electron/notarize). Supports both `legacy` and `notarytool` notarization tools. Use `false` to explicitly disable
    
    Note: In order to activate the notarization step You MUST specify one of the following via environment variables: 1. `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`. 2. `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` 3. `APPLE_KEYCHAIN` and `APPLE_KEYCHAIN_PROFILE`
    
    For security reasons it is recommended to use the first option (see https://github.com/electron-userland/electron-builder/issues/7859)


## NotarizeLegacyOptions
undefined

* <code id="NotarizeLegacyOptions-appBundleId">appBundleId</code> String | "undefined" - The app bundle identifier your Electron app is using. E.g. com.github.electron. Useful if notarization ID differs from app ID (unlikely). Only used by `legacy` notarization tool
* <code id="NotarizeLegacyOptions-ascProvider">ascProvider</code> String | "undefined" - Your Team Short Name. Only used by `legacy` notarization tool

## NotarizeNotaryOptions
undefined

* **<code id="NotarizeNotaryOptions-teamId">teamId</code>** String - The team ID you want to notarize under for when using `notarytool`


<!-- end of generated block -->

---

{!includes/platform-specific-configuration-note.md!}
