---
title: "Mac App Store"
---

The top-level [mas](configuration.md) key contains a set of options instructing electron-builder on how it should build the MAS (Mac Application Store) target. Inherits all [macOS options](mac.md).

Use the `mas-dev` target (configured via the top-level `masDev` key) for local testing of MAS builds with a development provisioning profile.

## MAS vs. Direct Distribution

| Aspect | MAS Distribution | Direct Distribution (DMG) |
|---|---|---|
| Certificate | Mac App Distribution | Developer ID Application |
| Notarization | Not required (Apple handles it) | Required (macOS 10.15+) |
| Sandboxing | Mandatory | Optional |
| Update mechanism | Mac App Store | electron-updater |
| Revenue | Apple takes 30% (15% for small dev program) | 100% to you |
| Discovery | App Store search and browsing | Your own marketing |
| Review | Apple review (1-7 days) | Instant |
| macOS version support | As Apple dictates | You control |

## Prerequisites

### Certificates

You need a **Mac App Distribution** certificate (for signing the app) and a **Mac Installer Distribution** certificate (for signing the PKG submitted to App Store Connect). Both are issued from your [Apple Developer account](https://developer.apple.com/account/).

:::tip
For local testing with `mas-dev`, you use a **Development** provisioning profile and a standard developer certificate, not the distribution ones.
:::

### Provisioning Profile

MAS apps require a provisioning profile that:
- Lists the specific entitlements your app uses
- Is tied to your App ID and certificate

Create provisioning profiles at [developer.apple.com](https://developer.apple.com/account/resources/profiles/list).

```yaml
mas:
  provisioningProfile: build/MyApp_AppStore.provisionprofile
```

### App Sandbox

All MAS apps must be sandboxed. Add to your entitlements (`build/entitlements.mas.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Required for sandboxed MAS apps -->
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <!-- Allow JIT compilation -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <!-- Network access (if needed) -->
  <key>com.apple.security.network.client</key>
  <true/>
</dict>
</plist>
```

And `build/entitlements.mas.inherit.plist` for helper processes:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.inherit</key>
  <true/>
</dict>
</plist>
```

Point to these in your configuration:

```yaml
mas:
  entitlements: build/entitlements.mas.plist
  entitlementsInherit: build/entitlements.mas.inherit.plist
  provisioningProfile: build/MyApp_AppStore.provisionprofile
```

## Common MAS Entitlements

| Entitlement | Purpose |
|---|---|
| `com.apple.security.app-sandbox` | Required for MAS |
| `com.apple.security.network.client` | Outgoing network connections |
| `com.apple.security.network.server` | Incoming connections |
| `com.apple.security.files.user-selected.read-write` | Open/Save panels |
| `com.apple.security.files.downloads.read-write` | Downloads folder access |
| `com.apple.security.device.camera` | Camera |
| `com.apple.security.device.microphone` | Microphone |
| `com.apple.security.personal-information.contacts` | Contacts |
| `com.apple.security.personal-information.calendars` | Calendar |
| `com.apple.security.print` | Printing |
| `com.apple.security.automation.apple-events` | AppleScript/Apple Events |

## Testing with mas-dev

The `mas-dev` target produces a build signed with a development certificate and development provisioning profile — suitable for testing sandbox behavior on your machine without going through App Store review.

```yaml
masDev:
  provisioningProfile: build/MyApp_Dev.provisionprofile
  entitlements: build/entitlements.mas.plist
  entitlementsInherit: build/entitlements.mas.inherit.plist
```

Build the dev target:

```bash
electron-builder --mac mas-dev
```

## Building for the App Store

```bash
electron-builder --mac mas
```

This produces:
- `MyApp-<version>.pkg` — the package to upload to App Store Connect

## Submitting to App Store Connect

1. Open [App Store Connect](https://appstoreconnect.apple.com/)
2. Create your app listing (if new) under **My Apps → +**
3. Use **Transporter** (free, from the Mac App Store) or `xcrun altool` / `xcrun notarytool` to upload the `.pkg`
4. The uploaded build appears in App Store Connect after processing (usually a few minutes)
5. Select the build for your release and submit for review

## Common Review Rejection Reasons

- **Sandbox violations** — the app attempts to access files or resources not permitted by entitlements
- **Deprecated APIs** — using APIs Apple has removed or flagged (check release notes)
- **Missing privacy strings** — if you access camera/mic/location, `NSCameraUsageDescription` etc. must be in `Info.plist`
- **UI guidelines violations** — buttons, windows, or flows that don't match Human Interface Guidelines
- **Crash on launch** — always test the MAS build on a clean machine before submitting

## Configuration

{!./app-builder-lib.Interface.MasConfiguration.md!}
