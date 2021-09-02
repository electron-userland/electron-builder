The top-level [mas](configuration.md#Configuration-mas) key contains set of options instructing electron-builder on how it should build MAS (Mac Application Store) target.
Inherits [macOS options](mac.md).

<!-- do not edit. start of generated block -->
<ul>
<li><code id="MasConfiguration-entitlements">entitlements</code> String | “undefined” - The path to entitlements file for signing the app. <code>build/entitlements.mas.plist</code> will be used if exists (it is a recommended way to set). Otherwise <a href="https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist">default</a>.</li>
<li><code id="MasConfiguration-entitlementsInherit">entitlementsInherit</code> String | “undefined” - The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. <code>build/entitlements.mas.inherit.plist</code> will be used if exists (it is a recommended way to set). Otherwise <a href="https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist">default</a>.</li>
<li><code id="MasConfiguration-binaries">binaries</code> Array&lt;String&gt; | “undefined” - Paths of any extra binaries that need to be signed.</li>
</ul>

<!-- end of generated block -->
