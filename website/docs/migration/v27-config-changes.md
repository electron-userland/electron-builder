---
title: "v27 Config Changes"
sidebar_label: "Config"
---

# v27 Config Changes

Changes you fix by editing your electron-builder configuration. Part of the [v27 Breaking Changes](./v27-breaking-changes.md) reference.

:::tip[Run the automated migrator first]
```bash
electron-builder migrate-schema            # apply changes in place
electron-builder migrate-schema --dry-run  # preview only
```
It rewrites every change marked **Auto ✓** below. See the [walkthrough](./v26-to-v27#step-1-run-the-automated-migrator) for flags and serialization caveats.
:::

**How you'll find out:** a config that still sets any removed or moved key here **fails the build** with one error that lists each key, its replacement and a link to its section. Exceptions:

- Flat `files` / `extraResources` / `extraFiles` keys only **warn**; they are applied as their [`fileOptions`](#file-options-fileoptions) counterparts.
- A GitHub [`tagNamePrefix: ""`](#githuboptions-gitlaboptions-vprefixedtagname) is now honored **silently** at build time; only `migrate-schema` warns about it.
- A `toolsets.*: null` entry fails [schema validation](#toolsets-null-rejected) with a generic message instead of the combined error.

## At a glance {#at-a-glance}

| Change | Auto | Action required |
|--------|:---:|----------------|
| [`electronCompile` removed](#electroncompile) | ✓ | Remove from config; migrate off `electron-compile` |
| [`framework` / `nodeVersion` / `launchUiVersion` removed](#framework-nodeversion-launchuiversion) | ✓ | Removed automatically (Electron is the only framework) |
| [`disableDefaultIgnoredFiles` removed](#disabledefaultignoredfiles) | ✓ | Removed automatically; re-include specific files via a `fileOptions.files` glob (e.g. `**/*.obj`) |
| [`appImage.systemIntegration` removed](#appimagesystemintegration) | ✓ | Removed automatically |
| [`npmSkipBuildFromSource` removed](#npmskipbuildfromsource) | ✓ | Replaced by `nativeModules.buildDependenciesFromSource` |
| [Root-level `directories` removed](#root-level-directories-in-packagejson) | ✓ | Move under `build.directories` |
| [`build.helper-bundle-id` removed](#buildhelper-bundle-id) | ✓ | Moved to `mac.helperBundleId` |
| [`squirrelWindows.noMsi` removed](#squirrelwindowsnomsi) | ✓ | Replaced by `msi` (inverted) |
| [`linux.syncDesktopName` removed](#linuxsyncdesktopname-always-synced) | ✓ | Removed automatically; behaviour is always on. If it was `false`, set `desktopName` to control the filename |
| [`GithubOptions.vPrefixedTagName` removed](#githuboptions-gitlaboptions-vprefixedtagname) | ✓ | Use `tagNamePrefix`; an empty `tagNamePrefix: ""` is now honored (v26 ignored it) |
| [`GitlabOptions.vPrefixedTagName` retained](#githuboptions-gitlaboptions-vprefixedtagname) | — | None — still functional; the migrator leaves GitLab entries untouched |
| [`squirrelWindows.customSquirrelVendorDir` removed](#squirrelwindowscustomsquirrelvendordir) | — | Supply a custom Squirrel bundle via `toolsets.squirrel` (a `ToolsetCustom` object); `migrate-schema` warns but cannot rewrite it (different bundle layout) |
| [`.customNsisBinary` / `.customNsisResources` removed](#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis) | partial | Originally avail on nsis, nsisWeb, portable. Now combined and moved to a [NSIS Toolset Bundle](../toolsets#custom-nsis-bundle-layout) configured under `toolsets.nsis`. **Manual action required** - [A complete migration guide is available](./v26-to-v27#step-4-custom-nsis-migration-guide). A config that still sets removed key(s) fails the build with a message naming the replacement. (`migrate-schema` warns, cannot convert it). |
| [`toolsets.*: null` rejected; `appimage: "1.0.2"` retired](#toolsets-null-rejected) | ✓ | `null` entries are removed (unset = `"latest"`); `"1.0.2"` becomes `"1.0.3"` |
| [Native-module options grouped under `nativeModules`](#native-module-options-nativemodules) | ✓ | `nativeRebuilder` → `rebuildMode`; the `"legacy"` rebuilder is removed (dropped with a warning) |
| [ASAR options consolidated under `asar`](#asar-options-asar) | ✓ | `asarUnpack` → `asar.unpack`, etc., including platform-level `mac.asarUnpack` → `mac.asar.unpack` (`asar: true` is still valid, just redundant) |
| [`files` / `extraResources` / `extraFiles` nested under `fileOptions`](#file-options-fileoptions) | ✓ | `files` → `fileOptions.files`, etc., at the root and per platform (`mac.extraResources` → `mac.fileOptions.extraResources`) |
| [`includePdb` replaced by `fileOptions.excludedExts`](#includepdb-fileoptionsexcludedexts) | ✓ | `.pdb` files are now excluded by default; `includePdb: true` → `fileOptions.excludedExts: ["default", "!pdb"]`, `includePdb: false` → `["default"]` (the v27 default, written out so that it keeps overriding an `includePdb: true` of another config layer) |
| [macOS signing consolidated under `mac.sign`](#macos-signing-macsign) | ✓ | `identity`/`entitlements`/`hardenedRuntime`/… → `mac.sign.*`; `signIgnore` → `sign.ignore` |
| [`mac.universal` options consolidated](#macuniversal) | ✓ | `mergeASARs`/`singleArchFiles`/`x64ArchFiles` → `mac.universal.*` |
| [Windows signing unified under `win.sign`](#windows-signing-winsign) | ✓ | Discriminated union `type: "signtool" \| "hsm" \| "pkcs11" \| "azure"` |
| [`win.signExecutable` / `win.signAndEditExecutable` removed](#winsignexecutable-winsignandeditexecutable-removed) | ✓ | `false` → `win.sign: false`; resource editing always runs |
| [Custom Windows signing hook moved to `win.sign.sign`](#custom-windows-signing-hooks-move-to-winsignsign) | ✓ | `win.signtoolOptions.sign` moves with the rest of `signtoolOptions` to `win.sign.sign` |
| [`electronDownload` → `electronGet`](#electrondownload-electronget) | ✓ | Reshaped to `@electron/get` options; some legacy fields dropped (warned) |
| [`snap` config key removed](#snap-snapcraft) | ✓ | Restructured to `snapcraft` with an explicit `base` |

---

## Removed configuration options

### `electronCompile` {#electroncompile}

The `electronCompile` configuration option has been **removed**. `electron-compile` is an unmaintained library with no releases since 2019.

```json5
{ "build": { "electronCompile": true } }  // ← delete this line
```

If your project relies on `electron-compile` for source compilation, migrate to a modern build tool before upgrading:

- **[electron-vite](https://electron-vite.org/)** — recommended; fast, first-class ESM and Electron integration
- **[esbuild](https://esbuild.github.io/)** — extremely fast, minimal configuration
- **[webpack](https://webpack.electron.build/)** — mature, widely used

### `framework` / `nodeVersion` / `launchUiVersion` {#framework-nodeversion-launchuiversion}

These three fields are removed. Only Electron is supported as a target framework — `proton`/`proton-native` and `libui` support has been removed (see [Removed exports](./v27-developer-changes.md#removed-exports)).

```json5
{
  "build": {
    "framework": "electron",    // ← delete; "electron" was and remains the default
    "nodeVersion": "current",   // ← delete; no effect
    "launchUiVersion": "0.1.0"  // ← delete; no effect
  }
}
```

### `disableDefaultIgnoredFiles` {#disabledefaultignoredfiles}

The `disableDefaultIgnoredFiles` option has been **removed**. To include a file that is excluded by default (for example a Wavefront `.obj` 3D model, or any other default-excluded extension/name), add an explicit `fileOptions.files` glob that targets it — an explicit include now overrides the matching default exclusion:

```json5
{
  "build": {
    "disableDefaultIgnoredFiles": true,  // ← delete this line
    "fileOptions": {
      "files": [
        "**/*",
        "**/*.obj"  // ← add a glob for the default-excluded files you want to keep
      ]
    }
  }
}
```

Broad patterns such as `**/*` still honor the defaults. A pattern that names an excluded extension includes only the files it matches: `**/*.obj` includes every `.obj` file outside `node_modules` and the build resources and output directories, `models/teapot.obj` only that file. A pattern with a default-excluded name as a path segment (e.g. `**/.github/**`) opts that name back in.

### `appImage.systemIntegration` {#appimagesystemintegration}

Removed. Desktop integration is handled automatically by [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher).

### `npmSkipBuildFromSource` {#npmskipbuildfromsource}

Removed. Use `buildDependenciesFromSource` (now under [`nativeModules`](#native-module-options-nativemodules)). It is the logical inverse:

```json5
// v26
{ "npmSkipBuildFromSource": true }
// v27 equivalent
{ "nativeModules": { "buildDependenciesFromSource": false } }
```

### Root-level `directories` in `package.json` {#root-level-directories-in-packagejson}

Specifying `directories` at the root of `package.json` is removed. Move it under the `build` key.

```json
{ "name": "my-app", "directories": { "output": "dist" } }              // Before
{ "name": "my-app", "build": { "directories": { "output": "dist" } } } // After
```

### `build.helper-bundle-id` {#buildhelper-bundle-id}

The hyphenated root-level `helper-bundle-id` is removed. Use `mac.helperBundleId`.

```json5
{ "build": { "helper-bundle-id": "com.example.helper" } }            // Before
{ "build": { "mac": { "helperBundleId": "com.example.helper" } } }   // After
```

### `squirrelWindows.noMsi` {#squirrelwindowsnomsi}

The `noMsi` boolean is removed in favor of its inverse, `msi`.

```json5
{ "build": { "squirrelWindows": { "noMsi": true } } }   // Before
{ "build": { "squirrelWindows": { "msi": false } } }    // After
```

### `linux.syncDesktopName` (always synced) {#linuxsyncdesktopname-always-synced}

The `linux.syncDesktopName` flag is removed. The behaviour it gated is now **always on**: the installed `.desktop` filename is always derived from the `desktopName` field in `package.json` — installed as `${desktopName}.desktop`, with any trailing `.desktop` in the value stripped first — falling back to `executableName` only when `desktopName` is absent.

```json5
// Before (v26) — opt-in
{ "build": { "linux": { "syncDesktopName": true } } }  // ← delete this line
```

`migrate-schema` removes the flag automatically. No replacement is needed. If you had `syncDesktopName: false` (opting out of syncing in v26), the migrator warns you: the installed filename is now always derived from `desktopName`, so set (or omit) `desktopName` to control it.

**Why this changed:** Electron derives its `app_id` / `WM_CLASS` from `desktopName`, and desktop environments match a running window to its launcher entry by comparing `WM_CLASS` against the installed `.desktop` filename. When the two diverged — which is exactly what happened with `syncDesktopName: false` (the v26 default) whenever a `desktopName` was set — GNOME, KDE, and others failed to associate the window with its launcher, breaking taskbar grouping, dock icons, and launcher highlighting (see [#9103](https://github.com/electron-userland/electron-builder/issues/9103)). Removing the flag eliminates a footgun rather than removing functionality. Path-traversal/NUL validation on the resulting filename is unchanged.

### `GithubOptions` / `GitlabOptions` `vPrefixedTagName` {#githuboptions-gitlaboptions-vprefixedtagname}

The `vPrefixedTagName` boolean on `GithubOptions` is removed. Use `tagNamePrefix` to control the tag prefix.

```json5
{ "publish": { "provider": "github", "vPrefixedTagName": false } }   // Before
{ "publish": { "provider": "github", "tagNamePrefix": "" } }         // After (empty string = no prefix)
```

To keep the default `v` prefix, simply remove `vPrefixedTagName` — `tagNamePrefix` defaults to `"v"`.

**An empty `tagNamePrefix` is now honored.** v26 ignored `tagNamePrefix: ""` and still tagged `v1.2.3` (unless `vPrefixedTagName: false`); v27 uses it as-is and tags `1.2.3`. `migrate-schema` rewrites a GitHub `tagNamePrefix: ""` without `vPrefixedTagName: false` to `"v"` — keeping your existing tag names — and warns so you can set it back if unprefixed tags are what you wanted. A non-empty `tagNamePrefix` always won in v26 and is kept. The migrator applies to GitHub publish entries anywhere in the config (root, `mac`/`win`/`linux`, and target sections such as `nsis.publish`).

:::note[GitlabOptions.vPrefixedTagName is not removed]
Only the **GitHub** field was removed. On **GitLab**, `vPrefixedTagName` is unchanged in v27 — it still exists in the type, the schema, and the runtime, and continues to control the tag prefix (`vPrefixedTagName: false` → `1.2.3`; omit it → `v1.2.3`). It has no `tagNamePrefix` equivalent, so `migrate-schema` leaves GitLab publish entries untouched. No action is required.
:::

---

## Replaced by toolsets {#replaced-by-toolsets}

### `squirrelWindows.customSquirrelVendorDir` {#squirrelwindowscustomsquirrelvendordir}

Removed. v27 inlines the Squirrel.Windows installer logic and drops the `electron-winstaller` npm dependency (and its vendored binaries); the Squirrel vendor toolset is now fetched from the maintained `squirrel.windows` electron-builder-binaries bundle. To pin a version or supply a custom/local bundle — for example an air-gapped mirror — use the standard `toolsets.squirrel` setting instead, the same way you would pin `toolsets.nsis` or `toolsets.winCodeSign`.

The shape and behaviour differ, so this is not a 1-to-1 rename:

- The old `customSquirrelVendorDir` pointed at a directory **whose contents were the vendor files** (`Squirrel.exe`, `nuget.exe`, …) and was copied verbatim, bypassing all provisioning.
- `toolsets.squirrel` accepts a version pin (`"1.1.1"` / `"latest"`) **or** a `ToolsetCustom` object whose `url` points at a bundle that **contains an `electron-winstaller/vendor/` subtree**. The bundle still goes through normal provisioning: on every platform `rcedit.exe` is supplied from the `winCodeSign` toolset (it runs under Wine on non-Windows hosts), and for `msi: true` the shared WiX toolset is merged in.

```json5
// Before (removed):
{ "squirrelWindows": { "customSquirrelVendorDir": "./my-vendor" } }
// After: a custom toolset bundle whose electron-winstaller/vendor/ holds the binaries.
// A bare file:// directory is used as-is (no checksum); a remote/archive url needs a checksum.
{ "toolsets": { "squirrel": { "url": "file:///abs/path/to/squirrel-toolset" } } }
```

`migrate-schema` cannot rewrite this key (the bundle layout differs), so it warns and leaves it in place; the next build then fails with a message pointing at `toolsets.squirrel`. Remove the key to use the default bundle, or point `toolsets.squirrel` at a bundle with the layout above.

For a fully offline build, seed the `squirrel.windows@<version>` archive (plus `winCodeSign` and, for MSI, the WiX bundle) in the toolset cache or point `toolsets.squirrel` at a local bundle — see [Offline / Air-Gapped Builds](../tutorials/offline-air-gapped-builds.md). Nothing is downloaded outside the checksummed toolset bundles.

### customNsisBinary and customNsisResources replaced by `toolsets.nsis` {#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis}

Removed (`.customNsisBinary` / `customNsisResources`), on `nsis`, `nsisWeb` and `portable` configs, together with the exported `CustomNsisBinary` type.

The 1 to 1 replacement for either/both is the new [`toolsets.nsis`](../toolsets#custom-nsis-bundle-layout) bundle. A config that still sets either key fails the build with a message naming the replacement.

In general, the NSIS resources/binary are married quite closely and in nuanced ways - the new unified structure gives easy access to both in the same place and simplifies build-flow.

See [Custom NSIS Migration Guide](./v26-to-v27#step-4-custom-nsis-migration-guide) & [NSIS toolset documentation](../toolsets.md#custom-nsis-bundle-layout) for more details.

- **A Custom NSIS Binary** Custom compiled NSIS binaries are practical to facillitate builds with unique requirements (like bypassing the 2Gib limit on installer.exe generation). A custom NSIS binary can also be used to adjust to the appearance of the installer in a variety of ways through the many images that get baked into it. If you were using (`.customNsisBinary`) in `v26`, now you must provide that binary via a `toolsets.nsis` bundle for parity on `v27`.
- **Custom NSIS Resources** Custom NSIS resources are required to expose any additional 3rd party plugins that may be needed in custom `.nsh` scripts. If you were using (`.customNsisResources`) in `v26`, now you must provide that resource via a `toolsets.nsis` bundle for parity on `v27`.
- **`customNsisBinary.debugLogging`** moves to `nsis.installerDebugLogging` (or `nsisWeb.installerDebugLogging`). It never had an effect on `portable`, which has no equivalent.



```json5
// Before (v26):
// Custom NSIS artifacts provided via 2 seperate bundles
{
  "nsis": {
    "customNsisBinary": {
      "url": "https://example.com/my-nsis-executable.7z",
      "checksum": "<checksum>",
      "version": "3.10",
      "debugLogging": true
    },
    "customNsisResources": {
      "url": "https://example.com/my-nsis-resources.7z",
      "checksum": "<checksum>",
      "version": "3.4.1"
    }
  }
}
// After:
// Custom NSIS artifacts provided by a unified toolset
// Note: Debug-logging still controlled on NSIS and not by toolsets.nsis
{
  "toolsets": {
    "nsis": {
      "url": "https://example.com/my-nsis.7z",
      "checksum": "<checksum>",
      "version": "3.10"
    }
  },
  "nsis": { "installerDebugLogging": true }
}
```

You can see the relative escape hatch of providing an archive for the full toolset is generally the same from `v26` -> `v27` simply in a more consolidated form.

Of note, `v27` also accepts a `file://` path in the `url` field. A `file://` path to an unpacked bundle directory needs no checksum and is used as-is with no caching; a `file://` path to an archive still needs a `checksum`.

- `https://` — downloaded and cached locally; the archive is extracted before use.
- `file:///absolute/path` — used directly; relative paths must be within the project resources dir.

**`installerDebugLogging` needs a log-enabled NSIS**, that is `makensis` and its stubs compiled with `NSIS_CONFIG_LOG=yes`; any other `makensis` rejects the `LogSet` it emits. The bundled `toolsets.nsis` versions are not log-enabled, so the build fails with a configuration error when `installerDebugLogging` is set without a custom `toolsets.nsis` bundle. This is unchanged from v26, where the option also only worked with your own `customNsisBinary`. When building on Linux or macOS, the bundle's `makensis` for that host must be log-enabled too.

`migrate-schema` moves `debugLogging` to `installerDebugLogging` (dropping it, with a warning, for `portable`) and removes a `customNsisBinary` that sets nothing else. It cannot convert a custom bundle, so it leaves a `customNsisBinary` with a `url` / `checksum` / `version`, and any `customNsisResources`, in place and warns; the build then fails with the message above until you move them.

### `toolsets.*: null` rejected; `appimage: "1.0.2"` retired {#toolsets-null-rejected}

The `null` value is no longer part of the `ToolsetConfig` type, and it is **rejected by schema validation** — each `toolsets.*` property is typed as a `ToolsetCustom` object or a version string, with no `null` branch. Switch `null` → `"latest"` or omit the key entirely; both resolve to the newest bundle. `migrate-schema` removes `null` entries. The `appimage` `"1.0.2"` pin is no longer offered; `migrate-schema` rewrites it to `"1.0.3"`.

What `"latest"` resolves to for each toolset is covered under [Toolset defaults resolve to `"latest"`](./v27-build-changes.md#toolset-defaults-resolve-to-latest-newest-bundle).

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

The `"legacy"` value of `nativeRebuilder` (the old app-builder binary rebuilder) is **removed** — `rebuildMode` only accepts `"sequential"` or `"parallel"`, and native modules are always rebuilt with `@electron/rebuild`. `migrate-schema` drops a `"legacy"` value with a warning, so the default `"sequential"` mode applies.

<details>
<summary>Why move native-module options under <code>nativeModules</code>?</summary>

In v26, options like `buildDependenciesFromSource`, `nodeGypRebuild`, `npmRebuild`, and `nativeRebuilder` were scattered at the root of `Configuration` alongside unrelated properties. They were grouped under `nativeModules` for the same reason `directories` and `toolsets` are sub-keys: related options should be co-located. The rename `nativeRebuilder → rebuildMode` makes the field name consistent with other enum-style selectors.

</details>

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
| `asar: true` | *(still valid — redundant, since absence means enabled)* |
| `mac.asarUnpack` / `win.asarUnpack` / `linux.asarUnpack` / `mas.asarUnpack` / `masDev.asarUnpack` | `<platform>.asar.unpack` |

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

When `asar: false`, the root-level sub-options have no effect and the migrator removes them.

**Platform-level `asar` now replaces the root one.** In v26 the root `asarUnpack`, `disableSanityCheckAsar`, and `disableAsarIntegrity` applied to every platform, and a platform's own `asarUnpack` was *added* to the root patterns. In v27 all three live inside `asar`, and a platform-level `asar` (e.g. `mac.asar`) replaces the root `asar` object entirely. `migrate-schema` keeps the v26 result: a platform `asarUnpack` becomes `<platform>.asar.unpack` merged with the root patterns and options, and a platform that already overrides `asar` gets the former root-level values copied in. (For programmatic JS/TS configs, the codemod only rewrites the cases where a plain move is equivalent and warns about the rest.)

```json5
// Before (v26)
{ "asarUnpack": ["**/*.node"], "mac": { "asarUnpack": ["Resources/**"] } }
// After (v27)
{ "asar": { "unpack": ["**/*.node"] }, "mac": { "asar": { "unpack": ["**/*.node", "Resources/**"] } } }
```

<details>
<summary>Why consolidate ASAR options under <code>asar</code>?</summary>

In v26, `asarUnpack` lived alongside `asar`, and `disableSanityCheckAsar` / `disableAsarIntegrity` lived at the root of `Configuration`. This was confusing: `asarUnpack` is meaningless when `asar: false`, yet nothing in the type system expressed that relationship. Moving all options under a single `asar` key makes the dependency explicit. The `asar: true` sentinel was left in place — it is redundant next to `{}`, but rejecting it would break working configs for no benefit, so `migrate-schema` merely drops it when folding in other ASAR keys.

</details>

### `asar: true` (still valid — no action needed)

**`asar: true` remains valid in v27.** The type is `AsarOptions | boolean | null`, the schema accepts a boolean, and the runtime maps `true` to `{}` — so an existing `asar: true` keeps working exactly as before. It is simply redundant, because ASAR is enabled by default:

```json5
{ "build": { "asar": true } }  // Still works — but redundant
{ "build": { "asar": {} } }    // Equivalent; or omit the key entirely
```

`migrate-schema` drops the redundant root-level `true` (folding any other ASAR keys into an `asar` object instead). The full ASAR restructuring is documented under [ASAR options → `asar`](#asar-options-asar).

### `files` / `extraResources` / `extraFiles` → `fileOptions` {#file-options-fileoptions}

The three options that choose which files are copied into the app are grouped under a `fileOptions` object, the same way `directories` groups the input and output directories. This applies at the configuration root and in every platform section (`mac`, `mas`, `masDev`, `win`, `linux`). `PlatformSpecificBuildOptions` has a `fileOptions?: FilesBuildOptions | null` property for them and does not extend `FilesBuildOptions`.

| Key | Location under `fileOptions` |
|---|---|
| `files` | `fileOptions.files` |
| `extraResources` | `fileOptions.extraResources` |
| `extraFiles` | `fileOptions.extraFiles` |
| `<platform>.files` / `.extraResources` / `.extraFiles` | `<platform>.fileOptions.files` / `.extraResources` / `.extraFiles` |

```json5
{
  "fileOptions": { "files": ["dist/**/*", "package.json"], "extraResources": [{ "from": "assets/bin", "to": "bin" }] },
  "mac": { "fileOptions": { "extraFiles": ["mac-only/**"] } }
}
```

Run `electron-builder migrate-schema` to move `files`, `extraResources` and `extraFiles` keys into `fileOptions`, at the root and per platform:

```bash
npx electron-builder migrate-schema
```

The values are glob strings and `FileSet` objects. A platform's lists are added to the root ones, and a `files` list from an `extends` parent is merged with the child's.

Unlike the other keys on this page, flat `files` / `extraResources` / `extraFiles` keys do not fail the build: they are applied as their `fileOptions` counterparts with a warning. Hooks and `build()` callers that read these keys from the loaded configuration are covered on the [Developer-only page](./v27-developer-changes.md#hooks-reading-file-options).

<details>
<summary>Flat keys, conflicts and other edge cases</summary>

**Keys set outside `fileOptions`.** The `Configuration` types and the JSON schema only have `fileOptions`, so a typed (TypeScript) config that sets `files`, `extraResources` or `extraFiles` directly on the configuration or a platform section does not compile. At runtime, such flat keys (from a config file, an `extends` parent, `-c.files=…` on the command line, or the `config` object passed to `build()`) are applied as their `fileOptions` counterparts before the configuration is validated, and the build logs one warning naming the keys found and where they belong.

**If a flat key and its `fileOptions` counterpart are both set on the same object**, `fileOptions` wins: the flat key is ignored and the build warns about the conflict. `migrate-schema` removes such a flat key with a warning, so move any patterns you still need into `fileOptions` yourself. A flat key from another source is merged rather than ignored: a CLI override such as `-c.files=…` is added to the config file's `fileOptions.files`, and a parent config's flat keys are merged with the child's `fileOptions`.

`fileOptions` must be an object. A list written directly under it (`"fileOptions": ["dist/**"]`) fails the build with a message showing the nested form.

`flatpak.files` (a list of `[source, destination]` pairs) is a separate Flatpak option and is not affected.

</details>

<details>
<summary>Why nest <code>files</code>, <code>extraResources</code> and <code>extraFiles</code> under <code>fileOptions</code>?</summary>

A `fileOptions` property, like `directories`, keeps the three file-copy lists together instead of at the root of every configuration level next to dozens of unrelated options, gives them one place in the docs and in IntelliSense, and leaves room for more file-copy options without adding them to every configuration level. Because almost every configuration sets `files`, flat keys are applied with a warning rather than rejected, unlike the other restructurings on this page, and reads of them from the loaded configuration are forwarded.

</details>

### `includePdb` → `fileOptions.excludedExts` {#includepdb-fileoptionsexcludedexts}

The root-level `includePdb` boolean is **removed**. v26 excluded a fixed list of file extensions from the packaged app, and `.pdb` (Program Database) symbol files were the only ones with a switch: they were excluded unless `includePdb` was `true`. In v27 `pdb` is one of the extensions excluded by default, and the boolean for one extension is replaced by a list for all of them: `fileOptions.excludedExts`, set at the configuration root or per platform (`mac`, `mas`, `masDev`, `win`, `linux`).

<details>
<summary>How <code>excludedExts</code> lists work</summary>

- `"default"` expands to the built-in list: `iml`, `hprof`, `orig`, `pyc`, `pyo`, `rbc`, `swp`, `csproj`, `sln`, `slnx`, `suo`, `xproj`, `cc`, `d.ts`, `mk`, `a`, `o`, `obj`, `forge-meta`, `pdb`.
- Any other entry adds that extension, e.g. `"map"`. Write it without a dot or glob (a leading `.` is ignored); an entry that is not a file extension fails the build.
- An entry starting with `!` removes that extension from the others listed, wherever it appears in the list: `["default", "!pdb"]` is every default except `pdb`. `"!default"` is rejected. A list of removals only, such as `["!pdb"]`, is rejected too: a list without `"default"` replaces the defaults, so it would exclude no extension at all. Write `["default", "!pdb"]`. A `"!ext"` in a list that does not otherwise list that extension (e.g. `["map", "!pdb"]`) has no effect and logs a warning.
- The list **replaces** the defaults rather than being merged with them: list `"default"` to extend them. `["map"]` excludes only `.map` files, `[]` excludes no extension, and `null` (or omitting the option) is `["default"]`.
- An invalid list (an entry that is not a file extension, `"!default"`, or removals only) fails the build when the configuration is validated, before anything is packed. This applies at the root and in every platform section, whichever targets the build packs: a typo in `masDev.fileOptions.excludedExts` also fails a Windows build. The error names the option, e.g. `masDev.fileOptions.excludedExts`.
- A single entry may be written as a string: `"excludedExts": "default"` is `["default"]`. This is how to set it on the command line: `-c.fileOptions.excludedExts=default`. For several entries, repeat the flag, e.g. `-c.fileOptions.excludedExts=default -c.fileOptions.excludedExts=!pdb` for `["default", "!pdb"]` (in an interactive bash or zsh, write the second one as `'-c.fileOptions.excludedExts=!pdb'`, single-quoted, so that `!pdb` is not expanded).
- A later list **replaces** an earlier one rather than being added to it (unlike the `files` lists), so a later list can drop an earlier `"!pdb"`. For the root and for each platform section, the last layer that sets the list wins: the `extends` parents in order (a parent after its own parents), then the configuration file, then the programmatic or `-c` configuration. For the `mas` and `mas-dev` targets, a `mas` list then replaces the `mac` one, and a `masDev` list (for `mas-dev`) replaces both. A platform's list then replaces the root one, whichever layer set either: a parent's `win.fileOptions.excludedExts` replaces the child's root list in Windows builds. A `null` value keeps the earlier list.
- The extensions are excluded from the app files and from the copied `node_modules`. A `fileOptions.files` pattern that names an excluded extension includes only the app files it matches: `**/*.pdb` every `.pdb` file outside `node_modules` and the build resources and output directories, `native/addon.pdb` only that file, as described under [`disableDefaultIgnoredFiles`](#disabledefaultignoredfiles).
- A `fileOptions.files` pattern that names `.pdb` files (e.g. `native/*.pdb` or `**/*.{node,pdb}`) now includes the `.pdb` files it matches, also in a configuration that extends this one. In v26, `.pdb` files were excluded whatever `files` said unless `includePdb` was `true`. `migrate-schema` reports such patterns (as an advisory). To keep the `.pdb` files out, remove the pattern or add a negation after it, such as `!native/*.pdb`.

</details>

```json5
// Before (v26)
{ "build": { "includePdb": true } }
// After (v27) — the default extensions except pdb
{ "build": { "fileOptions": { "excludedExts": ["default", "!pdb"] } } }

// Before (v26) — the default, which also overrode an includePdb: true of another config layer (e.g. an extends parent)
{ "build": { "extends": "./base.json", "includePdb": false } }
// After (v27) — the default list, written out so that it keeps replacing that layer's ["default", "!pdb"]
{ "build": { "extends": "./base.json", "fileOptions": { "excludedExts": ["default"] } } }
```

```json5
{
  "fileOptions": { "excludedExts": ["default", "map"] },              // the defaults plus .map files
  "win": { "fileOptions": { "excludedExts": ["default", "!pdb"] } }   // Windows keeps .pdb files — and .map files, since this list replaces the root one
}
```

:::warning[Shipping symbol files]
`.pdb` files contain symbol names and the source paths of the build machine. Keep them (`["default", "!pdb"]`) only in internal builds or builds for a symbol server, or upload them to a symbol server instead of shipping them.
:::

<details>
<summary>How <code>migrate-schema</code> rewrites <code>includePdb</code></summary>

`migrate-schema` rewrites `includePdb` in static and JS/TS configs, reading the value as v26 did: v26 accepted `"true"` and `1` as `true`, and `"false"`, `0` and `null` as `false`. `true` becomes `"fileOptions": { "excludedExts": ["default", "!pdb"] }`. `false` becomes `"fileOptions": { "excludedExts": ["default"] }`, with or without `extends`: this is the v27 default, written out because in v26 an explicit `false` overrode an `includePdb: true` of another config layer (an `extends` parent, an earlier entry of an `extends` list, or the config file a programmatic or `-c` configuration is layered on), which a single file does not show; the written-out list keeps replacing that layer's `["default", "!pdb"]`. You can remove it when no other config layer keeps `.pdb` files. Next to an existing root `fileOptions.excludedExts`, which already replaces the other layers' lists, `false` is just removed. For `true`, when a platform section already sets its own `fileOptions.excludedExts` that excludes `.pdb` files (it lists `"default"` or `"pdb"`), `"!pdb"` is appended to that list too, because it replaces the root one; an existing root list gets `"!pdb"` the same way. A list that does not exclude `.pdb` files is left as it is, and so, in a JS/TS config, is a root list with an element the codemod cannot read (e.g. `[...base]`), which is reported. A value v26 rejected (e.g. `"yes"` or `2`) is left in place with a warning. In a JS/TS config, an `includePdb` whose value is not a literal (e.g. `includePdb: process.env.CI === "true"`) is left in place with a warning — rewrite it by hand — and for `includePdb: true`, a platform section the codemod cannot read (e.g. `win: sharedWin`) gets a warning: add `"!pdb"` to its `fileOptions.excludedExts` by hand if that list excludes `.pdb` files. A config that still sets `includePdb` fails the build with a message naming `fileOptions.excludedExts`, and so does an `includePdb` passed programmatically or with `-c`, which `migrate-schema` does not see: remove it, or, where an `includePdb: false` overrides an `includePdb: true` of the configuration file or an `extends` parent, set `"fileOptions": { "excludedExts": ["default"] }` in its place (on the command line, `-c.fileOptions.excludedExts=default`).

</details>

### macOS signing → `mac.sign` {#macos-signing-macsign}

All macOS code-signing options now live inside a single `sign` object on `mac` (and `mas` / `masDev`), mirroring the Windows `win.sign` grouping. `mac.sign` is typed as `CustomMacSign | ElectronSignOptions | string | null`, where `ElectronSignOptions` is a typed pass-through to [`@electron/osx-sign`](https://github.com/electron/osx-sign).

| Removed (`mac.*`) | Replacement (`mac.sign.*`) |
|---|---|
| `identity` | `sign.identity` |
| `entitlements` | `sign.entitlements` |
| `entitlementsInherit` | `sign.entitlementsInherit` |
| `entitlementsLoginHelper` | `sign.entitlementsLoginHelper` |
| `provisioningProfile` | `sign.provisioningProfile` |
| `type` | `sign.type` *(defaults to a value derived from the target: `mas-dev` builds default to `development`, everything else to `distribution`; an explicit value wins)* |
| `binaries` | `sign.binaries` |
| `requirements` | `sign.requirements` |
| `hardenedRuntime` | `sign.hardenedRuntime` |
| `gatekeeperAssess` | *(removed — `@electron/osx-sign` 2.x dropped the `spctl --assess` step; there is no `sign.gatekeeperAssess`)* |
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

A few of these accepted `null` in v26 as "unset" but do not in v27 (`type`, `provisioningProfile`, `binaries`, `signIgnore`, `singleArchFiles`, `x64ArchFiles`); `migrate-schema` drops those `null`s instead of moving them. `identity: null` is kept — it still means "skip signing".

:::warning[Custom signing functions]
If you used `mac.sign` as a **custom signing function or module path** (`sign: "./customSign.js"`) together with sibling fields like `identity`, the two can no longer coexist — `sign` is now a single union. `migrate-schema` leaves your custom signer untouched and prints a warning so you can decide whether to keep the custom function or switch to an `ElectronSignOptions` object.
:::

<details>
<summary>Why consolidate macOS signing under <code>mac.sign</code>?</summary>

In v26, ~15 signing options were scattered across the root of `MacConfiguration` intermixed with unrelated packaging options. Grouping them under a single `sign` object makes the signing surface self-documenting and matches the Windows `win.sign` grouping. `sign` is now a typed pass-through (`ElectronSignOptions`) to `@electron/osx-sign`, so upstream options are forwarded directly. Note that `ElectronSignOptions` is a closed type (`additionalProperties: false`): a field added by a newer `@electron/osx-sign` is rejected until electron-builder regenerates its schema, so it is a pass-through of the options that exist, not an open bag. `signIgnore` was renamed to `sign.ignore` to match the osx-sign canonical name. The same grouping rationale produced `mac.universal` (a pass-through to `@electron/universal`).

</details>

### `mac.universal` {#macuniversal}

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

#### Custom Windows signing hooks move to `win.sign.sign`

In v26 the **custom signer hook** lived at `win.signtoolOptions.sign`. v27 reuses the `win.sign` key for the discriminated union, and the hook lives inside the signtool-family config, so it moves together with the rest of `signtoolOptions`:

```json5
{ "win": { "signtoolOptions": { "sign": "./customSign.js" } } }          // Before (v26)
{ "win": { "sign": { "type": "signtool", "sign": "./customSign.js" } } } // After (v27)
```

`migrate-schema` performs this move. (A top-level `win.sign: "./customSign.js"` is a pre-v26 shape that v26 already rejected; move it under `{ "type": "signtool", "sign": … }` by hand.)

A hook now also needs `win.sign.publisherName`, even with a certificate configured (the publisher name of a hook is never derived from a certificate) — see [Windows `publisherName`](./v27-build-changes.md#windows-publishername-is-validated-against-the-signing-certificate).

#### `win.signExecutable` / `win.signAndEditExecutable` removed {#winsignexecutable-winsignandeditexecutable-removed}

| Removed | Replacement |
|---------|-------------|
| `win.signExecutable: false` | `win.sign: false` (disables signing; resource editing still runs) |
| `win.signExecutable: true` | *(deleted — signing is enabled by default when credentials are available)* |
| `win.signAndEditExecutable: true` | *(deleted — resource editing always runs)* |
| `win.signAndEditExecutable: false` | `win.sign: false` for the signing half; no equivalent for skipping resource editing — see note below |

:::warning
`win.signAndEditExecutable: false` formerly skipped both resource editing (icon, metadata) and signing. In v27 resource editing always runs. `migrate-schema` maps the signing half to `win.sign: false` and warns about the rest. If you need to skip resource editing for a specific artifact, apply resources manually after building.
:::

Both flags set to `false` skipped **all** signing in v26, so any `win.signtoolOptions` / `win.azureSignOptions` next to them never applied. `migrate-schema` removes those blocks (naming them in a warning, without printing their values) rather than turning signing on; to sign in v27, replace `win.sign: false` with a `win.sign: { type: … }` object.

<details>
<summary>Why unify all Windows signing under <code>win.sign</code>?</summary>

In v26, Windows signing was split across two sibling root-level keys — `signtoolOptions` and `azureSignOptions` — with precedence rules that were easy to misconfigure (both present → Azure wins, silently). v27 replaces them with a single `win.sign` key typed as a discriminated union. This makes the active signing mode explicit, self-documenting in IntelliSense, and mirrors the macOS `mac.sign` shape so both platforms have the same mental model. The `win.sign: false` sentinel explicitly disables signing, distinguishing it from "not configured" (env-based discovery).

</details>

<details>
<summary>Why replace <code>[k: string]</code> in <code>WindowsAzureSigningConfiguration</code>?</summary>

The v27 Azure integration switches from PowerShell `Invoke-TrustedSigning` to `signtool.exe /dlib /dmdf`, which reads a `metadata.json` file. An explicit `additionalMetadata: Record<string, string>` field is cleaner than an index signature because it makes intent visible in IntelliSense and prevents accidental shadowing of the typed fields. The legacy PowerShell path remains available (triggered when `toolsets.winCodeSign` is pinned below `"1.3.0"`).

</details>

### `electronDownload` → `electronGet` {#electrondownload-electronget}

The `electronDownload` configuration key is renamed to `electronGet` and reshaped to match [`@electron/get`](https://github.com/electron/get)'s options directly (v27 upgrades to `@electron/get` v5, which downloads via `fetch`).

| Old `electronDownload.*` | New `electronGet.*` |
|---|---|
| `mirror` | `mirrorOptions.mirror` |
| `isVerifyChecksum: false` | `unsafelyDisableChecksums: true` |
| `cache` | *(not a config key — set the `ELECTRON_BUILDER_CACHE` environment variable)* |
| `customDir`, `customFilename`, `strictSSL`, `force`, `platform`, `arch`, `version` | *(no equivalent — dropped by `migrate-schema` with a warning)* |

```json5
{ "electronDownload": { "mirror": "https://my-mirror/" } }                  // Before
{ "electronGet": { "mirrorOptions": { "mirror": "https://my-mirror/" } } }  // After
```

<details>
<summary>Why rename <code>electronDownload</code> to <code>electronGet</code>?</summary>

v27 upgrades to `@electron/get` v5, which downloads via `fetch` (replacing the `got`-based path) and exposes a `mirrorOptions` object rather than the old flat `mirror`/`customDir` fields. Renaming the config key to `electronGet` and typing it directly as the library's own options removes electron-builder's hand-maintained translation layer — what you set is what `@electron/get` receives. A few legacy fields (`customDir`, `customFilename`, `strictSSL`) have no v5 equivalent; `migrate-schema` drops them with a warning. `cache` is not gone — it moved out of the config surface and is set with the `ELECTRON_BUILDER_CACHE` environment variable instead.

</details>

### `ElectronGetOptions.force` removed {#electrongetoptionsforce-removed}

The `force` field has no equivalent in `@electron/get` v5 and was dropped from `ElectronGetOptions`. Clear the cache directory instead (or set `ELECTRON_BUILDER_CACHE` to a fresh path) to force a re-download. `migrate-schema` drops it with a warning.

### `snap` → `snapcraft` {#snap-snapcraft}

The top-level `snap` configuration key is removed. Use `snapcraft` with an explicit `base` field and per-base options nested under a sub-key named after the base.

```json5
// Before
{ "build": { "snap": { "confinement": "strict", "stagePackages": ["libfoo"], "base": "core22" } } }

// After
{ "build": { "snapcraft": { "base": "core22", "core22": { "confinement": "strict", "stagePackages": ["libfoo"] } } } }
```

Supported `base` values: `"core18"`, `"core20"`, `"core22"`, `"core24"`, and `"custom"`. `migrate-schema` performs this restructuring; when the old config has no `base`, it assumes `"core20"` and warns so you can confirm. A `base: "custom"` config (inline/path `snapcraft.yaml`) is moved verbatim. The `SnapOptions` export is also removed — see [Removed exports](./v27-developer-changes.md#removed-exports).

<details>
<summary>Why restructure <code>snap</code> into <code>snapcraft</code>?</summary>

The `snapcraft` shape makes the `base` explicit and nests per-base options under a base-named sub-key, so a single config can describe multiple bases unambiguously and core24 (which uses the snapcraft CLI directly) can coexist with legacy bases. `migrate-schema` automates the move but assumes `core20` when no base is present, because that is the v27 1-to-1 migration target — verify the assumption for your project.

</details>
