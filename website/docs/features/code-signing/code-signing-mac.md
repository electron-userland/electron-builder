# Code Signing for macOS

macOS code signing is supported. If the configuration values are provided correctly in your package.json, then signing should be automatically executed.

On a macOS development machine, a valid and appropriate identity from your keychain will be automatically used. If no such identity exists, the default behavior depends on the target architecture. On ARM or universal builds, an ad-hoc signature will be applied by default. On Intel-only builds, the default behavior is to not sign at all.

:::tip
See article [Notarizing your Electron application](https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/).
:::

## How to Export Certificate on macOS

Export your certificate from Keychain Access as a `.p12` file — see [Apple's guide to exporting Keychain items](https://support.apple.com/guide/keychain-access/import-and-export-keychain-items-kyca35961/mac).

Which certificate to export depends on your electron-builder target:

| Certificate Type | Use |
|---|---|
| `Developer ID Application` | macOS direct distribution |
| `Developer ID Application` + `Developer ID Installer` | macOS PKG installer (`pkg` target) |
| `3rd Party Mac Developer Installer` + `Apple Distribution` | Mac App Store (`mas` target) |
| `Apple Development` or `Mac Developer` | Local MAS testing (`mas-dev` target) — also requires a provisioning profile in the working directory |

You can export multiple certificates into one `.p12` file. All selected certificates are imported into the temporary keychain on CI.

## How to Disable Code Signing During the Build Process on macOS

To disable Code Signing when building for macOS leave all the above vars unset except for `CSC_IDENTITY_AUTO_DISCOVERY` which needs to be set to `false`. This can be done by running `export CSC_IDENTITY_AUTO_DISCOVERY=false`.

Another way — set `mac.identity` to `null`. You can pass additional configuration using CLI as well: `-c.mac.identity=null`. If you are building for ARM, you likely actually want to use ad-hoc signing, in which case you should set `mac.identity` to `-`.

:::warning[Disabling code signing disables hardened runtime]
Unlike ad-hoc signing (`mac.identity=-`), a complete lack of signing (`mac.identity=null`) will disable hardened runtime in the final output even if its associated configuration setting is enabled. If your goal in setting `mac.identity=null` is to work around one of these issues, consider trying these suggested solutions instead:

* An error saying "[App] cannot be opened because of a problem" and/or a crash report for your app in Console.app containing the text `[framework] not valid for use in process: mapping process and mapped file (non-platform) have different Team IDs)`: make sure the [`com.apple.security.cs.disable-library-validation` entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation) is being applied, which is required when using hardened runtime in an app with ad-hoc signing that loads a framework.
* A crash in Electron Framework: make sure the [`com.apple.security.cs.allow-jit` entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.allow-jit) is being applied, which Electron requires.
* Issues when accessing sensors like the camera or microphone or sensitive data on disk such as the Photos library: make sure the [appropriate entitlement](https://developer.apple.com/documentation/Security/hardened-runtime#Resource-Access) is being applied.
:::

## Code Signing and Notarization Tutorial
Thank you to a community member for putting this together.

<iframe width="560" height="315" src="https://www.youtube.com/embed/hYBLfjT57hU?si=lADhxKdYM_5mHsPo" title="MacOS Code Signing in Electron" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>