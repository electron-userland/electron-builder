# Code Signing for macOS

macOS code signing is supported. If the configuration values are provided correctly in your package.json, then signing should be automatically executed.

On a macOS development machine, a valid and appropriate identity from your keychain will be automatically used. If no valid certificate is found, signing is skipped for all architectures — electron-builder does **not** apply an ad-hoc signature automatically. To opt in to ad-hoc signing explicitly, set `mac.identity` to `"-"` (see [Signing options](#signing-options) below).

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

The `mac.identity` configuration controls how (or whether) the app is signed:

| Value | Behavior |
|---|---|
| Not set (default) | electron-builder searches the keychain for a valid certificate; signing is skipped if none is found |
| `null` | Signing is skipped entirely |
| `"-"` | Ad-hoc signing — see caveats below |
| Certificate name | Uses that specific certificate from the keychain |

To skip signing, leave all `CSC_*` environment variables unset and set `CSC_IDENTITY_AUTO_DISCOVERY=false`, or set `mac.identity` to `null` in your config (CLI: `-c.mac.identity=null`).

## Ad-hoc Signing (`mac.identity: "-"`)

Ad-hoc signing applies a self-generated signature with no Apple Team ID. It is useful for local development when you do not have a Developer ID certificate. Because Electron's pre-built frameworks carry Apple's Team ID, ad-hoc signing requires one of the following to prevent an app launch failure:

* Add the [`com.apple.security.cs.disable-library-validation`](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation) entitlement to your entitlements file — **preferred**, keeps hardened runtime active.
* Set `mac.hardenedRuntime: false` — disables hardened runtime entirely, which weakens security protections.

:::warning[Ad-hoc signing caveats]
The following issues can occur when using ad-hoc signing (`mac.identity: "-"`) with the default `hardenedRuntime: true`:

* **App launch failure** — crash report contains `[framework] not valid for use in process: mapping process and mapped file (non-platform) have different Team IDs`: add the [`com.apple.security.cs.disable-library-validation`](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation) entitlement.
* **Electron Framework crash**: add the [`com.apple.security.cs.allow-jit`](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.allow-jit) entitlement, which Electron requires.
* **Sensor or sensitive-data access failures**: add the [appropriate entitlement](https://developer.apple.com/documentation/Security/hardened-runtime#Resource-Access) for the resource you need.
:::

:::tip[Local development without a certificate]
Setting `mac.identity` to `null` (or leaving signing unconfigured with no certificate in the keychain) skips signing entirely. On Apple Silicon, unsigned apps can still be run locally by approving them in **System Settings → Privacy & Security**.
:::

## Self-Signed Signing (`CSC_ALLOW_SELF_SIGNED`)

If you do not have an Apple Developer membership but need a build with a *stable* signing identity — for example to exercise the macOS auto-updater, whose signature check requires the updated app to satisfy the running app's signing identity — you can sign with a self-signed certificate.

Unlike [ad-hoc signing](#ad-hoc-signing-macidentity--), which pins the signature to the build's code hash (so every rebuild changes the identity and breaks auto-update), a self-signed certificate provides a consistent identity across builds.

1. Create a self-signed `Developer ID Application` certificate (e.g. via **Keychain Access → Certificate Assistant → Create a Certificate…**, type *Code Signing*) and export it as a `.p12`.
2. Point electron-builder at it and opt in:

```bash
export CSC_LINK=/path/to/self-signed.p12
export CSC_KEY_PASSWORD=<p12 password>
export CSC_ALLOW_SELF_SIGNED=true
```

By default electron-builder only signs with certificates trusted by the system; `CSC_ALLOW_SELF_SIGNED=true` additionally allows an untrusted self-signed identity to be selected. No keychain trust or `sudo` is required.

:::note[`pkg` installers]
Self-signed identities work for app code signing (`codesign`), but **not** for `pkg` installer signing: `productbuild` requires a system-trusted identity and rejects self-signed ones. With a self-signed identity the app bundle is signed while the surrounding `pkg` installer is left unsigned — do not set `CSC_INSTALLER_LINK`.
:::

:::warning
Self-signed builds are for **local development and testing only**. They cannot be notarized and are blocked by Gatekeeper on other machines. For distribution, use a real Developer ID certificate.
:::

## Local Development vs. CI/Production

| Scenario | Recommended approach |
|---|---|
| Local dev, no certificate | Leave identity unconfigured or set `mac.identity: null` |
| Local dev, want a runnable ad-hoc build | `mac.identity: "-"` + `com.apple.security.cs.disable-library-validation` entitlement |
| Local dev, want a stable identity (e.g. auto-update testing) | Self-signed certificate + `CSC_ALLOW_SELF_SIGNED=true` |
| CI/production distribution | Configure a Developer ID certificate via `CSC_LINK` / keychain |

## Code Signing and Notarization Tutorial
Thank you to a community member for putting this together.

<iframe width="560" height="315" src="https://www.youtube.com/embed/hYBLfjT57hU?si=lADhxKdYM_5mHsPo" title="MacOS Code Signing in Electron" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>