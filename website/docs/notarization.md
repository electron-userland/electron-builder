# macOS Notarization

Notarization is Apple's security service that scans your app for malicious software before distribution. Starting with macOS 10.15 (Catalina), apps distributed outside the Mac App Store **must** be notarized or Gatekeeper will block them.

## Notarization vs. Code Signing

These are two separate steps, both required:

| Step | What it does | Required since |
|---|---|---|
| **Code signing** | Proves the app came from you and wasn't modified | macOS 10.8 (Mountain Lion) |
| **Notarization** | Apple scans your app for malware; issues a ticket | macOS 10.15 (Catalina) |
| **Stapling** | Attaches the notarization ticket to the app bundle | Recommended (enables offline verification) |

electron-builder handles all three steps automatically when configured.

## Prerequisites

Before notarizing, you need:

1. An active **Apple Developer Program** membership ($99/year)
2. A **Developer ID Application** certificate (not Mac App Store)
3. **Hardened Runtime** enabled in your build configuration
4. Required **entitlements** set (see below)
5. Authentication credentials (Apple ID + app-specific password, or API key)

## Enabling Notarization

```yaml
mac:
  notarize: true
  sign:
    hardenedRuntime: true
    entitlements: build/entitlements.mac.plist
    entitlementsInherit: build/entitlements.mac.inherit.plist
```

:::note[v27]
`notarize` stays on `mac`, but the signing options (`hardenedRuntime`, `entitlements`, `entitlementsInherit`) moved under `mac.sign` in v27. See [macOS signing](./migration/v27-breaking-changes.md#macos-signing-macsign).
:::

### Authentication — Option A: Apple ID

Create an app-specific password at [appleid.apple.com](https://appleid.apple.com) (do **not** use your Apple ID password directly).

Set these environment variables:

```bash
APPLE_ID=you@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=ABCDE12345
```

### Authentication — Option B: App Store Connect API Key (Recommended for CI)

API keys don't expire and don't require two-factor authentication, making them ideal for CI.

1. Go to [App Store Connect → Users and Access → Keys](https://appstoreconnect.apple.com/access/integrations/api)
2. Create a new key with "Developer" role
3. Download the `.p8` file (only downloadable once)
4. Note the **Key ID** and **Issuer ID**

Then set the following environment variables:

```bash
# base64-encode the .p8 file for use as a CI secret
APPLE_API_KEY=<base64-encoded-p8-content>
APPLE_API_KEY_ID=KEYID
APPLE_API_ISSUER=your-issuer-id
APPLE_TEAM_ID=ABCDE12345
```

### Authentication — Option C: Keychain Profile (stored credentials)

If you have previously stored notarization credentials via `xcrun notarytool store-credentials`, reference them by profile name:

```bash
APPLE_KEYCHAIN_PROFILE=my-notarization-profile
APPLE_KEYCHAIN=/path/to/keychain.keychain-db  # optional; defaults to system keychain
```

This approach requires credentials to be pre-stored on the build machine and is not suitable for ephemeral CI environments.

## Hardened Runtime Requirements

Notarization requires **Hardened Runtime** (`mac.sign.hardenedRuntime: true`). This restricts what your app process can do unless you explicitly declare entitlements.

Modern Electron needs exactly one exception, and electron-builder grants it by default — **no entitlements file is required to notarize a stock Electron app**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
</dict>
</plist>
```

Write that to `build/entitlements.mac.plist` only if you need to add capabilities of your own; your file replaces the default rather than extending it, so keep `com.apple.security.cs.allow-jit` in it.

Do **not** add `com.apple.security.cs.allow-unsigned-executable-memory` out of habit. It was needed by Electron versions from the 2019 era, is deprecated by Apple on macOS 14+, and weakens the Hardened Runtime for no benefit on current Electron.

Leave `build/entitlements.mac.inherit.plist` absent unless you truly need it. Without it, each nested binary is signed with [`@electron/osx-sign`](https://github.com/electron/osx-sign)'s per-file defaults, which mirror Chromium's own entitlements — renderer and GPU helpers get only `allow-jit`, and the looser exceptions go to the plugin helper alone. Supplying the file applies one plist to every nested binary instead.

### Common Entitlements

| Entitlement | When Needed |
|---|---|
| `com.apple.security.cs.allow-jit` | Required by Electron (V8 JIT) — granted by default |
| `com.apple.security.cs.allow-unsigned-executable-memory` | Legacy Electron only — deprecated on macOS 14+, not needed by modern V8 |
| `com.apple.security.cs.disable-library-validation` | Loading frameworks/native modules signed by another team, or unsigned |
| `com.apple.security.network.client` | Outbound network access |
| `com.apple.security.network.server` | Incoming connections |
| `com.apple.security.files.user-selected.read-write` | Read/write files the user selects |
| `com.apple.security.files.downloads.read-write` | Read/write the Downloads folder |
| `com.apple.security.device.camera` | Camera access |
| `com.apple.security.device.microphone` | Microphone access |
| `com.apple.security.personal-information.location` | Location services |

## Notarization in GitHub Actions

```yaml
jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Build, sign, and notarize
        run: npx electron-builder --mac
        env:
          CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Required GitHub Secrets

| Secret | Value |
|---|---|
| `MAC_CSC_LINK` | Base64-encoded `.p12` certificate |
| `MAC_CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Your 10-character team ID (e.g., `ABCDE12345`) |

## How Stapling Works

After notarization, Apple returns a "ticket" that confirms your app was approved. electron-builder automatically **staples** this ticket to the app bundle — meaning the notarization check can succeed even without an internet connection.

Stapling is performed automatically when `notarize: true`. You don't need to configure anything extra.

## Testing Notarization

After building, verify the notarization status:

```bash
# Check Gatekeeper assessment (simulates what macOS does on first launch)
spctl --assess --verbose --type exec dist/mac/MyApp.app

# Should output:
# dist/mac/MyApp.app: accepted
# source=Notarized Developer ID

# Check that the stapling ticket is attached
xcrun stapler validate dist/mac/MyApp.app
# Should output: The validate action worked!

# Check code signature
codesign --verify --deep --strict --verbose=2 dist/mac/MyApp.app
```

## Troubleshooting

**"The software certificate used to sign this application is not trusted on this machine"**
: Your Developer ID certificate is not in the system keychain or hasn't been trusted. Verify `CSC_LINK` points to a valid Developer ID certificate — electron-builder imports and configures the certificate automatically.

**Notarization hangs indefinitely**
: Apple's notarization service may be slow. electron-builder polls for completion. If it consistently times out, check your network connection and Apple's [developer system status](https://developer.apple.com/system-status/).

**"Package Invalid: the binary is not signed with a valid Developer ID certificate"**
: You used a Mac App Store certificate for direct distribution, or vice versa. Direct distribution requires a "Developer ID Application" certificate, not "Apple Distribution."

**"App can't be opened because Apple cannot check it for malicious software"**
: Notarization succeeded but the app wasn't stapled, or the user opened the app before stapling completed. Run `xcrun stapler validate` to check. Rebuild with electron-builder to get a properly stapled app.

**"com.apple.security.cs.allow-jit entitlement required"**
: Add the JIT entitlement to your `entitlements.mac.plist`. See the entitlements section above.

**Notarization rejected: "The executable does not have the Hardened Runtime enabled"**
: Set `mac.sign.hardenedRuntime: true` in your mac configuration.

**"Invalid Info.plist (plist or signature have wrong format)"**
: All binaries inside the app bundle must be signed. This often happens with third-party native modules or bundled binaries. Ensure `asar.unpack` is set for any `.node` files and that all binaries are signed before creating the final distributable. Use a custom `afterSign` hook if you need to sign additional binaries.

## Related Pages

- [macOS Code Signing](features/code-signing/code-signing-mac.md) — exporting certificates, keychain management, disabling signing
- [Code Signing Overview](features/code-signing/code-signing.md) — environment variables, CI setup, certificate types
- [macOS Configuration](mac.md) — entitlements, Hardened Runtime, bundle ID setup
- [GitHub Actions](features/github-actions.md) — full workflow examples
