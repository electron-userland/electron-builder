The top-level [msix](configuration.md) key contains a set of options instructing electron-builder on how it should build MSIX packages for the Microsoft Store, enterprise sideloading, and modern Windows deployment.

:::info[Beta]
The MSIX target is **beta**. The configuration surface and generated manifest are still evolving. Pin your electron-builder version and re-test packaging after upgrades.
:::

All options are optional. All required MSIX configuration is inferred and computed automatically from your application metadata.

## MSIX vs. AppX

MSIX is the modern successor to AppX. They share the same underlying manifest format (`AppxManifest.xml`), the same packaging tool (`makeappx.exe`), and the same signing requirements, but MSIX exposes newer manifest schemas and deployment features that AppX does not.

| Capability | AppX ([appx](appx.md)) | MSIX (this target) |
|---|---|---|
| Artifact | `.appx` | `.msix`, `.msixbundle`, `.msixupload` |
| Multi-arch bundle | No | Yes (`.msixbundle`) |
| Store upload archive | Manual | Yes (`.msixupload`) |
| Package Integrity (`uap10`) | No | Yes (`enforcePackageIntegrity`) |
| Windows Services (`desktop6`) | No | Yes (`windowsServices`) |
| electron-updater auto-update | No | Opt-in, beta ([`electronUpdaterAware`](#auto-updates)) |
| Required toolset | any | `winCodeSign` ≥ `1.0.0` |

If you are starting fresh, prefer **MSIX**. AppX remains for backward compatibility.

## When to Use MSIX

Choose MSIX when:

- **Windows Store distribution** — your app will be listed in the Microsoft Store.
- **Enterprise sideloading** — IT manages app distribution via MDM/Intune without the Store.
- **Windows 10S / Windows SE** — these locked-down editions only run Store-packaged apps.
- **You need modern packaging features** — package integrity, bundled architectures, or registered Windows services.

For standard consumer distribution with self-managed auto-updates, [NSIS](nsis.md) is simpler. An MSIX package can also update itself from your own server with electron-updater, but that support is opt-in and beta (see [Auto-Updates](#auto-updates)). For enterprise deployment without the Store, [MSI](msi.md) is often preferred.

## Requirements

MSIX packaging requires a modern Windows Kits toolset that bundles `makeappx.exe`, `makepri.exe`, and the MSIX-capable Windows SDK. Set [`toolsets.winCodeSign`](configuration.md) to any modern bundle `>= 1.0.0` (e.g. `1.0.0`, `1.1.0`, or `1.3.0`):

```yaml
toolsets:
  winCodeSign: "1.1.0"
win:
  target: msix
```

:::warning
The legacy `winCodeSign-2.6.0` bundle (toolset `0.0.0`) does **not** include the SDK version required for MSIX. Building MSIX without a modern toolset throws an `InvalidConfigurationError`.
:::

MSIX can be built on:

- **Windows 10 / Windows Server 2012 R2 (version 6.3+) or later** — native.
- **macOS via [Parallels Desktop](https://www.parallels.com/)** — electron-builder drives a Windows VM through Parallels to run the Windows-only packaging tools. See [Building on macOS](#building-on-macos) below.

Linux is not supported for MSIX.

## Quick Start

```yaml
win:
  target: msix
toolsets:
  winCodeSign: "1.1.0"
msix:
  identityName: "MyCompany.MyApp"
  publisher: "CN=My Company, O=My Company, C=US"
  publisherDisplayName: "My Company"
  displayName: "My Application"
```

```powershell
electron-builder --win msix
```

## MSIX Assets

MSIX uses the same logo/icon assets as AppX. Place them in the `appx` folder inside your [build resources](configuration.md) directory (default: `build/appx/`):

| Asset | File Name | Required | Size |
|---|---|---|---|
| Store Logo | `StoreLogo.png` | Yes | 50×50 |
| Square 150×150 | `Square150x150Logo.png` | Yes | 150×150 |
| Square 44×44 | `Square44x44Logo.png` | Yes | 44×44 |
| Wide 310×150 | `Wide310x150Logo.png` | Yes | 310×150 |
| Badge Logo | `BadgeLogo.png` | Optional | 24×24 |
| Large Tile | `LargeTile.png` | Optional | 310×310 |
| Small Tile | `SmallTile.png` | Optional | 71×71 |
| Splash Screen | `SplashScreen.png` | Optional | 620×300 |

Default assets are substituted for the required logos if you don't provide your own. Scale variants (e.g., `Square44x44Logo.scale-200.png`, `BadgeLogo.targetsize-48.png`) are supported — when any scaled asset is present, electron-builder runs `makepri.exe` to generate `resources.pri` automatically. See [Microsoft's tile asset guidelines](https://docs.microsoft.com/en-us/windows/uwp/controls-and-patterns/tiles-and-notifications-app-assets).

## Identity and Publisher

```yaml
msix:
  applicationId: "MyApp"                            # alpha-numeric segments separated by periods, each segment starting with a letter
  identityName: "MyCompany.MyApp"                   # unique within the Store; 3–50 chars, [a-zA-Z0-9.-]
  publisher: "CN=My Company, O=My Company, C=US"    # must match certificate Subject exactly
  publisherDisplayName: "My Company"                # friendly publisher name shown to users
  displayName: "My Application"                     # shown in Start menu / Store
```

Defaults when omitted:

- `applicationId` → derived from `identityName` (a leading numeric prefix such as `01234` is stripped automatically, with a warning), falling back to the application name. Validated to 1–64 characters.
- `identityName` → the application `name`. Validated to 3–50 characters of `[a-zA-Z0-9.-]`.
- `publisherDisplayName` → company name from your application metadata (`author` in `package.json`). Building fails if neither is set.

:::warning[Publisher Must Match Certificate]
The `publisher` value must exactly match the Subject field of your code signing certificate. Mismatches cause installation failures. When building for the Store (no certificate configured), electron-builder uses `CN=ms` as a placeholder — the Store re-signs on submission.
:::

## Capabilities

MSIX apps declare the system capabilities they use:

```yaml
msix:
  capabilities:
    - runFullTrust                  # required for Electron apps — always included
    - internetClient                # outbound internet access
    - privateNetworkClientServer    # local network
    - webcam                        # camera access
    - microphone                    # microphone access
```

`runFullTrust` is required for Electron apps and is **always added**, even if you specify a different set — you cannot remove it. Invalid capability names cause the build to fail with `invalid windows capabilities`. The full list is in [Microsoft's capability documentation](https://docs.microsoft.com/en-us/windows/uwp/packaging/app-capability-declarations).

## Tile Customization

```yaml
msix:
  backgroundColor: "#2c2c2c"    # tile background color (CSS color). Default: #464646
  showNameOnTiles: false        # overlay app name on the wide & square tiles. Default: false
```

Optional tile assets enable extra visual elements automatically when present in `build/appx/`: `BadgeLogo.png` (lock-screen badge), `LargeTile.png` (310×310), `SmallTile.png` (71×71), and `SplashScreen.png`.

## Language Support

```yaml
msix:
  languages:
    - en-US     # first entry is the default language
    - de-DE
    - fr-FR
    - ja-JP
```

Declares which languages your app supports for Store listings and localized resources. Defaults to `["en-US"]`. Underscores are normalized to hyphens (`en_US` → `en-US`).

## Version Targeting

```yaml
msix:
  minVersion: "10.0.17763.0"        # Windows 10 1809 minimum (Store minimum). This is the default.
  maxVersionTested: "10.0.22621.0"  # defaults to minVersion when omitted
```

These map to `MinVersion` / `MaxVersionTested` on `<TargetDeviceFamily Name="Windows.Desktop" />`.

```yaml
msix:
  setBuildNumber: false   # include the build number in the package version. Default: false
```

## Package Integrity

```yaml
msix:
  enforcePackageIntegrity: true   # Default: false
```

When enabled, emits `<uap10:PackageIntegrity><uap10:Content Enforcement="on" /></uap10:PackageIntegrity>` inside `<Properties>`. The child `<uap10:Content Enforcement="on" />` element is what actually turns on runtime integrity checks — a bare/childless element is a no-op. Windows then verifies that no package files have been tampered with after signing. **Requires Windows 10 version 2004 (build 19041) or later.**

## Windows Services

Register Windows Services that ship inside the package (`desktop6` schema). **Requires Windows 10 version 1903 (build 18362) or later, and the `packagedServices` (or `localSystemServices`) restricted capability declared via [`capabilities`](#capabilities)** — services will not register without it.

```yaml
msix:
  capabilities:
    - packagedServices                 # restricted capability — required for windows.service
  windowsServices:
    - name: "MyBackgroundService"        # required — Service Control Manager name
      executable: "app/service.exe"      # optional — defaults to the main app executable
      startupType: "auto"                # auto | manual | disabled. Default: manual
      startAccount: "localSystem"        # localSystem | localService | networkService. Default: localSystem
      arguments: "--mode service"        # optional — command-line arguments
```

| Field | Required | Default | Description |
|---|---|---|---|
| `name` | Yes | — | Service name used in the Windows Service Control Manager. |
| `executable` | No | main app executable | Relative path to the service executable within the package. |
| `startupType` | No | `manual` | How Windows starts the service: `auto`, `manual`, or `disabled`. |
| `startAccount` | No | `localSystem` | The account the service runs under: `localSystem`, `localService`, or `networkService`. Required by the `desktop6:Service` schema and always emitted. |
| `arguments` | No | — | Command-line arguments passed to the service executable. |

Each entry produces a `<desktop6:Extension Category="windows.service" Executable="..." EntryPoint="Windows.FullTrustApplication"><desktop6:Service Name="..." StartupType="..." StartAccount="..." Arguments="..." /></desktop6:Extension>` declaration.

## Auto-Launch Extension

```yaml
msix:
  addAutoLaunchExtension: true
```

When `true`, adds a `desktop:Extension Category="windows.startupTask"` so the app runs on user login. When unset, it defaults to `true` only if `electron-winstore-auto-launch` is present in your dependencies, otherwise `false`. Requires the `runFullTrust` capability (always present).

## Protocols and File Associations

MSIX picks up the top-level [`protocols`](configuration.md) and [`fileAssociations`](configuration.md) configuration and emits the corresponding `uap:Extension` declarations — you do not configure these under `msix`:

```yaml
protocols:
  name: "My App Protocol"
  schemes: ["myapp"]
fileAssociations:
  - ext: "myext"
    name: "My Custom File"
```

## Custom Manifest and Extensions

For advanced scenarios, supply your own manifest template or inject extra XML:

```yaml
msix:
  customManifestPath: "msix/AppxManifest.xml"     # relative to build resources
  customExtensionsPath: "msix/extensions.xml"     # injected into <Extensions>
```

The custom manifest supports the same `${}` macros as the [default template](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/msix/appxmanifest.xml), including the MSIX-specific macro `${packageIntegrity}`. Windows services are injected via the `${extensions}` macro alongside protocol/file-association extensions.

Note the two paths resolve against **different** base directories: `customManifestPath` is relative to the [build resources](configuration.md) directory, whereas `customExtensionsPath` is resolved relative to the **app source directory** (the packaged app dir), not the build resources directory.

:::warning[Namespaces in a custom template]
If you supply your own template, it must declare the namespaces used by the features you enable — `desktop` (auto-launch startup task), `uap` (protocols / file associations), `uap10` (package integrity), and `desktop6` (services) — and list the appropriate prefixes in `IgnorableNamespaces`. Omitting them produces an invalid manifest. Start from the default template above.
:::

## Bundles and Store Uploads

When you build more than one architecture, electron-builder can combine the per-architecture `.msix` packages into a single `.msixbundle`, and optionally wrap it into a `.msixupload` archive for the Microsoft Store Partner Center:

```yaml
win:
  target:
    - target: msix
      arch:
        - x64
        - arm64
msix:
  createMsixbundle: true     # combine architectures into one .msixbundle. Default: true
  createMsixupload: true     # produce a .msixupload for Partner Center submission. Default: false
```

- A `.msixbundle` is produced when more than one architecture is built and `createMsixbundle` is not `false`, and always with [`electronUpdaterAware`](#auto-updates), even for a single architecture (`createMsixbundle: false` is then rejected).
- The bundle version (makeappx `/bv`) is the 4-part version of the packages inside it. Bundles built by earlier 27.0.0 alphas carried a date-based version instead; if Windows refuses a newer bundle over such an install as a downgrade (`0x80073D06`), install that bundle once with `Add-AppxPackage -Path <bundle> -ForceUpdateFromAnyVersion`, which keeps the app's data. Reinstalling the app also gets past it, but uninstalling an MSIX package deletes its app data, including Electron's `userData` (kept under `%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalCache`).
- A `.msixupload` is a plain ZIP of the bundle (or, if no bundle was produced, the single package). It is **not** code-signed — the Store re-signs on submission.

:::note
If you set `createMsixbundle: false` while building multiple architectures and request `createMsixupload: true`, the upload will contain only the first architecture's package. Keep `createMsixbundle` enabled for multi-architecture Store submissions.
:::

## Code Signing {#msix-package-code-signing}

MSIX artifacts (`.msix`, `.msixbundle`) are signed with **SHA-256** (single signature; dual SHA-1/SHA-256 signing does not apply to MSIX).

- **Store distribution** — no manual signing needed. The Store signs the package with a Microsoft certificate during submission; the `publisher` is replaced with a Store-managed identity.
- **Sideloading / enterprise** — the package must be signed with a trusted certificate whose Subject matches `publisher`. See [Windows Code Signing](features/code-signing/code-signing-win.md).

For self-signed certificates during development, see [Microsoft's certificate guide](https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing).

## Building on macOS

MSIX packaging tools are Windows-only. On macOS, electron-builder runs them inside a Windows VM via [Parallels Desktop](https://www.parallels.com/). Temp files are routed through your home directory so the VM can access them over the always-available `\\Mac\Home` share. Ensure a Parallels Windows VM is configured and the modern `winCodeSign` toolset is available inside it.

## Testing Locally

```powershell
# Install locally (Developer Mode must be enabled for unsigned packages, or import the signing cert first)
Add-AppxPackage -Path ".\MyApp-1.0.0.msix"

# Install a bundle
Add-AppxPackage -Path ".\MyApp-1.0.0.msixbundle"

# Verify it is registered
Get-AppxPackage | Where-Object { $_.Name -like "*MyApp*" }

# Inspect the installed manifest
$p = Get-AppxPackage | Where-Object { $_.Name -like "*MyApp*" } | Select-Object -First 1
(Get-AppxPackageManifest -Package $p.PackageFullName).OuterXml

# Uninstall
Get-AppxPackage | Where-Object { $_.Name -like "*MyApp*" } | Remove-AppxPackage
```

To install a package signed with a self-signed certificate, first import that certificate into **Trusted People** on the target machine — see [Microsoft's signing guide](https://learn.microsoft.com/en-us/windows/msix/package/sign-app-package-using-signtool).

## Publishing to the Microsoft Store

1. Create a [Microsoft Developer account](https://developer.microsoft.com/en-us/store/register/) and reserve your app name in [Partner Center](https://partner.microsoft.com/en-us/dashboard/windows/overview).
2. Build with `createMsixupload: true` to produce a `.msixupload`.
3. Upload the `.msixupload` via the Partner Center submission flow.
4. Complete the submission (age rating, pricing, screenshots) and wait for certification.

## Auto-Updates

An MSIX package is updated by the Microsoft Store, by App Installer (an `.appinstaller` file), or — opt-in and **beta** — by [electron-updater](features/auto-update.md) from your own [publish](publish.md) feed. electron-updater keeps its providers, [signed update manifests](features/signed-update-manifests.md), staged rollouts and events: it downloads and verifies the update, and Electron's native MSIX updater has Windows install it.

### Enabling electron-updater

```yaml
win:
  target: msix
msix:
  identityName: "MyCompany.MyApp"
  publisher: "CN=My Company, O=My Company, C=US"   # Subject of the signing certificate
  electronUpdaterAware: true                       # beta. Default: false
publish:
  provider: generic
  url: "https://updates.example.com/my-app"
```

```js
import { autoUpdater } from "electron-updater"

autoUpdater.checkForUpdatesAndNotify()
```

- Sign the package with a certificate your users' machines trust — see [Updater requirements](#updater-requirements).
- [Signed update manifests](features/signed-update-manifests.md) are required, also for a build that does not publish: build with an Ed25519 signing key, or set `updateManifest.publicKey` when another step signs `latest-msix.yml`, so that `app-update.yml` carries the public key. Without a trusted key, `MsixUpdater` refuses to download updates (`ERR_UPDATER_MSIX_MANIFEST_NOT_SIGNED`), and `updateManifest: false` fails the build. Windows installs any package signed with a certificate it trusts, even another app's, and the `packageFamilyName` / `packageVersion` hints in `latest-msix.yml` are not signed: only a verified manifest pins the bundle, by its sha512. Before staging it, `MsixUpdater` also checks the identity in the downloaded bundle's own manifest (`AppxMetadata/AppxBundleManifest.xml`).
- Only releases built with `electronUpdaterAware` update themselves. Installs of earlier releases have to receive the first such release the way they were installed (for example a manual install or your device management).

### What the build writes

- A `.msixbundle`, even for a single architecture. It is the only file electron-updater installs: a package installed from a bundle cannot be updated with a single `.msix`, while a single-`.msix` install can move to a bundle. `createMsixbundle: false` is rejected.
- `latest-msix.yml` (`<channel>-msix.yml` for other channels), listing only the bundle. Its file entry also records the bundle's `packageFamilyName` and `packageVersion`, which electron-updater checks before downloading (the downloaded bundle's own manifest is checked again before staging); they are not covered by the manifest signature ([why](features/signed-update-manifests.md#what-is-signed)). NSIS keeps its `latest.yml`, so NSIS and MSIX builds can share one feed.
- `app-update.yml` and a `resources/package-type` marker (`msix`) inside the package. electron-updater selects `MsixUpdater` by this marker only: in any other app, including one with package identity but without the marker, `autoUpdater` stays an `NsisUpdater`.

### How an update is installed

In a package built with `electronUpdaterAware`, `autoUpdater` is an `MsixUpdater`. An update check:

1. Fetches `latest-msix.yml` (or `<channel>-msix.yml`) and verifies its signature.
2. Refuses the update before downloading it if the app has no trusted key to verify the manifest with (see [Enabling electron-updater](#enabling-electron-updater)), if the update belongs to another package family, or if its 4-part version is not higher than the installed one (see [Versions and package identity](#versions-and-package-identity)), according to the `latest-msix.yml` hints.
3. Downloads the bundle into `%LOCALAPPDATA%\Packages\<PackageFamilyName>\LocalCache\<updaterCacheDirName>`, verifies its sha512, and checks the package family and version in the bundle's own manifest, as in step 2. A refused bundle is removed, not kept for the next check. Windows' deployment service can read this folder; the usual cache folder is virtualized for packaged apps.
4. Hands it to Electron's native MSIX updater, which stages it with Windows. `update-downloaded` is emitted once the update is staged; with `autoInstallEvent = "manual"` it is emitted after the download, and staging happens in `quitAndInstall()`.

Windows applies the staged update as follows:

- **`quitAndInstall()`** when the app is to run after the install — as for NSIS, when `autoRunAppAfterInstall` is `true` (the default) or, for a silent call (`isSilent: true`, which has no other effect), only with `isForceRunAfter: true`: Windows shuts the app down to register the update right away. The `session-end` event of its windows is turned into `app.quit()`, so your quit handlers run; an app without a `BrowserWindow` is terminated after about 30 seconds. Windows restarts the app, without arguments, only if it had been running for at least 60 seconds. If the app is still running when Electron's install completes, the update was not installed: `ERR_UPDATER_MSIX_INSTALL_FAILED` is emitted, and Windows applies the update at the next launch.
- **`quitAndInstall()` otherwise** — a non-silent call with `autoRunAppAfterInstall = false`, a silent call without `isForceRunAfter`, or `waitUntilNextLaunch: true`: the app quits, and Windows applies the update the next time the app is activated — from the Start menu or taskbar, a protocol or file association, or a startup task. Starting the `.exe` by its path or `app.relaunch()` does not apply it. As with NSIS, `before-quit-for-update` is emitted on Electron's `autoUpdater` before the quit, except with `waitUntilNextLaunch`. If the app cancels the quit, it can call `quitAndInstall()` again.
- **Without `quitAndInstall()`**: `autoInstallEvent` `"onQuit"` (the default) and `"onNextLaunch"` both stage the update right after the download, so Windows applies it at the next activation after the app quits. `installPendingUpdateIfAvailable()` resolves `false`.
- A packaged service ([`windowsServices`](#windows-services)), a tray process or a child process that outlives the app keeps the package in use and delays the update until it exits.

### Updater requirements

`MsixUpdater` needs all of these. Without a trusted manifest key (the last row) it refuses to download updates; when any other requirement is not met, it stays inactive — it logs the reason, and `checkForUpdates()` resolves `null`:

| Requirement | Notes |
|---|---|
| The package was built with `electronUpdaterAware: true` | Detected through the `resources/package-type` marker |
| The app runs with package identity | Activated from the installed package (Start menu, taskbar, alias, protocol, …) |
| Electron 39.5.2+ (39.x), 40.2.1+ (40.x), 41.0.0-alpha.6+ (41.x), or 42+ | Other versions lack a working native MSIX updater, so the build fails for them; it only warns when it cannot tell the version (custom `electronDist`, prepackaged app) |
| Windows 10 version 2004 (build 19041) or later | Older versions that `minVersion` admits run the app without updates |
| Signed with a certificate the machine trusts | A publicly trusted code-signing certificate, or your own certificate imported into Trusted People (Windows reports the signature kind as `developer` or `enterprise`). Not a Store-signed or unsigned package, and not one registered in development mode (`Add-AppxPackage -Register`) |
| Not installed through App Installer | A package installed from an `.appinstaller` file is updated by App Installer |
| A trusted key for [signed update manifests](features/signed-update-manifests.md) | Embedded into `app-update.yml` by a build with a signing key or `updateManifest.publicKey`, or set as `autoUpdater.updateManifestPublicKey`. Without one, the check still reports the update, but its download fails with `ERR_UPDATER_MSIX_MANIFEST_NOT_SIGNED` |

### Versions and package identity

- Every release needs a higher 4-part package version. An equal version is always refused: Windows does not install the same version with different contents.
- By default the package version is `major.minor.patch.0`, so prerelease tags collapse: `1.2.0-beta.1` and `1.2.0` are both `1.2.0.0`. If you ship prereleases, set `setBuildNumber: true` with an increasing numeric build number (the `buildNumber` option, or a CI variable such as `BUILD_NUMBER`); electron-builder warns otherwise.
- A lower version is refused unless `allowDowngrade` is `true` (setting `autoUpdater.channel` turns it on); Windows is then asked to accept it (`ForceUpdateFromAnyVersion`). A downgrade may only take effect at the next launch.
- `identityName` and the certificate Subject (`publisher`) make up the package family name and must not change between releases. A package of another family would install as a second app, so electron-updater refuses it before downloading. Switching the signing method (for example to Azure Trusted Signing) can change the Subject — see [Key Rotation](features/key-rotation.md#renewal-vs-rotation).

### Error codes

These are emitted through the regular `error` event:

| Code | Meaning |
|---|---|
| `ERR_UPDATER_MSIX_INACTIVE` | A download was started (for example `downloadUpdate()` without a successful check) while Electron's autoUpdater provides no MSIX package info: the app does not run as an installed MSIX package (see [Updater requirements](#updater-requirements)) |
| `ERR_UPDATER_MSIX_MANIFEST_NOT_SIGNED` | No trusted key verified the update manifest in the update check — the app has no trusted key for [signed update manifests](features/signed-update-manifests.md), or got one only after the check — so nothing pins the bundle that Windows would install (see [Enabling electron-updater](#enabling-electron-updater)). Raised before downloading; the check has already emitted `update-available` |
| `ERR_UPDATER_MSIX_FILE_NOT_FOUND` | The update info lists no `.msixbundle`: `<channel>-msix.yml` has none, or a custom provider fetched another file (see [Limitations](#limitations)) |
| `ERR_UPDATER_MSIX_PACKAGE_FAMILY_MISMATCH` | The bundle's `packageFamilyName` is missing or differs from the installed package's: raised before downloading. Or the identity in the downloaded bundle's manifest belongs to another package family: raised before staging, and the bundle is removed |
| `ERR_UPDATER_MSIX_VERSION_NOT_HIGHER` | The bundle's `packageVersion` is missing or not a 4-part numeric version, equal to the installed version, or lower without `allowDowngrade`: raised before downloading. Or the version in the downloaded bundle's manifest is: raised before staging, and the bundle is removed |
| `ERR_UPDATER_INVALID_UPDATE_FILE` | The downloaded file is not a readable `.msixbundle`: it has no `AppxMetadata/AppxBundleManifest.xml` with an `<Identity>`. Raised before staging; the file is removed |
| `ERR_UPDATER_MSIX_STAGING_FAILED` | Windows did not stage the downloaded bundle — the message ends with Windows' error text and the HRESULT as a signed decimal in parentheses, such as `(-2147009274)` for `0x80073D06` (see [Common Questions](#common-questions)) — or staging took longer than 10 minutes. A staging that timed out may still be running: until Electron reports its outcome, another bundle is refused with this code too. The verified bundle stays cached, so the next check stages it again without downloading it |
| `ERR_UPDATER_MSIX_INSTALL_FAILED` | `quitAndInstall()` did not install the update while the app was running: Windows could not start registering the staged update, or Electron's native install completed while the app was still running (the registration failed or was deferred). Windows then applies the update at the next launch, and `quitAndInstall()` can be called again. Windows shuts the app down before it registers the update, so a registration that fails after that is not reported |

### Limitations

- Every update is a full download (no differential updates), and the bundle contains every architecture you build.
- Don't use `${arch}` in the publish `url` or `path`: the bundle and `latest-msix.yml` are not per architecture, so installs would poll a path that never receives them.
- Prefer an ASCII `artifactName` for the bundle: the downloaded file is handed to Windows by its `file://` URL, and non-ASCII names are untested.
- A custom `win.sign.sign` hook needs `win.sign.publisherName`, because the build writes `app-update.yml` ([details](win.md#how-do-you-delegate-code-signing)). `MsixUpdater` does not use `publisherName` — the signed update manifest pins the bundle — so an app that ships only as MSIX can set `win.verifyUpdateCodeSignature: false` instead.
- A custom update provider must name the file it fetches with `getDefaultChannelName()` / `getCustomChannelName(channel)`, as the built-in providers do, and pass the `runtimeOptions` it receives on to `super`. Otherwise it requests `latest.yml` instead of `latest-msix.yml`: on a feed without NSIS releases, the check fails with the provider's own not-found error (for example an HTTP 404, or `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`), or, while an old NSIS `latest.yml` is still there, fails with `ERR_UPDATER_MANIFEST_NOT_SIGNED` / `ERR_UPDATER_MANIFEST_SIGNATURE_INVALID` unless a key the app trusts signed it (the signature is checked before the version), and otherwise reports no update; on a feed shared with NSIS, a newer release fails with `ERR_UPDATER_MSIX_FILE_NOT_FOUND`.
- A `--prepackaged` build does not write `app-update.yml`: include one in the prepackaged app's `resources` (electron-builder warns when it is missing).
- AppX packages, App Installer integration and Store-signed packages are not supported.

## Common Questions

**Which toolset version do I need?** `toolsets.winCodeSign` can be any modern bundle `>= 1.0.0` (e.g. `1.0.0`, `1.1.0`, or `1.3.0`). Only an unset toolset or the legacy `0.0.0` bundle (`winCodeSign-2.6.0`, which lacks the required SDK) is rejected.

**Can I build MSIX on Linux?** No. Use Windows, or macOS with Parallels Desktop.

**Why is my multi-arch `.msixbundle` named with one architecture?** Bundle and upload artifacts span all built architectures; a custom `artifactName` containing `${arch}` will still render a single architecture token. Prefer an `artifactName` without `${arch}` for bundles.

**Does MSIX support auto-update via electron-updater?** Yes, opt-in and beta: set `msix.electronUpdaterAware: true` — see [Auto-Updates](#auto-updates) above.

**Why does `MsixUpdater` do nothing?** It stays inactive unless every one of the [updater requirements](#updater-requirements) holds — except a missing manifest key, which fails the download instead — and logs the first one that does not. Typical causes: a release built without `electronUpdaterAware`, an Electron version outside the supported range, a package installed in development mode or not signed with a trusted certificate, and an install managed by App Installer.

**What do the HRESULTs in `ERR_UPDATER_MSIX_STAGING_FAILED` mean?** The message ends with Windows' error text and, in parentheses, the HRESULT as a signed decimal number. Look up that trailing number: the text before it may mention another, inner error code.

- `0x80073CFB` (`-2147009285`) — this version is already installed with different contents: give every release a new 4-part version.
- `0x80073D06` (`-2147009274`) — a higher version is installed, and the update was staged without `ForceUpdateFromAnyVersion`: a downgrade needs `allowDowngrade`.
- `0x80073CF3` (`-2147009293`) — the update conflicts with the installed package, for example a single `.msix` offered to an install made from a `.msixbundle`.
- `0x800B0109` (`-2146762487`) — the certificate that signed the update is not trusted on this machine: import it into Trusted People, or use a certificate that chains to a trusted root.

## Configuration

{!./app-builder-lib.Interface.MsixOptions.md!}
