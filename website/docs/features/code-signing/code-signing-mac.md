# Code Signing for macOS

macOS code signing is supported and runs automatically once a valid signing identity is available — from your keychain or the `CSC_*` environment variables. electron-builder signs the app along with its nested frameworks, helpers, and any installer it produces, so Gatekeeper will allow it to run.

On a macOS development machine, a valid and appropriate identity from your keychain will be automatically used. If no valid certificate is found, signing is skipped for all architectures — electron-builder does **not** apply an ad-hoc signature automatically. To opt in to ad-hoc signing explicitly, set `mac.sign.identity` to `"-"` (see [Signing options](#signing-options) below).

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

## Signing Options

The `mac.sign.identity` configuration controls how (or whether) the app is signed:

| Value | Behavior |
|---|---|
| Not set (default) | electron-builder searches the keychain for a valid certificate; signing is skipped if none is found |
| `null` | Signing is skipped entirely |
| `"-"` | Ad-hoc signing — see caveats below |
| Certificate name | Uses that specific certificate from the keychain |

To skip signing, leave all `CSC_*` environment variables unset and set `CSC_IDENTITY_AUTO_DISCOVERY=false`, or set `mac.sign.identity` to `null` in your config (CLI: `-c.mac.sign.identity=null`).

## Ad-hoc Signing (`mac.sign.identity: "-"`)

Ad-hoc signing applies a self-generated signature with no Apple Team ID. It is useful for local development when you do not have a Developer ID certificate. Because Electron's pre-built frameworks carry Apple's Team ID, ad-hoc signing requires one of the following to prevent an app launch failure:

* Add the [`com.apple.security.cs.disable-library-validation`](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation) entitlement to your entitlements file — **preferred**, keeps hardened runtime active.
* Set `mac.sign.hardenedRuntime: false` — disables hardened runtime entirely, which weakens security protections.

:::warning[Ad-hoc signing caveats]
The following issues can occur when using ad-hoc signing (`mac.sign.identity: "-"`) with the default `mac.sign.hardenedRuntime: true`:

* **App launch failure** — crash report contains `[framework] not valid for use in process: mapping process and mapped file (non-platform) have different Team IDs`: add the [`com.apple.security.cs.disable-library-validation`](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation) entitlement.
* **Electron Framework crash**: add the [`com.apple.security.cs.allow-jit`](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.allow-jit) entitlement, which Electron requires.
* **Sensor or sensitive-data access failures**: add the [appropriate entitlement](https://developer.apple.com/documentation/Security/hardened-runtime#Resource-Access) for the resource you need.
:::

:::tip[Local development without a certificate]
Setting `mac.sign.identity` to `null` (or leaving signing unconfigured with no certificate in the keychain) skips signing entirely. On Apple Silicon, unsigned apps can still be run locally by approving them in **System Settings → Privacy & Security**.
:::

## Local Development vs. CI/Production

| Scenario | Recommended approach |
|---|---|
| Local dev, no certificate | Leave identity unconfigured or set `mac.sign.identity: null` |
| Local dev, want a runnable ad-hoc build | `mac.sign.identity: "-"` + `com.apple.security.cs.disable-library-validation` entitlement |
| CI/production distribution | Configure a Developer ID certificate via `CSC_LINK` / keychain |

## Code Signing and Notarization Tutorial
Thank you to a community member for putting this together.

<iframe width="560" height="315" src="https://www.youtube.com/embed/hYBLfjT57hU?si=lADhxKdYM_5mHsPo" title="MacOS Code Signing in Electron" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>