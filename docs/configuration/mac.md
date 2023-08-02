The top-level [mac](configuration.md#Configuration-mac) key contains set of options instructing electron-builder on how it should build macOS targets. These options applicable for any macOS target.

<!-- do not edit. start of generated block -->
<ul>
<li>
<p><code id="MacConfiguration-category">category</code> String | “undefined” - The application category type, as shown in the Finder via <em>View -&gt; Arrange by Application Category</em> when viewing the Applications directory.</p>
<p>For example, <code>&quot;category&quot;: &quot;public.app-category.developer-tools&quot;</code> will set the application category to <em>Developer Tools</em>.</p>
<p>Valid values are listed in <a href="https://developer.apple.com/library/ios/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html#//apple_ref/doc/uid/TP40009250-SW8">Apple’s documentation</a>.</p>
</li>
<li>
<p><code id="MacConfiguration-target">target</code> String | <a href="/cli#targetconfiguration">TargetConfiguration</a> - The target package type: list of <code>default</code>, <code>dmg</code>, <code>mas</code>, <code>mas-dev</code>, <code>pkg</code>, <code>7z</code>, <code>zip</code>, <code>tar.xz</code>, <code>tar.lz</code>, <code>tar.gz</code>, <code>tar.bz2</code>, <code>dir</code>. Defaults to <code>default</code> (<code>dmg</code> and <code>zip</code> for Squirrel.Mac). Note: Squirrel.Mac auto update mechanism requires both <code>dmg</code> and <code>zip</code> to be enabled, even when only <code>dmg</code> is used. Disabling <code>zip</code> will break auto update in <code>dmg</code> packages.</p>
</li>
<li>
<p><code id="MacConfiguration-identity">identity</code> String | “undefined” - The name of certificate to use when signing. Consider using environment variables <a href="/code-signing">CSC_LINK or CSC_NAME</a> instead of specifying this option. MAS installer identity is specified in the <a href="/configuration/mas">mas</a>.</p>
</li>
<li>
<p><code id="MacConfiguration-icon">icon</code> = <code>build/icon.icns</code> String | “undefined” - The path to application icon.</p>
</li>
<li>
<p><code id="MacConfiguration-entitlements">entitlements</code> String | “undefined” - The path to entitlements file for signing the app. <code>build/entitlements.mac.plist</code> will be used if exists (it is a recommended way to set). MAS entitlements is specified in the <a href="/configuration/mas">mas</a>. See <a href="https://github.com/electron/osx-sign/tree/main/entitlements">this folder in osx-sign’s repository</a> for examples. Be aware that your app may crash if the right entitlements are not set like <code>com.apple.security.cs.allow-jit</code> for example on arm64 builds with Electron 20+. See <a href="https://www.electronjs.org/docs/latest/tutorial/code-signing#signing--notarizing-macos-builds">Signing and Notarizing macOS Builds from the Electron documentation</a> for more information.</p>
</li>
<li>
<p><code id="MacConfiguration-entitlementsInherit">entitlementsInherit</code> String | “undefined” - The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. <code>build/entitlements.mac.inherit.plist</code> will be used if exists (it is a recommended way to set). See <a href="https://github.com/electron/osx-sign/tree/main/entitlements">this folder in osx-sign’s repository</a> for examples.</p>
<p>This option only applies when signing with <code>entitlements</code> provided.</p>
</li>
<li>
<p><code id="MacConfiguration-entitlementsLoginHelper">entitlementsLoginHelper</code> String | “undefined” - Path to login helper entitlement file. When using App Sandbox, the the <code>com.apple.security.inherit</code> key that is normally in the inherited entitlements cannot be inherited since the login helper is a standalone executable. Defaults to the value provided for <code>entitlements</code>. This option only applies when signing with <code>entitlements</code> provided.</p>
</li>
<li>
<p><code id="MacConfiguration-provisioningProfile">provisioningProfile</code> String | “undefined” - The path to the provisioning profile to use when signing, absolute or relative to the app root.</p>
</li>
<li>
<p><code id="MacConfiguration-bundleVersion">bundleVersion</code> String | “undefined” - The <code>CFBundleVersion</code>. Do not use it unless <a href="https://github.com/electron-userland/electron-builder/issues/565#issuecomment-230678643">you need to</a>.</p>
</li>
<li>
<p><code id="MacConfiguration-bundleShortVersion">bundleShortVersion</code> String | “undefined” - The <code>CFBundleShortVersionString</code>. Do not use it unless you need to.</p>
</li>
<li>
<p><code id="MacConfiguration-darkModeSupport">darkModeSupport</code> = <code>false</code> Boolean - Whether a dark mode is supported. If your app does have a dark mode, you can make your app follow the system-wide dark mode setting.</p>
</li>
<li>
<p><code id="MacConfiguration-helperBundleId">helperBundleId</code> = <code>${appBundleIdentifier}.helper</code> String | “undefined” - The bundle identifier to use in the application helper’s plist.</p>
</li>
<li>
<p><code id="MacConfiguration-helperRendererBundleId">helperRendererBundleId</code> = <code>${appBundleIdentifier}.helper.Renderer</code> String | “undefined” - The bundle identifier to use in the Renderer helper’s plist.</p>
</li>
<li>
<p><code id="MacConfiguration-helperPluginBundleId">helperPluginBundleId</code> = <code>${appBundleIdentifier}.helper.Plugin</code> String | “undefined” - The bundle identifier to use in the Plugin helper’s plist.</p>
</li>
<li>
<p><code id="MacConfiguration-helperGPUBundleId">helperGPUBundleId</code> = <code>${appBundleIdentifier}.helper.GPU</code> String | “undefined” - The bundle identifier to use in the GPU helper’s plist.</p>
</li>
<li>
<p><code id="MacConfiguration-helperEHBundleId">helperEHBundleId</code> = <code>${appBundleIdentifier}.helper.EH</code> String | “undefined” - The bundle identifier to use in the EH helper’s plist.</p>
</li>
<li>
<p><code id="MacConfiguration-helperNPBundleId">helperNPBundleId</code> = <code>${appBundleIdentifier}.helper.NP</code> String | “undefined” - The bundle identifier to use in the NP helper’s plist.</p>
</li>
<li>
<p><code id="MacConfiguration-type">type</code> = <code>distribution</code> “distribution” | “development” | “undefined” - Whether to sign app for development or for distribution.</p>
</li>
<li>
<p><code id="MacConfiguration-extendInfo">extendInfo</code> any - The extra entries for <code>Info.plist</code>.</p>
</li>
<li>
<p><code id="MacConfiguration-binaries">binaries</code> Array&lt;String&gt; | “undefined” - Paths of any extra binaries that need to be signed.</p>
</li>
<li>
<p><code id="MacConfiguration-minimumSystemVersion">minimumSystemVersion</code> String | “undefined” - The minimum version of macOS required for the app to run. Corresponds to <code>LSMinimumSystemVersion</code>.</p>
</li>
<li>
<p><code id="MacConfiguration-requirements">requirements</code> String | “undefined” - Path of <a href="https://developer.apple.com/library/mac/documentation/Security/Conceptual/CodeSigningGuide/RequirementLang/RequirementLang.html">requirements file</a> used in signing. Not applicable for MAS.</p>
</li>
<li>
<p><code id="MacConfiguration-extraDistFiles">extraDistFiles</code> Array&lt;String&gt; | String | “undefined” - Extra files to put in archive. Not applicable for <code>tar.*</code>.</p>
</li>
<li>
<p><code id="MacConfiguration-hardenedRuntime">hardenedRuntime</code> = <code>true</code> Boolean - Whether your app has to be signed with hardened runtime.</p>
</li>
<li>
<p><code id="MacConfiguration-gatekeeperAssess">gatekeeperAssess</code> = <code>false</code> Boolean - Whether to let @electron/osx-sign validate the signing or not.</p>
</li>
<li>
<p><code id="MacConfiguration-strictVerify">strictVerify</code> = <code>true</code> Boolean - Whether to let @electron/osx-sign verify the contents or not.</p>
</li>
<li>
<p><code id="MacConfiguration-preAutoEntitlements">preAutoEntitlements</code> = <code>true</code> Boolean - Whether to enable entitlements automation from @electron/osx-sign.</p>
</li>
<li>
<p><code id="MacConfiguration-signIgnore">signIgnore</code> Array&lt;String&gt; | String | “undefined” - Regex or an array of regex’s that signal skipping signing a file.</p>
</li>
<li>
<p><code id="MacConfiguration-timestamp">timestamp</code> String | “undefined” - Specify the URL of the timestamp authority server</p>
</li>
<li>
<p><code id="MacConfiguration-mergeASARs">mergeASARs</code> = <code>true</code> Boolean - Whether to merge ASAR files for different architectures or not.</p>
<p>This option has no effect unless building for “universal” arch.</p>
</li>
<li>
<p><code id="MacConfiguration-singleArchFiles">singleArchFiles</code> String | “undefined” - Minimatch pattern of paths that are allowed to be present in one of the ASAR files, but not in the other.</p>
<p>This option has no effect unless building for “universal” arch and applies only if <code>mergeASARs</code> is <code>true</code>.</p>
</li>
<li>
<p><code id="MacConfiguration-x64ArchFiles">x64ArchFiles</code> String | “undefined” - Minimatch pattern of paths that are allowed to be x64 binaries in both ASAR files</p>
<p>This option has no effect unless building for “universal” arch and applies only if <code>mergeASARs</code> is <code>true</code>.</p>
</li>
<li>
<p><code id="MacConfiguration-notarize">notarize</code> module:app-builder-lib/out/options/macOptions.NotarizeOptions | Boolean | “undefined” - Options to use for @electron/notarize (ref: <a href="https://github.com/electron/notarize">https://github.com/electron/notarize</a>). Supports both <code>legacy</code> and <code>notarytool</code> notarization tools. Use <code>false</code> to explicitly disable</p>
<p>Note: You MUST specify <code>APPLE_ID</code> and <code>APPLE_APP_SPECIFIC_PASSWORD</code> via environment variables to activate notarization step</p>
</li>
</ul>

<!-- end of generated block -->

---

{!includes/platform-specific-configuration-note.md!}
