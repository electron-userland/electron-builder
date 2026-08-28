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
| Required toolset | any | `winCodeSign` ≥ `1.0.0` |

If you are starting fresh, prefer **MSIX**. AppX remains for backward compatibility.

## When to Use MSIX

Choose MSIX when:

- **Windows Store distribution** — your app will be listed in the Microsoft Store.
- **Enterprise sideloading** — IT manages app distribution via MDM/Intune without the Store.
- **Windows 10S / Windows SE** — these locked-down editions only run Store-packaged apps.
- **You need modern packaging features** — package integrity, bundled architectures, or registered Windows services.

For standard consumer distribution with self-managed auto-updates, [NSIS](nsis.md) is simpler. For enterprise deployment without the Store, [MSI](msi.md) is often preferred.

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
  createMsixbundle: true     # combine architectures into one .msixbundle. Default: true (when >1 arch)
  createMsixupload: true     # produce a .msixupload for Partner Center submission. Default: false
```

- A `.msixbundle` is produced only when more than one architecture is built and `createMsixbundle` is not `false`.
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

MSIX auto-updates are handled by the Microsoft Store (or your App Installer `.appinstaller` flow), **not** by electron-updater. For self-managed auto-updates outside the Store, use [NSIS](nsis.md) instead.

## Common Questions

**Which toolset version do I need?** `toolsets.winCodeSign` can be any modern bundle `>= 1.0.0` (e.g. `1.0.0`, `1.1.0`, or `1.3.0`). Only an unset toolset or the legacy `0.0.0` bundle (`winCodeSign-2.6.0`, which lacks the required SDK) is rejected.

**Can I build MSIX on Linux?** No. Use Windows, or macOS with Parallels Desktop.

**Why is my multi-arch `.msixbundle` named with one architecture?** Bundle and upload artifacts span all built architectures; a custom `artifactName` containing `${arch}` will still render a single architecture token. Prefer an `artifactName` without `${arch}` for bundles.

**Does MSIX support auto-update via electron-updater?** No — see [Auto-Updates](#auto-updates) above.

## Configuration

{!./app-builder-lib.Interface.MsixOptions.md!}
