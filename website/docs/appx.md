The top-level [appx](configuration.md) key contains set of options instructing electron-builder on how it should build AppX packages for the Windows Store or enterprise sideloading.

All options are optional. All required AppX configuration is inferred and computed automatically.

## When to Use AppX

AppX is the packaging format for the Microsoft Store (also called MSIX). Choose AppX when:

- **Windows Store distribution** — your app will be listed in the Microsoft Store
- **Enterprise sideloading** — IT manages app distribution via MDM/Intune without the Store
- **Windows 10S / Windows SE** — these locked-down Windows editions only run Store apps

For standard consumer distribution, [NSIS](nsis.md) is simpler. For enterprise deployment without the Store, [MSI](msi.md) is often preferred.

## AppX vs. NSIS vs. MSI

| Aspect | AppX | NSIS | MSI |
|---|---|---|---|
| Windows Store | Yes | No | No |
| Sideloading | Yes (signed) | N/A | N/A |
| Enterprise MDM | Limited | No | Yes |
| Sandboxed | Partial | No | No |
| Auto-update | Store only (not electron-updater) | electron-updater | Not supported via electron-updater |
| Code signing | Required (or Store) | Recommended | Recommended |

## Code Signing {#appx-package-code-signing}

- **Store distribution** — no manual signing needed. The Windows Store signs the package with a Microsoft certificate during the submission process.
- **Sideloading / enterprise** — the AppX must be signed with a trusted certificate. See [Windows Code Signing](features/code-signing/code-signing-win.md).

For self-signed certificates during development, see [Microsoft's self-signed certificate guide](https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing).

## AppX Assets

AppX requires specific logo/icon assets. Place them in the `appx` folder inside your [build resources](configuration.md) directory (default: `build/appx/`):

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

Default assets are used for the required logos if you don't provide your own. Scale variants (e.g., `Square44x44Logo.scale-200.png`) are supported — see [Microsoft's tile asset guidelines](https://docs.microsoft.com/en-us/windows/uwp/controls-and-patterns/tiles-and-notifications-app-assets).

## Identity and Publisher

```yaml
appx:
  applicationId: "MyApp"                       # must be alphanumeric, no spaces
  identityName: "MyCompany.MyApp"              # unique within the Store
  publisher: "CN=My Company, O=My Company, C=US"  # must match certificate Subject
  publisherDisplayName: "My Company"
  displayName: "My Application"               # displayed in Start menu
```

:::warning[Publisher Must Match Certificate]
The `publisher` value must exactly match the Subject field of your code signing certificate. Mismatches cause installation failures.
:::

## Capabilities

AppX apps declare the system capabilities they use. Specify capabilities in `appx.capabilities`:

```yaml
appx:
  capabilities:
    - runFullTrust                  # default — allows unrestricted execution
    - internetClient               # outbound internet access
    - privateNetworkClientServer   # local network
    - webcam                       # camera access
    - microphone                   # microphone access
```

`runFullTrust` is required for most Electron apps (included by default). The full list of capabilities is in [Microsoft's documentation](https://docs.microsoft.com/en-us/windows/uwp/packaging/app-capability-declarations).

## Tile Customization

```yaml
appx:
  backgroundColor: "#2c2c2c"    # tile background color (CSS color)
  showNameOnTiles: false        # show app name on tile (default: false)
```

## Language Support

```yaml
appx:
  languages:
    - en-US
    - de-DE
    - fr-FR
    - ja-JP
```

Declare which languages your app supports. This affects Store listings and localized resources.

## Version Targeting

```yaml
appx:
  minVersion: "10.0.17763.0"       # Windows 10 1809 minimum
  maxVersionTested: "10.0.22621.0" # Windows 11 22H2 tested maximum
```

## Auto-Launch Extension

```yaml
appx:
  addAutoLaunchExtension: false    # Default: false
```

When `true`, adds a startup task extension that runs the app on user login. Requires the `runFullTrust` capability.

## Custom Manifest

For advanced scenarios, provide a completely custom AppX manifest:

```yaml
appx:
  customManifestPath: build/AppxManifest.xml
```

Or inject additional XML extensions:

```yaml
appx:
  customExtensionsPath: build/appx-extensions.xml
```

## Publishing to the Windows Store

1. Create a [Microsoft Developer account](https://developer.microsoft.com/en-us/store/register/) ($19 one-time fee)
2. Reserve your app name in [Partner Center](https://partner.microsoft.com/en-us/dashboard/windows/overview)
3. Build your AppX: `electron-builder --win appx`
4. Test the package locally (see Testing below)
5. Upload the `.appx` file via Partner Center submission
6. Complete the submission (age rating, pricing, screenshots, etc.)
7. Wait for Store certification (typically 1-3 business days)

## Sideloading Without the Store

For enterprise distribution without the Store:

```powershell
# Enable sideloading (Windows 10 1803+, this is the default)
# On Windows 10 S/SE, you must use the Store

# Install the AppX
Add-AppxPackage -Path ".\MyApp-1.0.0.appx"
```

If using a self-signed certificate, the user must trust it first (see "Common Questions" below).

## Testing Locally

```powershell
# Install locally (Developer Mode must be enabled for unsigned packages)
Add-AppxPackage -Path ".\MyApp-1.0.0.appx"

# Uninstall
Get-AppxPackage | Where-Object {$_.Name -like "*MyApp*"} | Remove-AppxPackage
```

## Common Questions

**How do I install an AppX with a self-signed certificate?**

Import the certificate into "Trusted People" on the target machine — see [Microsoft's guide to signing MSIX packages](https://learn.microsoft.com/en-us/windows/msix/package/sign-app-package-using-signtool). Then install the AppX normally with `Add-AppxPackage`.

**Does AppX support auto-updates without the Store?**

No — AppX auto-updates are handled by the Windows Store only. electron-updater does not support AppX packages. For auto-updates outside the Store, use NSIS instead.

## Configuration

{!./app-builder-lib.Interface.AppXOptions.md!}
