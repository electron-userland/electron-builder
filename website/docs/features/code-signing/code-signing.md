# Code Signing

Code signing proves your application's identity and confirms it hasn't been tampered with since it was signed. Without it, operating systems display security warnings — or block the app entirely.

## Why Code Signing Matters

| Platform | Without Signing | With Signing |
|---|---|---|
| macOS | Gatekeeper blocks app; user must override in System Preferences | Runs normally; no warning |
| Windows | SmartScreen warning on first run ("Unknown publisher") | Trusted install; SmartScreen learns from reputation |
| Windows (EV cert) | N/A | Instant trust, no reputation period needed |

On **macOS 10.15+**, notarization is additionally required for apps distributed outside the Mac App Store. An app that is code-signed but not notarized will be blocked by Gatekeeper unless the user explicitly overrides it.

## Platform Requirements Matrix

| Platform | Signing Required? | Certificate Type | Notarization? |
|---|---|---|---|
| macOS (direct distribution) | Yes (Gatekeeper) | Developer ID Application | Yes (10.15+) |
| macOS (Mac App Store) | Yes | Apple Distribution / Mac App Distribution | No (Apple signs on submission) |
| Windows | Recommended | OV or EV certificate | No |
| Windows (Azure) | Recommended | Azure Trusted Signing | No |

## Certificate Types

### macOS

| Certificate | Use Case | Where to Get |
|---|---|---|
| Developer ID Application | Direct distribution (DMG, ZIP, PKG) | Apple Developer Program ($99/year) |
| Developer ID Installer | PKG files for direct distribution | Apple Developer Program |
| Apple Distribution | Mac App Store | Apple Developer Program |
| Mac App Distribution | Mac App Store (app bundle signing) | Apple Developer Program |
| Apple Development / Mac Developer | Local testing, mas-dev target | Apple Developer Program |

All Apple certificates require membership in the [Apple Developer Program](https://developer.apple.com/programs/).

### Windows

| Certificate Type | Trust | CI/CD Compatible | Notes |
|---|---|---|---|
| Standard OV Certificate | After reputation builds (days-weeks) | Yes (exportable `.pfx`) | Most common choice |
| EV (Extended Validation) Certificate | Immediate | Yes, via a hardware-token method | Key bound to a hardware dongle/HSM; not exportable to a file |
| Azure Trusted Signing | Immediate | Yes | Microsoft's cloud signing service; see [code-signing-win.md](code-signing-win.md) |

For Windows, purchase from any major CA (DigiCert, Sectigo, SSL.com). See [Get a Code Signing Certificate](https://msdn.microsoft.com/windows/hardware/drivers/dashboard/get-a-code-signing-certificate) (select "Microsoft Authenticode" platform).

electron-builder picks the signing backend from the `type` field of `win.sign`: a certificate file or the Windows store (`signtool`, the default), a hardware token (`hsm` on Windows, `pkcs11` on macOS/Linux), or cloud signing (`azure`). An EV or other non-exportable key works in CI through the `hsm`, `pkcs11`, or `azure` methods. See [Windows Code Signing](code-signing-win.md) for full configuration.

:::note[Gatekeeper and Apple certificates]
macOS Gatekeeper only recognizes [Apple-issued certificates](https://developer.apple.com/support/code-signing/). Third-party certificates cannot be used to sign macOS apps for Gatekeeper.
:::

## Environment Variables

electron-builder reads signing credentials from environment variables. **Never commit certificates or passwords to source control** — always inject them via CI secrets.

### Shared / macOS Variables

| Variable | Description |
|---|---|
| `CSC_LINK` | HTTPS URL, `file://` path, local path, or base64-encoded `.p12`/`.pfx` file |
| `CSC_KEY_PASSWORD` | Password to decrypt the certificate at `CSC_LINK` |
| `CSC_NAME` | *macOS only.* Certificate identity name from keychain. Useful when multiple identities exist on a dev machine |
| `CSC_IDENTITY_AUTO_DISCOVERY` | `true` (default) / `false`. On macOS, automatically selects a valid identity from the keychain |
| `CSC_KEYCHAIN` | Keychain name. Used when `CSC_LINK` is not set. Defaults to the system default keychain |

### macOS Installer (PKG) Variables

| Variable | Description |
|---|---|
| `CSC_INSTALLER_LINK` | Certificate for signing PKG installer files (requires Developer ID Installer certificate) |
| `CSC_INSTALLER_KEY_PASSWORD` | Password for the installer certificate |

### Windows-Specific Variables

| Variable | Description |
|---|---|
| `WIN_CSC_LINK` | Windows certificate path or base64 string. Falls back to `CSC_LINK` if unset |
| `WIN_CSC_KEY_PASSWORD` | Password for the Windows certificate. Falls back to `CSC_KEY_PASSWORD` if unset |

:::tip[Building Windows on macOS]
When cross-compiling Windows on macOS, use `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` to provide a separate Windows certificate while keeping your macOS certificate in `CSC_LINK`.
:::

### Azure Trusted Signing Variables

| Variable | Description |
|---|---|
| `AZURE_TENANT_ID` | Azure AD Tenant ID |
| `AZURE_CLIENT_ID` | Application (Client) ID of your App registration |
| `AZURE_CLIENT_SECRET` | Secret value for your App registration |

See [Windows Code Signing](code-signing-win.md#using-azure-trusted-signing) for full Azure Trusted Signing setup.

## Encoding a Certificate for CI

Most CI systems inject certificates as base64-encoded environment variables:

```bash
# macOS
base64 -i your-certificate.p12 -o /tmp/cert_encoded.txt
cat /tmp/cert_encoded.txt   # copy this value into your CI secret

# Linux
base64 your-certificate.p12 > /tmp/cert_encoded.txt
cat /tmp/cert_encoded.txt
```

Then set `CSC_LINK` to the base64 string (no file URL needed):

```
CSC_LINK=<the-base64-string>
CSC_KEY_PASSWORD=your-password
```

:::warning[Windows environment variable length limit]
Windows cannot handle environment variable values longer than 8192 characters. If your base64-encoded certificate exceeds this limit, re-export it **without** including intermediate certificates in the chain (uncheck "Include all certificates in the certification path" in the Certificate Manager wizard).
:::

## GitHub Actions Setup

### macOS Signing

```yaml
jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and sign
        run: npx electron-builder --mac
        env:
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

For a complete GitHub Actions workflow including publishing, see [GitHub Actions](../github-actions.md).

### Windows Signing

```yaml
jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and sign
        run: npx electron-builder --win
        env:
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```

## The `forceCodeSigning` Option

```yaml
forceCodeSigning: true
```

When `true`, the build **fails** if no valid signing identity can be found. Use this in CI to catch misconfigured secrets early rather than shipping an unsigned build.

Without this option, electron-builder proceeds without signing if no credentials are provided — which can result in silently unsigned production builds.

## Platform-Specific Guides

- **[macOS Code Signing](code-signing-mac.md)** — exporting certificates, keychain setup, disabling signing, ad-hoc signing
- **[Windows Code Signing](code-signing-win.md)** — OV vs. EV certificates, Azure Trusted Signing setup
- **[macOS Notarization](notarization.md)** — notarizing apps for macOS 10.15+, Hardened Runtime requirements

## Troubleshooting

**"No identity found"** (macOS)
: No valid Developer ID certificate is in the keychain. Check that you have an active Apple Developer Program membership and that the certificates are correctly exported.

**"The certificate is not valid for use"** (macOS)
: The certificate is expired or revoked. Renew it in the Apple Developer portal.

**"CSSMERR_TP_CERT_REVOKED"** (macOS CI)
: The certificate was revoked. Also check that the keychain has been unlocked before signing.

**"Publisher name does not match"** (Windows AppX)
: The `publisher` in `appx` config must exactly match the Subject of the certificate. Copy it from the certificate properties.

**SmartScreen warning appears even after signing** (Windows)
: Normal for standard OV certificates. SmartScreen trust builds over time based on download count. EV certificates skip this reputation period. See [Windows Code Signing](code-signing-win.md).

**"Command requires admin privileges"** (Windows)
: Some signing tools require elevated permissions. Run from an elevated prompt or check CI runner permissions.

**Build fails silently with unsigned output**
: Set `forceCodeSigning: true` to convert missing signing credentials from a silent warning into a build failure.
