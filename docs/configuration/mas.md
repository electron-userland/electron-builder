The top-level [mas](configuration.md#Configuration-mas) key contains set of options instructing electron-builder on how it should build MAS (Mac Application Store) target.
Inherits [macOS options](mac.md).

<!-- do not edit. start of generated block -->
* <code id="MasConfiguration-entitlements">entitlements</code> String | "undefined" - The path to entitlements file for signing the app. `build/entitlements.mas.plist` will be used if exists (it is a recommended way to set). See [this folder in osx-sign's repository](https://github.com/electron/osx-sign/tree/main/entitlements) for examples. Be aware that your app may crash if the right entitlements are not set like `com.apple.security.cs.allow-jit` for example on arm64 builds with Electron 20+. See [Signing and Notarizing macOS Builds from the Electron documentation](https://www.electronjs.org/docs/latest/tutorial/code-signing#signing--notarizing-macos-builds) for more information.
* <code id="MasConfiguration-entitlementsInherit">entitlementsInherit</code> String | "undefined" - The path to child entitlements which inherit the security settings for signing frameworks and bundles of a distribution. `build/entitlements.mas.inherit.plist` will be used if exists (it is a recommended way to set). See [this folder in osx-sign's repository](https://github.com/electron/osx-sign/tree/main/entitlements) for examples.
* <code id="MasConfiguration-binaries">binaries</code> Array&lt;String&gt; | "undefined" - Paths of any extra binaries that need to be signed.

<!-- end of generated block -->
