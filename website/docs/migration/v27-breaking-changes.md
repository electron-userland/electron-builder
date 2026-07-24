---
title: "v27 Breaking Changes"
---

# v27 Breaking Changes

:::danger[Read this before upgrading to v27]
v27 moves the entire electron-builder ecosystem to **native ES modules**, raises the minimum runtime to **Node.js 22.12.0**, and **hard-deletes the deprecated APIs** that accumulated since v22. Every breaking change in the release is catalogued on this page.

**Most projects need only a Node.js bump plus one command.** Run the automated migrator and follow the step-by-step **[migration walkthrough →](./v26-to-v27)**.
:::

This page is the **canonical reference for _what_ changed** in v27. For the **_how_ — the ordered upgrade steps, the automated migrator, and the checklist** — see the [v26 → v27 migration walkthrough](./v26-to-v27).

- The `build()` API and the **runtime behavior** of your configuration are unchanged; configuration keys that were renamed or restructured are rewritten automatically by `migrate-schema` (see each entry below), and exported types that survive keep their shape.
- CJS `require()` continues to work without code changes on supported Node.js versions.
- Every **config-level** breaking change below is rewritten automatically by `electron-builder migrate-schema` (look for the **Auto** ✓ marker). Runtime, CLI, env-var, and behavior changes require manual action.

:::tip[Run the automated migrator first]
```bash
electron-builder migrate-schema            # apply changes in place
electron-builder migrate-schema --dry-run  # preview only
```
This handles every change marked **Auto ✓** below. See the [walkthrough](./v26-to-v27#step-1-run-the-automated-migrator) for flags and serialization caveats.
:::

:::info[Toolsets now default to the newest bundle (`"latest"`)]
In v27 every `toolsets.*` property defaults to **`"latest"`** — an **unset** property, `null`, and the literal `"latest"` all resolve to the **newest published bundle** for that toolset (previously each property defaulted to a fixed pinned version). No config change is required, but the effective defaults moved:

- **`wine` → `1.0.1`** — Wine 11.0 (was Wine 4.0.1); macOS arm64 via Rosetta. Linux still uses host-installed `wine`.
- **`winCodeSign` → `1.3.0`** — Windows Kits 10.0.26100.0, `osslsigncode` 2.11 (native arm64), and the Azure Trusted Signing `dlib` + .NET 8 payload.
- **`appimage` → `1.1.0`** — static FUSE3-compatible runtime; adds `unsquashfs` support.
- `icons` → `1.2.1` — newer `wasm-vips` / `@resvg/resvg-wasm` bundle (was `1.1.0`).
- `nsis` (`1.2.1`), `fpm` (`2.2.1`), `linuxToolsMac` (`1.0.0`), and `sevenZip` (`1.0.0`) are unchanged.

To stay on a legacy bundle, pin the toolset to `"0.0.0"`. Because `winCodeSign` now defaults to `1.3.0`, **Azure Trusted Signing uses the faster `signtool /dlib` path out of the box**. Full breakdown in [Toolsets & environment variables](#toolsets-environment-variables).
:::

---

## Breaking changes at a glance

:::tip[Already ran `migrate-schema`?]
Rows marked **Auto ✓** are rewritten for you. For the shortlist of changes the migrator can **not** apply — the new defaults and runtime behaviors you may still trip over — see **[What's New in v27 → new defaults & behavior changes](./whats-new-v27#new-defaults-and-behavior-changes-you-may-trip-over)**.
:::

| Change | Auto | Action required |
|--------|:---:|----------------|
| [Node.js >=22.12.0 required](#nodejs-22120-required) | — | Update your runtime and CI Node version |
| [All packages are native ESM](#native-esm-output) | — | None — `require()` still works on Node >=22.12 |
| [`electron-forge-maker-*` are now ESM](#electron-forge-maker-plugins) | — | None — same API, same export shape |
| [`electronCompile` removed](#electroncompile) | ✓ | Remove from config; migrate off `electron-compile` |
| [`disableDefaultIgnoredFiles` removed](#disabledefaultignoredfiles) | ✓ | Removed automatically; re-include specific files via a `files` glob (e.g. `**/*.obj`) |
| [`framework` / `nodeVersion` / `launchUiVersion` removed](#framework-nodeversion-launchuiversion) | ✓ | Removed automatically (Electron is the only framework) |
| [ProtonFramework & LibUiFramework removed](#removed-exports) | — | Migrate to an Electron-based build setup |
| [`appImage.systemIntegration` removed](#appimagesystemintegration) | ✓ | Removed automatically |
| [`npmSkipBuildFromSource` removed](#npmskipbuildfromsource) | ✓ | Replaced by `nativeModules.buildDependenciesFromSource` |
| [Native-module options grouped under `nativeModules`](#native-module-options-nativemodules) | ✓ | `nativeRebuilder` → `rebuildMode` |
| [ASAR options consolidated under `asar`](#asar-options-asar) | ✓ | `asarUnpack` → `asar.unpack`, etc.; `asar: true` removed |
| [macOS signing consolidated under `mac.sign`](#macos-signing-macsign) | ✓ | `identity`/`entitlements`/`hardenedRuntime`/… → `mac.sign.*`; `signIgnore` → `sign.ignore` |
| [`mac.universal` options consolidated](#macuniversal) | ✓ | `mergeASARs`/`singleArchFiles`/`x64ArchFiles` → `mac.universal.*` |
| [Windows signing unified under `win.sign`](#windows-signing-winsign) | ✓ | Discriminated union `type: "signtool" \| "hsm" \| "pkcs11" \| "azure"` |
| [`win.signExecutable` / `win.signAndEditExecutable` removed](#winsignexecutable-winsignandeditexecutable-removed) | ✓ | `false` → `win.sign: false`; resource editing always runs |
| [`electronDownload` → `electronGet`](#electrondownload-electronget) | ✓ | Reshaped to `@electron/get` options; some legacy fields dropped (warned) |
| [`snap` config key removed](#snap-snapcraft) | ✓ | Restructured to `snapcraft` with an explicit `base` |
| [Root-level `directories` removed](#root-level-directories-in-packagejson) | ✓ | Move under `build.directories` |
| [`build.helper-bundle-id` removed](#buildhelper-bundle-id) | ✓ | Moved to `mac.helperBundleId` |
| [`squirrelWindows.noMsi` removed](#squirrelwindowsnomsi) | ✓ | Replaced by `msi` (inverted) |
| [`GithubOptions.vPrefixedTagName` removed](#githuboptions-gitlaboptions-vprefixedtagname) | ✓ | Use `tagNamePrefix` |
| [`GitlabOptions.vPrefixedTagName` retained](#githuboptions-gitlaboptions-vprefixedtagname) | — | None — still functional; the migrator leaves GitLab entries untouched |
| [`devMetadata` / `extraMetadata` in `PackagerOptions` removed](#devmetadata-extrametadata-programmatic-packageroptions) | — | Use `config` / `config.extraMetadata` |
| [Implicit `--publish` removed](#implicit-publish-removed) | — | Pass `--publish` explicitly |
| [`--em.build` / `--em.directories` CLI flags removed](#removed-flags-embuild-emdirectories) | — | Use `-c` / `-c.directories` |
| [`linux.syncDesktopName` removed](#linuxsyncdesktopname-always-synced) | ✓ | Removed automatically; behaviour is always on. If it was `false`, set `desktopName` to control the filename |
| [Linux maintainer-script EJS syntax removed](#linux-maintainer-script-ejs-template-syntax) | — | Use `${var}` instead of `<%= var %>` |
| [NSIS file-association ProgID format changed](#nsis-file-association-progid-format-changed) | — | Update custom NSIS scripts that hard-code the old ProgID |
| [Toolset defaults resolve to `"latest"`](#toolset-defaults-resolve-to-latest-newest-bundle) | — | No action; pin to `"0.0.0"` to restore a legacy bundle |
| [Toolset env-var overrides removed](#toolset-env-var-overrides-removed) | — | Replace `APPIMAGE_TOOLS_PATH`, `ELECTRON_BUILDER_NSIS_DIR`, `USE_SYSTEM_WINE`, … with `toolsets.X: { url, checksum }` |
| [`CI_BUILD_TAG` env var removed](#ci_build_tag-environment-variable) | — | Use `CI_COMMIT_TAG` |
| [Azure Trusted Signing `/dlib` is the default](#azure-trusted-signing-signtool-dlib-is-the-default) | — | Pin `winCodeSign` below `1.3.0` only to force the legacy PowerShell path |
| [New: `win.target: "msix"` (beta)](#new-msix-target-beta) | — | Optional, additive — the default `winCodeSign` works (only the legacy `0.0.0` bundle is rejected) |
| [`PlatformPackager.info` & `platformSpecificBuildOptions` now `protected`](#programmatic-plugin-author-api-changes) | — | Plugin authors: hard break — `.info` no longer compiles externally; use the new pass-through getters |
| [Linux `.desktop` `Exec` now runs a generated `*-launcher` script](#linux-launcher-entrypoint) | — | Update custom `.desktop`/AppArmor/MIME tooling that hard-codes the `Exec` command |
| [`node_modules` arch/os-filtered on every build](#node_modules-are-now-archos-filtered-on-every-build) | — | Awareness — packages whose `cpu`/`os` mismatch the target are now excluded |
| [`arch: "all"` now expands to x64 + arm64; 32-bit fails fast on Electron 44+](#arch-all-now-expands-to-x64-and-arm64-32-bit-fails-fast-on-electron-44) | — | `arch: "all"` drops `ia32` — request `ia32` explicitly; ia32/armv7l require `electronVersion` <= 43.x |
| [macOS `productName`/`executableName` validated, not silently sanitized](#macos-productname-and-executablename-are-validated-not-sanitized) | — | A name needing filename sanitization now throws — pick a name that needs none |
| [Bitbucket Cloud publishing: token without username → Bearer auth](#bitbucket-cloud-publishing-token-without-username-uses-bearer-auth) | — | Set `BITBUCKET_USERNAME` if your token is an app password / API token |
| [Redundant production `dependencies` excluded, not rejected](#redundant-production-dependencies-are-excluded-not-rejected) | — | `electron`/`electron-builder` are excluded from the copied `node_modules` (was a hard error); tune the set via `ignoredProductionDependencies`. If you set `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` (removed) to bundle `electron-builder`, override the list instead; `electron-prebuilt`/`electron-rebuild` no longer error and now ship if declared — remove them from `dependencies` |
| [DMG `filesystem` defaults to APFS](#dmg-filesystem-defaults-to-apfs) | — | Set `dmg.filesystem: "HFS+"` only if you need pre-10.13 macOS compatibility |
| [`disableWebInstaller` defaults to `true` (electron-updater)](#disablewebinstaller-defaults-to-true) | — | v27 warns but still downloads if you never set it; opt in with `disableWebInstaller: false` before v28 enforces it |
| [`latest*.yml` drops legacy top-level `path`/`sha512`](#latestyml-drops-legacy-top-level-pathsha512) | — | None for electron-updater >=2.16 (all modern clients); set `electronUpdaterCompatibility` to a legacy-inclusive range only if you still ship apps embedding electron-updater 1.x–2.15 |
| [`quitAndInstall` takes an options object (electron-updater)](#quitandinstall-takes-an-options-object) | — | Replace positional args: `quitAndInstall(true, false)` → `quitAndInstall({ isSilent: true, isForceRunAfter: false })` |
| [`autoInstallOnAppQuit` replaced by `autoInstallEvent` enum (electron-updater)](#autoinstallevent-replaces-autoinstallonappquit) | — | `autoInstallOnAppQuit = false` → `autoInstallEvent = "manual"`; default `"onQuit"` preserves behavior |
| [Renamed type exports (`ElectronDownloadOptions`, `WindowsAzureSigningConfiguration`, …)](#removed-exports) | — | Import the new names — no compat aliases |
| [`SnapOptions`, `ProtonFramework`, `LibUiFramework` exports removed](#removed-exports) | — | Use the `snapcraft` config shape / Electron framework |

---

## Runtime & ESM {#runtime-esm}

### Node.js >=22.12.0 required

v27 requires **Node.js 22.12.0 or later**. This is the version where Node's [`require(esm)`](https://nodejs.org/en/blog/release/v22.12.0) support was stabilized (no flags needed), which allows both CJS and ESM consumers to use these packages without any code changes.

```json
{
  "engines": {
    "node": ">=22.12.0"
  }
}
```

See the walkthrough for [updating your runtime, CI, and Docker images](./v26-to-v27#step-2-update-nodejs).

### Native ESM output

electron-builder packages now ship as native ES modules. On **Node >=22.12.0** both styles continue to work:

```js
// CJS require() — still works
const { build, Platform } = require("electron-builder")

// ESM import — now the preferred style
import { build, Platform } from "electron-builder"
```

If your project uses `"type": "module"` or ESM imports, no changes are needed. If it uses CJS on Node >=22.12, `require()` continues to work as before. The `build()` function signature, all configuration options, and all exported types are otherwise unchanged.

**`moduleResolution`** — v27 packages include `exports` maps and full TypeScript declarations. `"node"` (legacy), `"node16"`/`"nodenext"`, and `"bundler"` (recommended) all work.

### `electron-forge-maker-*` plugins {#electron-forge-maker-plugins}

The four Forge maker plugins (`electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`) are now native ES modules. The public API is identical — Electron Forge loads them via dynamic `import()` internally, so no config changes are required.

---

## Removed configuration options

### `electronCompile`

The `electronCompile` configuration option has been **removed**. `electron-compile` is an unmaintained library with no releases since 2019.

```json5
{ "build": { "electronCompile": true } }  // ← delete this line
```

If your project relies on `electron-compile` for source compilation, migrate to a modern build tool before upgrading:

- **[electron-vite](https://electron-vite.org/)** — recommended; fast, first-class ESM and Electron integration
- **[esbuild](https://esbuild.github.io/)** — extremely fast, minimal configuration
- **[webpack](https://webpack.electron.build/)** — mature, widely used

### `framework` / `nodeVersion` / `launchUiVersion` {#framework-nodeversion-launchuiversion}

These three fields are removed. Only Electron is supported as a target framework — `proton`/`proton-native` and `libui` support has been removed (see [Removed exports](#removed-exports)).

```json5
{
  "build": {
    "framework": "electron",    // ← delete; "electron" was and remains the default
    "nodeVersion": "current",   // ← delete; no effect
    "launchUiVersion": "0.1.0"  // ← delete; no effect
  }
}
```

### `disableDefaultIgnoredFiles`

The `disableDefaultIgnoredFiles` option has been **removed**. To include a file that is excluded by default (for example a Wavefront `.obj` 3D model, or any other default-excluded extension/name), add an explicit `files` glob that targets it — an explicit include now overrides the matching default exclusion:

```json5
{
  "build": {
    "disableDefaultIgnoredFiles": true,  // ← delete this line
    "files": [
      "**/*",
      "**/*.obj"  // ← add a glob for the default-excluded files you want to keep
    ]
  }
}
```

Broad patterns such as `**/*` still honor the defaults; only a pattern that names the extension or directory concretely opts it back in.

### `appImage.systemIntegration`

Removed. Desktop integration is handled automatically by [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher).

### `npmSkipBuildFromSource`

Removed. Use `buildDependenciesFromSource` (now under [`nativeModules`](#native-module-options-nativemodules)). It is the logical inverse:

```json5
// v26
{ "npmSkipBuildFromSource": true }
// v27 equivalent
{ "nativeModules": { "buildDependenciesFromSource": false } }
```

### `asar: true` sentinel

**`asar: true` is no longer valid.** Omit the `asar` key entirely to enable ASAR with defaults, or specify an object. The full ASAR restructuring is documented under [ASAR options → `asar`](#asar-options-asar).

```json5
{ "build": { "asar": true } }  // Before — enable with defaults
{ "build": { "asar": {} } }    // After — omit entirely (enabled by default) or use an object
```

### Root-level `directories` in `package.json`

Specifying `directories` at the root of `package.json` is removed. Move it under the `build` key.

```json
{ "name": "my-app", "directories": { "output": "dist" } }              // Before
{ "name": "my-app", "build": { "directories": { "output": "dist" } } } // After
```

### `build.helper-bundle-id`

The hyphenated root-level `helper-bundle-id` is removed. Use `mac.helperBundleId`.

```json5
{ "build": { "helper-bundle-id": "com.example.helper" } }            // Before
{ "build": { "mac": { "helperBundleId": "com.example.helper" } } }   // After
```

### `squirrelWindows.noMsi`

The `noMsi` boolean is removed in favor of its inverse, `msi`.

```json5
{ "build": { "squirrelWindows": { "noMsi": true } } }   // Before
{ "build": { "squirrelWindows": { "msi": false } } }    // After
```

### `GithubOptions` / `GitlabOptions` `vPrefixedTagName` {#githuboptions-gitlaboptions-vprefixedtagname}

The `vPrefixedTagName` boolean on `GithubOptions` is removed. Use `tagNamePrefix` to control the tag prefix.

```json5
{ "publish": { "provider": "github", "vPrefixedTagName": false } }   // Before
{ "publish": { "provider": "github", "tagNamePrefix": "" } }         // After (empty string = no prefix)
```

To keep the default `v` prefix, simply remove `vPrefixedTagName` — `tagNamePrefix` defaults to `"v"`.

:::note[`GitlabOptions.vPrefixedTagName` is **not** removed]
Only the **GitHub** field was removed. On **GitLab**, `vPrefixedTagName` is unchanged in v27 — it still exists in the type, the schema, and the runtime, and continues to control the tag prefix (`vPrefixedTagName: false` → `1.2.3`; omit it → `v1.2.3`). It has no `tagNamePrefix` equivalent, so `migrate-schema` leaves GitLab publish entries untouched. No action is required.
:::

### `linux.syncDesktopName` (always synced)

The `linux.syncDesktopName` flag is removed. The behaviour it gated is now **always on**: the installed `.desktop` filename is always derived from the `desktopName` field in `package.json` — installed as `${desktopName}.desktop`, with any trailing `.desktop` in the value stripped first — falling back to `executableName` only when `desktopName` is absent.

```json5
// Before (v26) — opt-in
{ "build": { "linux": { "syncDesktopName": true } } }  // ← delete this line
```

`migrate-schema` removes the flag automatically. No replacement is needed. If you had `syncDesktopName: false` (opting out of syncing in v26), the migrator warns you: the installed filename is now always derived from `desktopName`, so set (or omit) `desktopName` to control it.

**Why this changed:** Electron derives its `app_id` / `WM_CLASS` from `desktopName`, and desktop environments match a running window to its launcher entry by comparing `WM_CLASS` against the installed `.desktop` filename. When the two diverged — which is exactly what happened with `syncDesktopName: false` (the v26 default) whenever a `desktopName` was set — GNOME, KDE, and others failed to associate the window with its launcher, breaking taskbar grouping, dock icons, and launcher highlighting (see [#9103](https://github.com/electron-userland/electron-builder/issues/9103)). Removing the flag eliminates a footgun rather than removing functionality. Path-traversal/NUL validation on the resulting filename is unchanged.

### Linux maintainer-script EJS template syntax

The legacy `<%= varName %>` EJS interpolation in Linux maintainer scripts (e.g. FPM `after-install`/`after-remove`) is removed. Use shell-style `${varName}` instead.

### `devMetadata` / `extraMetadata` (programmatic `PackagerOptions`) {#devmetadata-extrametadata-programmatic-packageroptions}

These fields in the programmatic `PackagerOptions` API are removed (they have thrown `InvalidConfigurationError` since v22).

```ts
// Before
await build({ targets: Platform.MAC.createTarget(), devMetadata: { … }, extraMetadata: { … } })
// After
await build({ targets: Platform.MAC.createTarget(), config: { extraMetadata: { … } } })
```

---

## Restructured configuration

### Native-module options → `nativeModules` {#native-module-options-nativemodules}

Four root-level configuration properties are moved into a new `nativeModules` sub-key, and `nativeRebuilder` is renamed to `rebuildMode`.

```json5
// Before (v26)
{ "build": { "buildDependenciesFromSource": true, "nodeGypRebuild": false, "npmRebuild": true, "nativeRebuilder": "parallel" } }

// After (v27)
{ "build": { "nativeModules": { "buildDependenciesFromSource": true, "nodeGypRebuild": false, "npmRebuild": true, "rebuildMode": "parallel" } } }
```

`npmArgs` is **not** affected — it controls the package-manager install phase and remains at the root level. `npmSkipBuildFromSource` (deprecated in v26) is removed; `migrate-schema` converts it to its inverse, `nativeModules.buildDependenciesFromSource`.

### ASAR options → `asar` {#asar-options-asar}

All ASAR-related configuration is now nested under a single `asar` key. Flat root-level properties are removed. The `asar` type is now `AsarOptions | false | null`.

| Removed key | Replacement |
|---|---|
| `asar-unpack` | `asar.unpack` |
| `asar-unpack-dir` | `asar.unpack` |
| `asar.unpackDir` | `asar.unpack` |
| `asarUnpack` | `asar.unpack` |
| `disableSanityCheckAsar` | `asar.disableSanityCheck` |
| `disableAsarIntegrity` | `asar.disableIntegrity` |
| `asar: true` | *(removed — absence means enabled)* |

```json5
// Before
{ "build": { "asarUnpack": ["**/*.node"], "disableSanityCheckAsar": true, "disableAsarIntegrity": true } }

// After
{
  "build": {
    "asar": {
      "unpack": ["**/*.node"],
      "disableSanityCheck": true,
      "disableIntegrity": true
    }
  }
}
```

When `asar: false`, all the sub-options are irrelevant and the migrator skips them.

### macOS signing → `mac.sign` {#macos-signing-macsign}

All macOS code-signing options now live inside a single `sign` object on `mac` (and `mas` / `masDev`), mirroring the Windows `win.sign` grouping. `mac.sign` is typed as `CustomMacSign | ElectronSignOptions | string | null`, where `ElectronSignOptions` is a typed pass-through to [`@electron/osx-sign`](https://github.com/electron/osx-sign).

| Removed (`mac.*`) | Replacement (`mac.sign.*`) |
|---|---|
| `identity` | `sign.identity` |
| `entitlements` | `sign.entitlements` |
| `entitlementsInherit` | `sign.entitlementsInherit` |
| `entitlementsLoginHelper` | `sign.entitlementsLoginHelper` |
| `provisioningProfile` | `sign.provisioningProfile` |
| `type` | `sign.type` |
| `binaries` | `sign.binaries` |
| `requirements` | `sign.requirements` |
| `hardenedRuntime` | `sign.hardenedRuntime` |
| `gatekeeperAssess` | `sign.gatekeeperAssess` |
| `strictVerify` | `sign.strictVerify` |
| `preAutoEntitlements` | `sign.preAutoEntitlements` |
| `timestamp` | `sign.timestamp` |
| `additionalArguments` | `sign.additionalArguments` |
| `signIgnore` | `sign.ignore` *(renamed to the `@electron/osx-sign` canonical name)* |

```json5
// Before
{ "mac": { "identity": "Developer ID Application: My Company (TEAMID)", "hardenedRuntime": true, "signIgnore": ["**/*.txt"] } }

// After
{ "mac": { "sign": { "identity": "Developer ID Application: My Company (TEAMID)", "hardenedRuntime": true, "ignore": ["**/*.txt"] } } }
```

To skip signing, use `mac.sign.identity: null` (or `mac.sign: null`). The same structure applies to `mas` and `masDev`.

:::warning[Custom signing functions]
If you used `mac.sign` as a **custom signing function or module path** (`sign: "./customSign.js"`) together with sibling fields like `identity`, the two can no longer coexist — `sign` is now a single union. `migrate-schema` leaves your custom signer untouched and prints a warning so you can decide whether to keep the custom function or switch to an `ElectronSignOptions` object.
:::

### `mac.universal`

The universal-build options move from `mac` root into a `universal` object (typed as `ElectronUniversalOptions`, a pass-through to [`@electron/universal`](https://github.com/electron/universal)). They have no effect unless the target arch is `universal`.

| Removed (`mac.*`) | Replacement (`mac.universal.*`) |
|---|---|
| `mergeASARs` | `universal.mergeASARs` |
| `singleArchFiles` | `universal.singleArchFiles` |
| `x64ArchFiles` | `universal.x64ArchFiles` |

```json5
{ "mac": { "mergeASARs": true, "singleArchFiles": "*.node" } }                       // Before
{ "mac": { "universal": { "mergeASARs": true, "singleArchFiles": "*.node" } } }      // After
```

### Windows signing → `win.sign` {#windows-signing-winsign}

In v26, Windows signing used two separate root-level keys (`signtoolOptions` and `azureSignOptions`). In v27, all Windows signing modes are expressed through a single `win.sign` key typed as a discriminated union:

```typescript
win.sign: { type: "signtool" | "hsm" | "pkcs11" | "azure", … } | false | null
```

`false` / `null` disables signing entirely. Unset means electron-builder discovers credentials from the environment (e.g. `WIN_CSC_LINK`).

**`win.signtoolOptions` → `win.sign: { type: "signtool", … }`** — all fields move verbatim; add `type: "signtool"`.

```json5
{ "win": { "signtoolOptions": { "certificateFile": "cert.pfx", "publisherName": "CN=ACME Inc" } } }              // Before
{ "win": { "sign": { "type": "signtool", "certificateFile": "cert.pfx", "publisherName": "CN=ACME Inc" } } }     // After
```

**`win.azureSignOptions` → `win.sign: { type: "azure", … }`** — fields move into `win.sign` with `type: "azure"`. The old index signature (`[k: string]: string`) that allowed arbitrary extra keys is replaced by an explicit `additionalMetadata` object. `migrate-schema` both restructures the key and moves any unrecognized extra keys into `additionalMetadata`.

```json5
// Before
{ "win": { "azureSignOptions": { "endpoint": "https://weu.codesigning.azure.net/", "certificateProfileName": "my-profile", "ExcludeCredentials": "ManagedIdentityCredential" } } }

// After
{ "win": { "sign": { "type": "azure", "endpoint": "https://weu.codesigning.azure.net/", "certificateProfileName": "my-profile", "additionalMetadata": { "ExcludeCredentials": "ManagedIdentityCredential" } } } }
```

#### New signing modes (beta): `hsm` and `pkcs11`

v27 introduces two new signing modes in `win.sign`:

- **`type: "hsm"`** — Hardware Security Module via signtool `/csp /kc` (Windows-only; requires `toolsets.winCodeSign: "1.x"`).
- **`type: "pkcs11"`** — PKCS#11 token via osslsigncode (cross-platform; runs on macOS/Linux CI without a Windows VM).

```json5
{
  "win": {
    "sign": {
      "type": "pkcs11",
      "pkcs11Module": "/usr/lib/x86_64-linux-gnu/opensc-pkcs11.so",
      "pkcs11KeyUri": "pkcs11:token=MyToken;object=MyKey;type=private",
      "certificateFile": "cert.pem"
    }
  },
  "toolsets": { "winCodeSign": "1.3.0" }
}
```

Both HSM and PKCS#11 are **beta** — the interfaces are stable but real-hardware test coverage is limited.

#### `win.signExecutable` / `win.signAndEditExecutable` removed {#winsignexecutable-winsignandeditexecutable-removed}

| Removed | Replacement |
|---------|-------------|
| `win.signExecutable: false` | `win.sign: false` (disables signing; resource editing still runs) |
| `win.signExecutable: true` | *(deleted — signing is enabled by default when credentials are available)* |
| `win.signAndEditExecutable: true` | *(deleted — resource editing always runs)* |
| `win.signAndEditExecutable: false` | No direct equivalent — see note below |

:::warning
`win.signAndEditExecutable: false` formerly skipped both resource editing (icon, metadata) and signing. In v27 resource editing always runs. To skip only signing, use `win.sign: false`. If you need to skip resource editing for a specific artifact, apply resources manually after building.
:::

### `electronDownload` → `electronGet` {#electrondownload-electronget}

The `electronDownload` configuration key is renamed to `electronGet` and reshaped to match [`@electron/get`](https://github.com/electron/get)'s options directly (v27 upgrades to `@electron/get` v5, which downloads via `fetch`).

| Old `electronDownload.*` | New `electronGet.*` |
|---|---|
| `mirror` | `mirrorOptions.mirror` |
| `isVerifyChecksum: false` | `unsafelyDisableChecksums: true` |
| `cache`, `customDir`, `customFilename`, `strictSSL` | *(no equivalent — dropped by `migrate-schema` with a warning)* |

```json5
{ "electronDownload": { "mirror": "https://my-mirror/" } }                  // Before
{ "electronGet": { "mirrorOptions": { "mirror": "https://my-mirror/" } } }  // After
```

### `snap` → `snapcraft` {#snap-snapcraft}

The top-level `snap` configuration key is removed. Use `snapcraft` with an explicit `base` field and per-base options nested under a sub-key named after the base.

```json5
// Before
{ "build": { "snap": { "confinement": "strict", "stagePackages": ["libfoo"], "base": "core22" } } }

// After
{ "build": { "snapcraft": { "base": "core22", "core22": { "confinement": "strict", "stagePackages": ["libfoo"] } } } }
```

Supported `base` values: `"core18"`, `"core20"`, `"core22"`, `"core24"`, and `"custom"`. `migrate-schema` performs this restructuring; when the old config has no `base`, it assumes `"core20"` and warns so you can confirm. A `base: "custom"` config (inline/path `snapcraft.yaml`) is moved verbatim. The `SnapOptions` export is also removed — see [Removed exports](#removed-exports).

---

## CLI changes

### Implicit `--publish` removed {#implicit-publish-removed}

v27 no longer auto-publishes based on the presence of CI tag environment variables, git tags, or npm lifecycle events. Pass `--publish <always|onTag|onTagOrDraft|never>` explicitly in your release scripts, or set the `publish` option in your configuration.

> **Why:** unexpected auto-publishing could accidentally expose secrets or publish unfinished work. Making publishing explicit closes that hole.

### Removed flags: `--em.build`, `--em.directories` {#removed-flags-embuild-emdirectories}

These flags are removed (they have thrown since v22).

| Removed flag | Replacement |
|---|---|
| `--em.build` | `-c` (pass build config inline) |
| `--em.directories` | `-c.directories` |

### New command: `migrate-schema`

v27 adds `electron-builder migrate-schema`, which rewrites your config to v27 form in place and auto-migrates **static** (`json`/`json5`/`yaml`/package.json) **and programmatic** (`.js`/`.ts`/`.cjs`/`.mjs`) configs. See the [walkthrough](./v26-to-v27#step-1-run-the-automated-migrator).

---

## Publishing (electron-publish)

### Bitbucket Cloud publishing: token without username uses Bearer auth

The Bitbucket publisher now selects its authentication scheme by whether a username is present:

- **Username present** (`bitbucket.username`, or the `BITBUCKET_USERNAME` env var) → HTTP **Basic** auth, as before. Use this for an **app password** or an Atlassian **API token** (the username is your Bitbucket username or Atlassian account email).
- **No username** → the token is sent as `Authorization: Bearer <token>` (a repository / project / workspace **access token**). This is the new behavior; previously a token was always sent as Basic auth using the repository owner as the username.

**Action is required only if** your CI sets `BITBUCKET_TOKEN` (or `bitbucket.token`) to an **app password / API token without a username** — those requests now go out as Bearer and will fail authentication. Set `BITBUCKET_USERNAME` (or `bitbucket.username`) so Basic auth is used. Genuine access tokens need no username.

### New: Cloudflare R2 publish provider (additive)

v27 adds an opt-in `provider: "r2"` publish target (Cloudflare R2, an S3-compatible object store) with matching `electron-updater` support. Credentials come from `CF_R2_ACCESS_KEY_ID` / `CF_R2_SECRET_ACCESS_KEY`; the config requires a Cloudflare `accountId`, and an **`https` `publicUrl`** (custom domain or `pub-<hash>.r2.dev`) is needed for auto-update downloads. This is purely additive — no migration action is required.

---

## Toolsets & environment variables {#toolsets-environment-variables}

### Toolset defaults resolve to `"latest"` (newest bundle)

In v27 every `toolsets.*` property defaults to **`"latest"`** — an unset property, `null`, or the literal `"latest"` all resolve to the **newest published bundle** for that toolset. (Earlier v27 prereleases pinned a fixed default per toolset; those fixed defaults are gone.) The `null` value is no longer part of the `ToolsetConfig` type — it still works at runtime, but TypeScript/programmatic configs typed against `Configuration` should switch `null` → `"latest"` or omit the key. `migrate-schema` does not rewrite this.

| Toolset | v26 default | v27 `"latest"` resolves to | What the upgrade entails |
|---------|-------------|----------------------------|--------------------------|
| `wine` | `0.0.0` (Wine 4.0.1, macOS only) | `1.0.1` | Wine 11.0; macOS arm64 via Rosetta. Linux uses host-installed `wine` (no bundle shipped) |
| `winCodeSign` | `0.0.0` (winCodeSign 2.6.0) | `1.3.0` | Windows Kits 10.0.26100.0; `osslsigncode` 2.11 + native arm64; bundles the Azure Trusted Signing `dlib` + .NET 8 runtime |
| `appimage` | `0.0.0` (FUSE2 runtime) | `1.1.0` | Static FUSE3-compatible runtime (runs without a host FUSE install); adds `unsquashfs` support |
| `nsis` | `0.0.0` (NSIS 3.0.4.1, split bundle) | `1.2.1` | NSIS 3.12; unified single-archive bundle; entrypoint scripts auto-set `NSISDIR` |
| `fpm` | `2.2.1` | `2.2.1` | Unchanged — FPM 1.17.0 / Ruby 3.4.3 |
| `icons` | `1.1.0` | `1.2.1` | Newer bundle — `wasm-vips` + `@resvg/resvg-wasm` |
| `linuxToolsMac` | `1.0.0` | `1.0.0` | Unchanged — gnu-tar, lzip, binutils, etc. (macOS → Linux archives) |
| `sevenZip` | `1.0.0` | `1.0.0` | Unchanged — only published version |

**No action required** for most projects — the new bundles are drop-in replacements and produce identical output. If you hit a regression introduced by a newer bundle, pin back by setting the toolset version to `"0.0.0"`:

```json5
{ "build": { "toolsets": { "winCodeSign": "0.0.0", "nsis": "0.0.0", "appimage": "0.0.0", "wine": "0.0.0" } } }
```

This escape hatch is intended as a short-term workaround. The `"0.0.0"` alias may be removed in a future major release.

### Toolset env-var overrides removed

**This is a breaking change if you used env-var toolset overrides.** The following environment variables are **removed** — replace each with a [`ToolsetCustom`](#toolset-env-var-overrides-removed) object on the relevant `toolsets` key:

| Removed env var | Toolset it controlled |
|---|---|
| `APPIMAGE_TOOLS_PATH` | AppImage build tools (`mksquashfs`, runtime) |
| `LINUX_TOOLS_MAC_PATH` | Linux-tools-mac bundle (`ar`, `lzip`, `gtar`) |
| `CUSTOM_FPM_PATH` | FPM executable |
| `ELECTRON_BUILDER_NSIS_DIR` | NSIS compiler bundle directory |
| `ELECTRON_BUILDER_NSIS_RESOURCES_DIR` | NSIS resources/plugins directory |
| `CUSTOM_NSIS_RESOURCES` | Alternate NSIS resources bundle |
| `ELECTRON_BUILDER_WINE_TOOLSET_DIR` | Wine bundle directory |
| `USE_SYSTEM_WINE` | Forced the host-installed Wine instead of the downloaded bundle |
| `USE_SYSTEM_SIGNCODE` | Forced the host `signtool`/`signcode` instead of the bundled `winCodeSign` toolset |
| `USE_SYSTEM_OSSLSIGNCODE` | Forced the host `osslsigncode` instead of the bundled one |
| `USE_SYSTEM_FPM` | Forced the host-installed `fpm` instead of the bundled FPM |

The three signing `USE_SYSTEM_*` variables (`USE_SYSTEM_WINE`, `USE_SYSTEM_SIGNCODE`, `USE_SYSTEM_OSSLSIGNCODE`) have **no env-var replacement** — configure signing through [`win.sign`](#windows-signing-winsign) and the `winCodeSign` toolset instead. `USE_SYSTEM_FPM` is now **also removed** (it was still functional in earlier v27 prereleases): supply a custom FPM via `toolsets.fpm: { url: "file:///path/to/dir" }`. On Windows there is no bundled FPM, so an FPM-based target now **requires** an explicit custom `toolsets.fpm` and otherwise throws a clear configuration error (previously it silently fell back to a host `fpm` on `PATH`).

The `url` accepts an `https://` URL (downloaded and cached automatically) or a `file://` path (used as-is). The bundle must mirror the directory layout of the corresponding built-in bundle (see [electron-builder-binaries/packages](https://github.com/electron-userland/electron-builder-binaries/tree/master/packages)).

```json5
// Remote bundle (URL)
{ "build": { "toolsets": { "nsis": { "url": "https://example.com/my-nsis-bundle-1.0.tar.gz", "checksum": "sha256:abc123…", "version": "my-custom-1.0" } } } }

// Local directory (no checksum required)
{ "build": { "toolsets": { "appimage": { "url": "file:///path/to/my-appimage-tools-dir" } } } }
```

> **Wine note:** with `USE_SYSTEM_WINE` gone, Linux uses the host-installed `wine` by default (no bundle is shipped for Linux), and macOS uses the downloaded Wine 11.0 bundle. To point at a custom Wine build, supply a `ToolsetCustom` object on `toolsets.wine`.

Supported archive formats: `.zip`, `.7z`, `.tar.gz`, `.tar.xz`. **Exception for `sevenZip`**: because 7-Zip is used to extract `.7z` and `.tar.xz` archives, a custom `sevenZip` bundle can only be supplied as a `.tar.gz`, `.zip`, or bare `file://` directory.

### `CI_BUILD_TAG` environment variable

Removed. Use `CI_COMMIT_TAG` (the standard GitLab CI variable) to provide the release tag.

### Azure Trusted Signing `signtool /dlib` is the default

Azure Trusted Signing (`win.sign: { type: "azure" }`) uses the faster `signtool /dlib` path automatically: the default `winCodeSign` (`"latest"` → `1.3.0`) ships the ATS `dlib` + .NET 8 payload, so no pin is required. To **force the legacy** PowerShell `Invoke-TrustedSigning` path instead (which requires the `TrustedSigning` PS module in the signing environment), pin `winCodeSign` below `1.3.0`:

```json5
{ "build": { "toolsets": { "winCodeSign": "1.2.1" } } } // or "0.0.0" — forces the legacy PowerShell signing path
```

The signer resolves the path from the `winCodeSign` value: unset / `null` / `"latest"` and any explicit version `>= 1.3.0` use `signtool /dlib`; a version below `1.3.0` (no `dlib` in the bundle) uses PowerShell. A `ToolsetCustom` object uses `dlib` from your supplied bundle.

---

## New: MSIX target (beta)

v27 adds a beta `msix` Windows target alongside `appx`, producing `.msix`, `.msixbundle` (multi-arch), and `.msixupload` (Store) artifacts with modern manifest features that AppX cannot express — Package Integrity (`uap10`) and Windows Services (`desktop6`). It is **purely additive: no migration is required.** It works with the default `winCodeSign` toolset (only the legacy `0.0.0` bundle, which lacks the MSIX-capable Windows SDK, is rejected). MSIX builds on Windows 10+ natively or on macOS via Parallels Desktop (Linux is unsupported), and does **not** auto-update via electron-updater (updates come from the Microsoft Store or App Installer). See the [MSIX target documentation](../msix) for the full configuration surface.

```yaml
win:
  target: msix
# no toolsets pin needed — the default winCodeSign is MSIX-capable
```

---

## NSIS & behavior changes {#nsis-behavior-changes}

### NSIS file-association ProgID format changed

NSIS installers that declare `fileAssociations` now register each association under a unique, Microsoft-recommendation-compliant **ProgID** instead of using the association `name` (or extension) verbatim. The previous value could collide with unrelated applications — most easily when forking a project without changing `fileAssociations[].name`.

The generated ProgID has the form `<program>.<component>`: `<program>` is derived from your `productName` (so it stays readable in the registry) and `<component>` mixes a short readable prefix with a value derived from the app GUID. It is at most 39 characters, contains only letters, digits, and a single period, and never starts with a digit.

**No config change is required, and there is nothing to auto-migrate.** `fileAssociations` and its `name` / `ext` / `description` fields are unchanged; the new ProgID is produced automatically. The installer and uninstaller derive the same ProgID, so registration and removal stay in sync.

**Action is required only if** you ship a custom NSIS script (`nsis.include` / `nsis.script`) or external tooling that hard-codes the old ProgID — the association `name` or extension — for example to add extra shell verbs or registry entries under that key. Update those references to the new generated value.

> On upgrade, an installer built with v27 registers the new ProgID. One-click installers run the previous version's uninstaller during the upgrade, which removes the old-format entry; with assisted installers that do not uninstall the prior version first, the old ProgID may remain in the registry until that version is removed.

### Linux launcher entrypoint

Every Linux target (deb/rpm, AppImage, snap, flatpak) now launches through a generated `<executableName>-launcher` shell script rather than invoking the executable directly. Two things change in the built artifact:

- The package ships a **new file** — `<executableName>-launcher` (e.g. `/opt/<app>/MyApp-launcher`).
- The generated `.desktop` **`Exec` key points at the launcher** instead of the executable (e.g. `Exec=/opt/MyApp/MyApp-launcher %U`), and `executableArgs` / `forceX11` flags are injected into the launcher rather than inlined into `Exec`.

This makes `executableArgs` apply consistently across all Linux targets and keeps the `.desktop` `Exec` a plain command.

**Action is required only if** you ship a custom `.desktop` override, an AppArmor/snap profile, a MIME handler, or external tooling that hard-codes the `Exec` command or assumes the executable itself is the launch target. Point those at the `*-launcher` script (or the executable, as appropriate).

**AppImage `--no-sandbox` default changed.** The default `--no-sandbox` launch argument is now injected **only for the legacy FUSE2 runtime** (`toolsets.appimage: "0.0.0"`). With the default static FUSE3 runtime (unset / `"latest"` → `1.1.0`), `--no-sandbox` is no longer added automatically — `AppRun` adds it on its own only when user namespaces are unavailable. If you need the Chromium sandbox disabled unconditionally, set `executableArgs: ["--no-sandbox"]` explicitly.

### `node_modules` are now arch/os-filtered on every build

v27 filters `node_modules` by each package's `package.json` `cpu` / `os` fields against the **target** arch and platform on **every** build (previously this effectively only mattered for `universal` macOS builds). A dependency that declares an incompatible `cpu`/`os` for the target is excluded from the packaged app, whereas v26 copied host-installed `node_modules` verbatim.

**No action is required for typical projects** — this fixes universal-build failures and produces correctly-scoped output. Be aware of it only if you *intentionally* bundled a cross-arch or cross-os optional binary that is now dropped; in that rare case, include it explicitly via `extraResources` / `files`.

### `arch: "all"` now expands to x64 and arm64; 32-bit fails fast on Electron 44+

Two related architecture changes ship in v27:

- **`arch: "all"` no longer includes `ia32`.** `Platform.WINDOWS.createTarget(target, Arch.all)` (and the equivalent `--arch all` / default multi-arch build) now expands to **x64 + arm64** on Windows and Linux, instead of the old **x64 + ia32**. Electron 44 removed Windows `ia32` builds, and Linux `ia32` zips already ended at Electron 19, so the old expansion produced broken or impossible builds on current Electron. **To keep building 32-bit, request `ia32` explicitly** (e.g. `Arch.ia32`, or `--ia32`).
- **Windows `ia32` / Linux `armv7l` fail fast on Electron ≥ 44.** Requesting either of those arches against Electron `>= 44` (which [removed those builds](https://github.com/electron/electron/pull/51816)) now throws a clear `InvalidConfigurationError` **before** downloading, instead of dying on an opaque `404`. The check is downgraded to a **warning** when a custom `electronDist` or Electron mirror is configured (it may still provide 32-bit builds).

```
Error: Electron 44.0.0 does not provide Windows ia32 builds — Electron 44 removed
Windows ia32 and Linux armv7l support. Use electronVersion <= 43.x to keep building
for ia32 (32-bit is supported until the v43 series reaches end-of-life in January 2027),
or drop the ia32 target.
```

**Action:** if you ship 32-bit Windows/Linux builds, either pin `electronVersion` to `43.x` or earlier (supported until January 2027) and request `ia32`/`armv7l` explicitly, or drop those targets. Projects that relied on `"all"` implicitly producing `ia32` must now list it explicitly.

### macOS `productName` and `executableName` are validated, not sanitized

electron-builder now **rejects** a macOS `productName` or `executableName` that would require filename sanitization, throwing an `InvalidConfigurationError` at build start (`assertSafeHelperName`). Previously such names were silently normalized/sanitized, which could make the generated `<Name> Helper.app` bundles diverge from `CFBundleName` and break Electron's helper-process discovery.

**Action is required only if** a build starts failing with an "is not a valid macOS app bundle name" error — choose a `productName`/`executableName` that needs no sanitization (avoid path separators, control characters, and other characters stripped by filename sanitization).

### Redundant production `dependencies` are excluded, not rejected

In v26, listing `electron` or `electron-builder` under `dependencies` aborted the build with a hard `InvalidConfigurationError`. In v27 these packages are **excluded from the copied `node_modules`** (logged once) and the build proceeds. They stay valid production dependencies for tooling such as SBOM, license, and vulnerability tracking — electron-builder simply provides them another way (the Electron runtime is embedded separately), so a copy inside `app.asar` would be redundant.

The excluded set is configurable through the new [`ignoredProductionDependencies`](../configuration.md) build option, which defaults to:

```json5
{
  "build": {
    "ignoredProductionDependencies": ["electron", "electron-builder"]
  }
}
```

Overriding the option **replaces** the default list, so keep `electron` and `electron-builder` in it unless you intend to ship them.

- **Add** a name to exclude a production dependency that does not need a copy in `node_modules`. This is the common case when a bundler (Vite, webpack, esbuild, …) already inlines the package into your app code: keep it in `dependencies` so SBOM/license tooling still sees it, and add it here so a duplicate copy is not packaged.

  ```json5
  {
    "build": {
      "ignoredProductionDependencies": ["electron", "electron-builder", "react", "react-dom"]
    }
  }
  ```

- **Remove** a name to keep it in the copied `node_modules` after all (e.g. drop `"electron-builder"` from the list to ship it inside the app).

Only dependencies **your app declares directly** are eligible for exclusion. A listed name is dropped together with the transitive dependencies required **only** by it, while anything also required by a legitimate production dependency (npm/pnpm dedupe it into a single hoisted entry) is kept — and a matching name that appears solely as a transitive dependency of a kept package is never excluded. One footgun to be aware of: a kept package that `require()`s an excluded name at runtime **without declaring it** (relying on hoisting of your app's copy) will crash with `MODULE_NOT_FOUND` — declare that dependency properly in the package that needs it, or remove the name from the list. Matching is by the declared dependency name, so an npm alias (`"custom-electron": "npm:electron@^30.0.0"`) must be listed by its alias key.

#### `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` is removed — and the default flipped {#allow_electron_builder_as_production_dependency-is-removed-and-the-default-flipped}

In v26, this (undocumented) environment variable was the only way to keep `electron-builder` in `dependencies` without erroring, and setting it meant the package **was bundled** into the app. In v27 the variable is ignored and the behavior is the opposite: `electron-builder` is in the default ignore list, so it is **silently excluded** from the copied `node_modules` (an info-level log is the only trace). If you relied on the env var to actually ship `electron-builder` inside your app, you must now override the list and drop `"electron-builder"` from it, e.g. `"ignoredProductionDependencies": ["electron"]`.

#### `electron-prebuilt` / `electron-rebuild` no longer error — and are NOT excluded {#electron-prebuilt-electron-rebuild-no-longer-error-and-are-not-excluded}

The v26 hard error also rejected `electron-prebuilt` and `electron-rebuild` in `dependencies`. v27 removes that guard **without** adding them to the default ignore list, so if you still declare them they now **ship inside your app** silently — `electron-prebuilt` drags a full Electron binary along. Both packages are long deprecated (`electron-prebuilt` was renamed to `electron` in 2016; `electron-rebuild` moved to `@electron/rebuild`), which is why this major release drops the special-casing instead of carrying it forward. `electron-nightly` was never guarded and is likewise not in the default list. If you use any of them:

- **Preferred**: migrate — replace `electron-prebuilt` with `electron`, and `electron-rebuild` with `@electron/rebuild` in `devDependencies`.
- Otherwise: move them to `devDependencies`, or add them to `ignoredProductionDependencies` (e.g. `["electron", "electron-builder", "electron-prebuilt", "electron-nightly"]`) if they must stay declared as production dependencies for tooling.

This is a runtime behavior change, not a config-key rename, so `electron-builder migrate-schema` does not modify your config for it.

---

## macOS DMG

### DMG `filesystem` defaults to APFS

The default DMG volume filesystem changed from **`HFS+`** to **`APFS`**. APFS is the modern macOS filesystem and produces smaller, faster-to-mount images on current macOS.

- **No action** for most projects.
- **If you must support pre-10.13 (High Sierra) macOS**, which cannot mount APFS volumes, set the filesystem back to `HFS+` explicitly:

```json5
{ "dmg": { "filesystem": "HFS+" } }
```

This is a runtime default, not a config-key rename, so `migrate-schema` does not change it.

### New: `dmg.format: "ULMO"` (additive)

v27 adds a new `dmg.format` value, **`"ULMO"`** — an LZMA-compressed disk image (macOS 10.15+ only) — alongside the existing `UDZO` / `ULFO` / `UDBZ` / … options. This is purely additive; the default format is unchanged and no migration action is required.

---

## Auto-update (electron-updater)

### `disableWebInstaller` defaults to `true`

`AppUpdater.disableWebInstaller` now defaults to **`true`**. NSIS *web* installers (the small installer that downloads the full payload at install time from a manifest-supplied URL) are no longer loaded unless you opt in, because that payload may not undergo signature verification.

v27 ships a one-major-version grace period so existing deployments are not broken without warning:

- **You never set `disableWebInstaller`** (the default): if a web-installer update is received, the updater logs a warning and still downloads it in v27. In **v28** that warning becomes an error and the download is blocked (`ERR_UPDATER_WEB_INSTALLER_DISABLED`).
- **You explicitly set `disableWebInstaller = true`**: the download throws `ERR_UPDATER_WEB_INSTALLER_DISABLED` immediately (no grace period).
- **You do not use a web installer** (the common case): no action — this is the safer default and v28 will enforce it.

If you publish and rely on an NSIS web installer, opt back in **before v28** by setting `disableWebInstaller: false` in your main process:

```ts
import { NsisUpdater } from "electron-updater"
const updater = new NsisUpdater()
updater.disableWebInstaller = false // only if you intentionally ship a web installer
```

> **Tip:** running `electron-builder migrate-schema` on a project that builds an `nsis-web` target now prints an advisory reminding you to set `autoUpdater.disableWebInstaller = false` at runtime. The advisory is informational only — it never rewrites your config (`disableWebInstaller` is an electron-updater runtime setting, not a build-config key).

### `latest*.yml` drops legacy top-level `path`/`sha512`

The deprecated top-level `path` and `sha512` fields are **no longer written** to the generated update-metadata files (`latest.yml` / `latest-mac.yml` / `latest-linux.yml`) by default. They were kept for electron-updater **1.x – 2.15.0**, which predate the `files[]` array (introduced in 2.16.0, released 2017). Both fields are now emitted only when `electronUpdaterCompatibility` declares a range that intersects those legacy versions — the same mechanism that already controlled the Windows `sha2` field and the legacy `latest-mac.json`. The default `electronUpdaterCompatibility` is now `>=2.16` (previously `>=2.15`), and `UpdateInfo.path` / `UpdateInfo.sha512` are now **optional** on the exported TypeScript type.

- **No action** for virtually all projects: every electron-updater since 2.16.0 reads `files[]` and ignores the top-level fields. Already-published `latest*.yml` files are unaffected.
- **If your app code reads `info.path` / `info.sha512`** (e.g. in an `update-downloaded` handler), switch to `info.files[0].url` / `info.files[0].sha512`.
- **If external tooling parses `latest.yml`** (a custom update server or dashboard), point it at `files[]`.
- **If you still ship apps embedding electron-updater 1.x – 2.15**, keep emitting the legacy descriptor by declaring a compatibility range that includes them, e.g. `"electronUpdaterCompatibility": ">=1.0.0"` (also settable per platform, e.g. `win.electronUpdaterCompatibility`).

> Related: metadata validated only by the legacy SHA-256 `sha2` checksum is deprecated — v27 warns and **v28 will reject sha2-only metadata (fail-closed)**. Avoid pinning `electronUpdaterCompatibility` to a legacy range unless you actually ship 1.x–2.15 clients.

### New: `allowUnverifiedLinuxPackages` (opt-in Linux package-signature verification)

`AppUpdater.allowUnverifiedLinuxPackages` is a new flag (default **`true`**, preserving historical behavior). Set it to `false` to enforce GPG signature checks when installing `.deb` / `.rpm` auto-updates on package managers that support verification. Because electron-builder does **not** sign Linux packages itself, the default remains permissive; this is additive and requires no migration action.

```ts
import { autoUpdater } from "electron-updater"
autoUpdater.allowUnverifiedLinuxPackages = false // enforce GPG signature checks on .deb/.rpm updates
```

### `quitAndInstall` takes an options object

`AppUpdater.quitAndInstall(isSilent?, isForceRunAfter?)` replaced its positional boolean arguments with a single destructured options object. This is a **hard compile break in TypeScript** (plain JavaScript callers must update by hand — positional booleans are silently ignored):

```ts
// Before (v26)
autoUpdater.quitAndInstall(true, false)

// After (v27)
autoUpdater.quitAndInstall({ isSilent: true, isForceRunAfter: false })
```

Defaults are unchanged (`isSilent: false`, `isForceRunAfter: false`), so `quitAndInstall()` with no arguments behaves exactly as before. The object form also carries the new v27 `waitUntilNextLaunch` flag, which defers the install to the next application launch instead of spawning the installer on quit — see [Install on Next Launch](../features/auto-update#install-on-next-launch-windowslinux).

### `autoInstallEvent` replaces `autoInstallOnAppQuit`

The `autoInstallOnAppQuit` boolean on `AppUpdater` is replaced by a single enum, **`autoInstallEvent: "manual" | "onQuit" | "onNextLaunch"`** (default `"onQuit"`), and is **removed** with no compat alias. A single boolean cannot represent the three states, so this is a clean replacement rather than a shim.

| Before | After |
|---|---|
| `autoInstallOnAppQuit = true` (default) | `autoInstallEvent = "onQuit"` (default) |
| `autoInstallOnAppQuit = false` | `autoInstallEvent = "manual"` |
| — *(new in v27)* | `autoInstallEvent = "onNextLaunch"` |

```ts
// Before
autoUpdater.autoInstallOnAppQuit = false

// After
autoUpdater.autoInstallEvent = "manual"
```

The default `"onQuit"` preserves prior behavior, so most apps need no change. `"onNextLaunch"` defers the install to the next launch to avoid the OS killing the installer during session end, and is planned to become the default in v28 — see [Install on Next Launch](../features/auto-update#install-on-next-launch-windowslinux).

---

## Programmatic & plugin-author API changes {#programmatic-plugin-author-api-changes}

> **This section only affects you if you import from `app-builder-lib` and access the `packager` or `platformPackager` objects directly.** Standard project configurations are unaffected.

### `info: Packager` is now `protected`

`PlatformPackager` exposed a **public** `info: Packager` field in v26. In v27 it is **`protected`** — a **hard compile break**, not a soft deprecation: external code that chains through `.info.` (a custom target, or a plugin importing `app-builder-lib`) no longer type-checks. All commonly-needed properties are now directly accessible on `PlatformPackager` — drop the `.info.` chain:

| Before (deprecated) | After |
|---|---|
| `packager.info.tempDirManager` | `packager.tempDirManager` |
| `packager.info.metadata` | `packager.metadata` |
| `packager.info.framework` | `packager.framework` |
| `packager.info.cancellationToken` | `packager.cancellationToken` |
| `packager.info.repositoryInfo` | `packager.repositoryInfo` |
| `packager.info.relativeBuildResourcesDirname` | `packager.relativeBuildResourcesDirname` |
| `packager.info.stageDirPathCustomizer` | `packager.stageDirPathCustomizer` |
| `packager.info.areNodeModulesHandledExternally` | `packager.areNodeModulesHandledExternally` |
| `packager.info.isPrepackedAppAsar` | `packager.isPrepackedAppAsar` |
| `packager.info.appDir` | `packager.appDir` |
| `packager.info.getWorkspaceRoot()` | `packager.getWorkspaceRoot()` |
| `packager.info.emitArtifactBuildStarted(e)` | `packager.emitArtifactBuildStarted(e)` |
| `packager.info.emitArtifactBuildCompleted(e)` | `packager.emitArtifactBuildCompleted(e)` |
| `packager.info.emitArtifactCreated(e)` | `packager.emitArtifactCreated(e)` |
| `packager.info.emitMsiProjectCreated(p)` | `packager.emitMsiProjectCreated(p)` |
| `packager.info.emitAppxManifestCreated(p)` | `packager.emitAppxManifestCreated(p)` |

The getters already on `PlatformPackager` in v26 are unchanged (`config`, `projectDir`, `buildResourcesDir`, `packagerOptions`, `appInfo`, `debugLogger`).

### `platformSpecificBuildOptions` is now `protected`

External consumers should use the two new public helpers instead:

| Access pattern | v27 replacement |
|---|---|
| `packager.platformSpecificBuildOptions` (direct read) | `packager.platformOptions` |
| `deepAssign({}, packager.platformSpecificBuildOptions, config.X)` | `packager.getOptionsForTarget<T>("X")` |

`platformOptions` is a typed getter returning the same platform-level config object. `getOptionsForTarget<T>(key)` performs the standard merge of platform options with the named per-target key (e.g. `"appx"`, `"msi"`) and returns the result as `T`. All built-in targets have been migrated; custom targets extending `PlatformPackager` must update any direct `.platformSpecificBuildOptions` access.

---

## Removed exports

`ProtonFramework`, `LibUiFramework`, and `SnapOptions` are removed from the public exports of `app-builder-lib` and `electron-builder`. Use the Electron framework and the [`snapcraft`](#snap-snapcraft) config shape respectively. The removed framework support means `framework: "proton" | "libui"` no longer has any effect — see [`framework` removed](#framework-nodeversion-launchuiversion).

### Renamed type exports

These exported TypeScript types were **renamed with no compatibility alias** — `import { OldName }` is now a hard compile error. Update the import to the new name:

| v26 export | v27 export |
|---|---|
| `ElectronDownloadOptions` | `ElectronGetOptions` |
| `WindowsAzureSigningConfiguration` | `WindowsAzureSigningConfig` |
| `WindowsSigntoolConfiguration` | `WindowsSigntoolSigningConfig` |

`ElectronGetOptions` is re-exported from the top-level `electron-builder` package, so this affects ordinary TypeScript consumers, not just `app-builder-lib` plugin authors.

---

## Design notes

Rationale behind the user-facing breaking changes, for those who want full transparency.

### Why native ESM?

`electron-builder` historically shipped CommonJS. The move to native ESM was driven by the ecosystem: major dependencies (`chalk`, `figures`, `ora`, etc.) have dropped CJS support, and Node.js 22.12's stabilized `require(esm)` makes it safe to ship ESM without breaking CJS consumers. The minimum was set to 22.12.0 specifically because earlier Node.js versions require `--experimental-require-module` to `require()` an ESM package.

### Why move native-module options under `nativeModules`?

In v26, options like `buildDependenciesFromSource`, `nodeGypRebuild`, `npmRebuild`, and `nativeRebuilder` were scattered at the root of `Configuration` alongside unrelated properties. They were grouped under `nativeModules` for the same reason `directories` and `toolsets` are sub-keys: related options should be co-located. The rename `nativeRebuilder → rebuildMode` makes the field name consistent with other enum-style selectors.

### Why unify all Windows signing under `win.sign`?

In v26, Windows signing was split across two sibling root-level keys — `signtoolOptions` and `azureSignOptions` — with precedence rules that were easy to misconfigure (both present → Azure wins, silently). v27 replaces them with a single `win.sign` key typed as a discriminated union. This makes the active signing mode explicit, self-documenting in IntelliSense, and mirrors the macOS `mac.sign` shape so both platforms have the same mental model. The `win.sign: false` sentinel explicitly disables signing, distinguishing it from "not configured" (env-based discovery).

### Why replace `[k: string]` in `WindowsAzureSigningConfiguration`?

The v27 Azure integration switches from PowerShell `Invoke-TrustedSigning` to `signtool.exe /dlib /dmdf`, which reads a `metadata.json` file. An explicit `additionalMetadata: Record<string, string>` field is cleaner than an index signature because it makes intent visible in IntelliSense and prevents accidental shadowing of the typed fields. The legacy PowerShell path remains available (triggered when `toolsets.winCodeSign` is pinned below `"1.3.0"`).

### Why restructure `snap` into `snapcraft`?

The `snapcraft` shape makes the `base` explicit and nests per-base options under a base-named sub-key, so a single config can describe multiple bases unambiguously and core24 (which uses the snapcraft CLI directly) can coexist with legacy bases. `migrate-schema` automates the move but assumes `core20` when no base is present, because that is the v27 1-to-1 migration target — verify the assumption for your project.

### Why consolidate macOS signing under `mac.sign`?

In v26, ~15 signing options were scattered across the root of `MacConfiguration` intermixed with unrelated packaging options. Grouping them under a single `sign` object makes the signing surface self-documenting and matches the Windows `win.sign` grouping. `sign` is now a typed pass-through (`ElectronSignOptions`) to `@electron/osx-sign`, so upstream options are forwarded directly and new osx-sign fields are picked up automatically. `signIgnore` was renamed to `sign.ignore` to match the osx-sign canonical name. The same grouping rationale produced `mac.universal` (a pass-through to `@electron/universal`).

### Why rename `electronDownload` to `electronGet`?

v27 upgrades to `@electron/get` v5, which downloads via `fetch` (replacing the `got`-based path) and exposes a `mirrorOptions` object rather than the old flat `mirror`/`customDir` fields. Renaming the config key to `electronGet` and typing it directly as the library's own options removes electron-builder's hand-maintained translation layer — what you set is what `@electron/get` receives. A few legacy fields (`cache`, `customDir`, `customFilename`, `strictSSL`) have no v5 equivalent; `migrate-schema` drops them with a warning.

### Why consolidate ASAR options under `asar`?

In v26, `asarUnpack` lived alongside `asar`, and `disableSanityCheckAsar` / `disableAsarIntegrity` lived at the root of `Configuration`. This was confusing: `asarUnpack` is meaningless when `asar: false`, yet nothing in the type system expressed that relationship. Moving all options under a single `asar` key makes the dependency explicit. The `asar: true` sentinel was removed because having both `true` (enable with defaults) and `{}` (same meaning) was redundant.

### `PlatformPackager.info` is now protected

The public `info: Packager` field created a hard coupling: any internal `Packager` refactor became a breaking change for all plugins. In v27, direct pass-through getters and methods were added for the properties plugin authors actually need, and `info` was changed from `public` to **`protected`**. This is a hard break in v27 (not a deferred deprecation): external `packager.info.X` access no longer compiles, so migrate to the direct getters listed above.

---

## Internal changes (non-user-facing)

These changes have no impact on your build configuration or the public API. They are listed for transparency about what shipped in v27.

- **Native ESM build pipeline.** Babel was removed entirely; packages are compiled by `tsc` to native ESM with `exports` maps and full type declarations.
- **Code-quality modernization.** Production code paths adopt native Node.js APIs and modern TypeScript patterns (`sleep()` from `timers/promises`, native process signal handlers, `Error.cause`, `Reflect.get`/`set`, the WHATWG `URL` API, SHA-256 for WiX directory-ID generation).
- **Dead-code removal.** `ProtonFramework`, `LibUiFramework`, and `binDownload.ts` were deleted; all binary downloads were consolidated into a single `downloadBuilderToolset` path.
- **Flags consolidation.** All boolean `process.env` flags were consolidated into a single `flags.ts`, and `validateShellEmbeddable` moved to `builder-util/envUtil`.
- **Source reorganization.** Platform-specific files were split into per-platform subdirectories. The public API surface is unchanged.
- **Test suite.** Duplicated test files were replaced by runtime-generated tests that fan out across toolset version combinations.
- **`@electron/*` dependency major bumps.** `@electron/get` 3→5 (now `fetch`-based; drives the [`electronGet`](#electrondownload-electronget) rename), `@electron/osx-sign` 1→2 and `@electron/universal` 2→3 (drive the [`mac.sign`](#macos-signing-macsign) / [`mac.universal`](#macuniversal) pass-throughs), plus `@electron/asar` 3→4, `@electron/notarize` 2→3, and `@electron/fuses` 1→2. The fuses bump adds an optional `wasmTrapHandlers?: boolean` field to `electronFuses`; no existing fuse field was removed.
