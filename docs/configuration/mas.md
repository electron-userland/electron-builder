The top-level [mas](configuration.md#Configuration-mas) key contains set of options instructing electron-builder on how it should build MAS (Mac Application Store) target.
Inherits [macOS options](mac.md).

<!-- do not edit. start of generated block -->
* <code id="MasConfiguration-entitlements">entitlements</code> String - The path to entitlements file for signing the app. `build/entitlements.mas.plist` will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.plist).
* <code id="MasConfiguration-entitlementsInherit">entitlementsInherit</code> String - The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mas.inherit.plist` will be used if exists (it is a recommended way to set). Otherwise [default](https://github.com/electron-userland/electron-osx-sign/blob/master/default.entitlements.mas.inherit.plist).
* <code id="MasConfiguration-binaries">binaries</code> Array&lt;String&gt; - Paths of any extra binaries that need to be signed.
<!-- end of generated block -->