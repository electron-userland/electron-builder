---
title: "macOS"
---

The top-level [mac](configuration.md) key contains a set of options instructing electron-builder on how it should build macOS targets. These options are applicable to any macOS target.

## macOS Target Overview

electron-builder supports several macOS distribution formats. Choose based on your distribution channel:

| Target | Best For | Signed? | Notarized? |
|---|---|---|---|
| `dmg` | Standard consumer distribution | Yes | Yes |
| `zip` | Update servers (electron-updater), minimal package | Yes | Yes |
| `pkg` | System-level installs, kernel extensions, launch daemons | Yes | Yes |
| `mas` | Mac App Store distribution | Yes (Mac App Distribution) | No (MAS handles it) |
| `mas-dev` | Local testing of MAS builds | Yes (Apple Development / Mac Developer) | No |
| `7z`, `tar.*` | Archive formats, custom CDN distribution | Optional | Optional |
| `dir` | Development/debugging — unpacked app | No | No |

The default targets are `zip` and `dmg` (both are required for Squirrel.Mac auto-update).

## Bundle ID

The `appId` property sets the [CFBundleIdentifier](https://developer.apple.com/documentation/bundleresources/information_property_list/cfbundleidentifier) for your macOS app. This is a critical identifier — set it explicitly:

```yaml
appId: "com.mycompany.myapp"
```

- Use reverse-DNS format: `com.yourcompany.appname`
- Must be unique in the Mac App Store if you intend to submit there
- Changing it after first release will break existing user data paths (NSUserDefaults, sandboxed containers, etc.)

## Architecture Support

electron-builder supports building for multiple CPU architectures:

| Architecture | CLI Flag | Description |
|---|---|---|
| `x64` | `--x64` | Intel 64-bit (traditional Mac) |
| `arm64` | `--arm64` | Apple Silicon (M1, M2, M3, M4) |
| `universal` | `--universal` | Fat binary containing both x64 and arm64 |

### Universal Binaries

A universal binary runs natively on both Intel and Apple Silicon Macs with no performance penalty:

```yaml
mac:
  target:
    - target: dmg
      arch: universal
```

**Universal binary options:**

- `mergeASARs` — merge x64 and arm64 ASAR archives into a single universal ASAR (`true` by default). Disable only if you have architecture-specific native modules that cannot be fat-binary merged.
- `singleArchFiles` — glob pattern for files that are single-arch and should NOT be merged (e.g., pre-built native binaries distributed only for one arch).
- `x64ArchFiles` — glob pattern for files that are x64-only. These are kept as x64 in the universal binary rather than being fat-binary merged.

In v27 these options live under `mac.universal` (a pass-through to [`@electron/universal`](https://github.com/electron/universal)) and only take effect when the target arch is `universal`:

```yaml
mac:
  universal:
    mergeASARs: true
    singleArchFiles: "**/*.node"   # keep native modules as separate arch files
```

### Recommended: Build Per-Arch on Correct Hardware

While cross-compilation is possible, the most reliable approach is to build `arm64` on Apple Silicon and `x64` on Intel (or use a matrix in CI). Universal builds work best when both arches are produced natively and then merged.

## Code Signing

macOS apps must be signed to avoid Gatekeeper warnings. See [Code Signing](features/code-signing/code-signing.md) for full setup.

:::note[v27: signing options moved under `mac.sign`]
In v27 every macOS signing option (`identity`, `entitlements`, `hardenedRuntime`, `type`, `provisioningProfile`, `binaries`, `requirements`, `timestamp`, …) lives inside a single `mac.sign` object (`sign.identity`, `sign.hardenedRuntime`, …); `signIgnore` is now `sign.ignore`. `electron-builder migrate-schema` rewrites the old flat keys automatically. The same structure applies to `mas` and `masDev`. See [v27 Breaking Changes → macOS signing](./migration/v27-breaking-changes.md#macos-signing--macsign).
:::

### Certificate Identity

Use `mac.sign.identity` to specify the signing certificate by name:

```yaml
mac:
  sign:
    identity: "Developer ID Application: My Company (TEAM1234AB)"
```

Or use environment variables — the recommended approach for CI:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=yourpassword
```

Set `mac.sign.identity: null` (or `mac.sign: null`) to skip signing entirely. Set `mac.sign.identity: "-"` to use an ad-hoc signature (app will only run on the machine that built it).

:::warning[Ad-hoc signing and Hardened Runtime]
If you disable code signing, you should also disable Hardened Runtime (`mac.sign.hardenedRuntime: false`), as the combination of no signing and enabled Hardened Runtime may prevent the app from launching.
:::

### Hardened Runtime

`mac.sign.hardenedRuntime` is required for notarization on macOS 10.15+. It restricts what the app can do — you may need entitlements to allow capabilities. The default is `true` for standard `darwin` builds and `false` for Mac App Store builds (`mas` / `mas-dev`).

## Entitlements

Entitlements are required when using Hardened Runtime and for notarization. Create `build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Required for JIT compilation (e.g., V8 in Electron) -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <!-- Required for unsigned executable memory (some Electron internals) -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <!-- Allow DYLD environment variables (debugging) — REMOVE for production -->
  <!-- <key>com.apple.security.cs.allow-dyld-environment-variables</key> -->
  <!-- <true/> -->
</dict>
</plist>
```

And `build/entitlements.mac.inherit.plist` for helper processes:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
</dict>
</plist>
```

electron-builder auto-detects `build/entitlements.mac.plist` and `build/entitlements.mac.inherit.plist` when present. To point at custom paths, set them under `mac.sign`:

```yaml
mac:
  sign:
    entitlements: build/entitlements.mac.plist
    entitlementsInherit: build/entitlements.mac.inherit.plist
```

Common entitlements for Electron apps:

| Entitlement | When Needed |
|---|---|
| `com.apple.security.cs.allow-jit` | Always — V8 requires JIT |
| `com.apple.security.cs.allow-unsigned-executable-memory` | Some Electron internals |
| `com.apple.security.network.client` | Outgoing network connections (sandboxed apps) |
| `com.apple.security.network.server` | Listening for connections (sandboxed apps) |
| `com.apple.security.files.user-selected.read-write` | Open/save panels (sandboxed apps) |
| `com.apple.security.device.camera` | Camera access |
| `com.apple.security.device.microphone` | Microphone access |
| `com.apple.security.app-sandbox` | Required for Mac App Store — see [MAS](mas.md) |

:::info[Entitlements and Notarization]
Notarization requires Hardened Runtime + appropriate entitlements. See [Notarization](features/code-signing/notarization.md) for the complete notarization workflow.
:::

## Info.plist Customization

Inject arbitrary `Info.plist` keys using `extendInfo`:

```yaml
mac:
  extendInfo:
    NSMicrophoneUsageDescription: "This app uses the microphone for..."
    NSCameraUsageDescription: "This app uses the camera for..."
    LSMultipleInstancesProhibited: true
    CFBundleURLTypes:
      - CFBundleURLSchemes:
          - myapp
        CFBundleURLName: "com.mycompany.myapp"
```

## Helper Bundle IDs

Electron spawns several helper processes, each with its own bundle ID. electron-builder sets these automatically based on your `appId`, but you can override them:

| Option | Default | Process |
|---|---|---|
| `helperBundleId` | `${appId}.helper` | Generic helper |
| `helperRendererBundleId` | `${appId}.helper.Renderer` | Renderer process |
| `helperPluginBundleId` | `${appId}.helper.Plugin` | Plugin helper |
| `helperGPUBundleId` | `${appId}.helper.GPU` | GPU process |
| `helperEHBundleId` | `${appId}.helper.EH` | Exception handler |
| `helperNPBundleId` | `${appId}.helper.NP` | NP helper |

You only need to override these if you have a specific naming requirement (e.g., for provisioning profiles that enumerate each helper ID explicitly).

## Other Common Options

**Dark mode:** Set `darkModeSupport: true` if your app supports the system dark mode. This adds the `NSRequiresAquaSystemAppearance: false` key to `Info.plist`.

**Minimum system version:** `minimumSystemVersion` sets the `LSMinimumSystemVersion` in `Info.plist`. Electron itself has a minimum macOS version requirement — don't set this lower than Electron's requirement.

**Signing additional binaries:** Use `mac.sign.binaries` to list paths to additional native binaries within your app bundle that need to be signed (e.g., embedded CLIs, helper tools).

```yaml
mac:
  sign:
    binaries:
      - Contents/MacOS/my-native-helper
      - Contents/Frameworks/MyFramework.framework/Versions/A/MyFramework
```

**Product / executable name validation:** As of v27, electron-builder rejects a `productName` or `executableName` that would require filename sanitization (so the generated `<Name> Helper.app` bundles stay consistent with `CFBundleName` and Electron's helper discovery). If a build fails with an "is not a valid macOS app bundle name" error, choose a name that needs no sanitization.

## Configuration

{!./app-builder-lib.Interface.MacConfiguration.md!}
