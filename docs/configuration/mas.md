The top-level [mas](configuration.md#Configuration-mas) key contains set of options instructing electron-builder on how it should build MAS (Mac Application Store) target.
Inherits [macOS options](mac.md).

<!-- do not edit. start of generated block -->
<ul>
<li><code id="MasConfiguration-entitlements">entitlements</code> String | “undefined” - The path to entitlements file for signing the app. <code>build/entitlements.mas.plist</code> will be used if exists (it is a recommended way to set). See <a href="https://github.com/electron/osx-sign/tree/main/entitlements">this folder in osx-sign’s repository</a> for examples. Be aware that your app may crash if the right entitlements are not set like <code>com.apple.security.cs.allow-jit</code> for example on arm64 builds with Electron 20+. See <a href="https://www.electronjs.org/docs/latest/tutorial/code-signing#signing--notarizing-macos-builds">Signing and Notarizing macOS Builds from the Electron documentation</a> for more information.</li>
<li><code id="MasConfiguration-entitlementsInherit">entitlementsInherit</code> String | “undefined” - The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. <code>build/entitlements.mas.inherit.plist</code> will be used if exists (it is a recommended way to set). See <a href="https://github.com/electron/osx-sign/tree/main/entitlements">this folder in osx-sign’s repository</a> for examples.</li>
<li><code id="MasConfiguration-binaries">binaries</code> Array&lt;String&gt; | “undefined” - Paths of any extra binaries that need to be signed.</li>
</ul>

<!-- end of generated block -->
