---
title: "v27 Build & Publish Changes"
sidebar_label: "Build & Publish"
---

# v27 Build & Publish Changes

What the build machine and CI need, what the build now validates or rejects, and how publishing and update metadata changed. Part of the [v27 Breaking Changes](./v27-breaking-changes.md) reference.

**How you'll find out:** most changes on this page **fail the build** or **warn** with a link to their section. Each entry starts with a **How you'll find out** line. The ones marked **Silent** or **Info log only** won't stop or warn you, so read those. Changes that only show up when publishing (signing keys, S3 credentials, feed conflicts) need a **publishing** build to surface.

:::info[Toolsets now default to the newest bundle ("latest")]
In v27 every `toolsets.*` property defaults to **`"latest"`**: an **unset** property and the literal `"latest"` both resolve to the **newest published bundle** for that toolset. No config change is required, but the effective defaults moved. The one most likely to affect you: **`wine` → `"system"`**, the host-installed Wine (started by absolute path from its install locations or [`toolsets.executables.wine`](../toolsets.md#executables), never from `PATH`), so **building Windows targets on macOS now requires Wine on the host** (`brew install --cask wine-stable`). Pin a toolset to `"0.0.0"` to stay on a legacy bundle. Full breakdown in [Toolset defaults resolve to `"latest"`](#toolset-defaults-resolve-to-latest-newest-bundle).
:::

## At a glance {#at-a-glance}

| Change | Announced | Action required |
|--------|---|----------------|
| [Node.js >=22.12.0 required](#nodejs-22120-required) | Fails build | Update your runtime and CI Node version |
| [Implicit `--publish` removed](#implicit-publish-removed) | Warns | Pass `--publish` explicitly |
| [`--em.build` / `--em.directories` CLI flags removed](#removed-flags-embuild-emdirectories) | Fails build | Use `-c` / `-c.directories` |
| [Toolset defaults resolve to `"latest"`](#toolset-defaults-resolve-to-latest-newest-bundle) | Info log | No action; pin to `"0.0.0"` to restore a legacy bundle. **Wine is now the host install** — building Windows targets on macOS needs Wine installed |
| [Azure Trusted Signing `/dlib` is the default](#azure-trusted-signing-signtool-dlib-is-the-default) | Info log | Pin `winCodeSign` below `1.3.0` only to force the legacy PowerShell path |
| [Toolset env-var overrides removed](#toolset-env-var-overrides-removed) | Fails build | Replace `APPIMAGE_TOOLS_PATH`, `ELECTRON_BUILDER_NSIS_DIR`, `USE_SYSTEM_WINE`, … with `toolsets.X: { url, checksum }` — setting a removed variable now **fails the build** |
| [`CI_BUILD_TAG` env var removed](#ci_build_tag-environment-variable) | Warns, then fails | Use `CI_COMMIT_TAG` |
| [`node_modules` arch/os-filtered on every build](#node_modules-are-now-archos-filtered-on-every-build) | Info log | Awareness — packages whose `cpu`/`os` mismatch the target are now excluded |
| [Redundant production `dependencies` excluded, not rejected](#redundant-production-dependencies-are-excluded-not-rejected) | Info log / warns | `electron`/`electron-builder` are excluded from the copied `node_modules` (was a hard error); tune the set via `ignoredProductionDependencies`. If you set `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` (removed) to bundle `electron-builder`, override the list instead; `electron-prebuilt`/`electron-rebuild` no longer error and now ship if declared — remove them from `dependencies` |
| [`allowMissingDependencies` now fails the build](#allowmissingdependencies-now-fails-the-build) | Fails build | A missing production dependency is a hard error; set `allowMissingDependencies: true` to restore v26 warn-only behavior |
| [Native binaries are verified against the target](#native-binaries-are-verified-against-the-target) | Fails build | A `.node` addon built for another platform/arch now fails the build; set `nativeModules.verifyNativeBinaries: "warn"` (or `false`) to package anyway |
| [`extraFiles` / `extraResources` `to` is validated](#extrafiles--extraresources-destinations-are-validated) | Fails build | An absolute `to`, or one escaping the output dir, now throws |
| [`asar.ordering` is now applied](#asar-ordering-is-now-applied) | Warns; missing file fails | v26 ignored the option; v27 packs the listed files first and fails when the file is missing. Remove the option to keep the dependencies-first layout |
| [`arch: "all"` now expands to x64 + arm64; 32-bit fails fast on Electron 44+](#arch-all-now-expands-to-x64-and-arm64-32-bit-fails-fast-on-electron-44) | Warns / fails | `arch: "all"` drops `ia32` — request `ia32` explicitly; ia32/armv7l require `electronVersion` <= 43.x |
| [macOS `productName`/`executableName` validated, not silently sanitized](#macos-productname-and-executablename-are-validated-not-sanitized) | Fails build | A name needing filename sanitization now throws — pick a name that needs none |
| [macOS names are no longer NFD-normalized](#macos-productname-and-executablename-are-validated-not-sanitized) | Silent | Update tooling that matches the normalized on-disk bundle filename |
| [Windows `publisherName` validated against the certificate](#windows-publishername-is-validated-against-the-signing-certificate) | Fails build | Update `publisherName` after a certificate rotation, or drop it. Custom `win.sign.sign` hooks (even with a certificate configured) and certificates without a CN now **require** it when `app-update.yml` is written (or set `win.verifyUpdateCodeSignature: false` if your updates are not Authenticode-signed) |
| [Windows `publisherName` must be a distinguished name](#windows-publishername-must-be-a-distinguished-name) | Fails build, advisory | Set every `win.sign.publisherName` entry to a distinguished name (e.g. `"CN=My Company, O=My Company, C=US"`) — a bare name now **fails the build**, and electron-updater 7 never matches it. Without `publisherName`, the build now writes `CN=<common name>` of the certificate (a DN) instead of the bare Common Name |
| [A missing Windows `publisherName` fails update verification](#missing-publishername-fails-update-verification) | Fails build, advisory | A Windows build that writes `app-update.yml` without a `publisherName` (`win.sign: false` / `null`, no certificate, `publisherName: null`) now **fails the build**, and electron-updater 7 rejects updates whose `app-update.yml` has none. Sign the build, set `win.sign.publisherName`, or set `win.verifyUpdateCodeSignature: false` (the only opt-out) |
| [`forceCodeSigning` covers notarization and update manifests](#forcecodesigning-covers-notarization-and-update-manifests) | Fails build (with `forceCodeSigning`) | Provide notarization credentials and the update-manifest signing key wherever `forceCodeSigning` is set, or opt out explicitly (`mac.notarize: false`, `updateManifest: false`); pass `-c.forceCodeSigning=false` to pull-request and local builds that cannot sign |
| [`mac.notarize: true` requires notarization credentials](#mac-notarize-true-requires-credentials) | Fails build (with `notarize: true`) | Only if you set `mac.notarize: true`: set the notarization credentials, or leave `notarize` unset to notarize only when they are set |
| [Signed update manifests are required](#signed-update-manifests-are-required) | Fails when publishing (or with `forceCodeSigning`) | Generate a key with `electron-builder create-update-key` and set `ELECTRON_BUILDER_UPDATE_SIGN_KEY` to the base64-encoded PEM file, or set `updateManifest: false` to keep publishing unsigned manifests |
| [Signing key must be in `updateManifest.publicKey`](#signing-key-must-be-in-updatemanifestpublickey) | Fails when publishing | Only if you set `updateManifest.publicKey`: list a key the build signs with, or set `updateManifest.allowSigningKeyOutsideTrustList: true` for a deliberate cutover release |
| [`app-update.yml` feed follows the update-writing targets](#app-updateyml-feed-follows-the-update-writing-targets) | Silent (conflicts fail) | Only with target-level `publish` (e.g. `nsis.publish`), targets of one app with different feeds, or a first provider with `publishAutoUpdate: false`: check which feed installs will poll |
| [Suffixed channels expand to lower channels](#suffixed-update-channels-now-expand-to-lower-channels) | Warns | Only with `generateUpdatesFilesForAllChannels`: a `beta-*`/`latest-*` channel now writes 2–3 yml files instead of 1 |
| [`latest*.yml` drops legacy top-level `path`/`sha512`](#latestyml-drops-legacy-top-level-pathsha512) | Silent | None for electron-updater >=2.16 (all modern clients); set `electronUpdaterCompatibility` to a legacy-inclusive range only if you still ship apps embedding electron-updater 1.x–2.15 |
| [S3 publishing requires an explicit `awsCredentials.source`](#s3-publishing-requires-an-explicit-awscredentialssource) | Fails at publish | Add `awsCredentials: { source: "env" }` (for `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`), `{ source: "profile", profile: "<name>" }` (for `AWS_PROFILE` / `~/.aws` / SSO) or `{ source: "sso-role-chain", profile: "<name>" }` (for a role assumed from an SSO `source_profile`) |
| [Bitbucket Cloud publishing: token without username → Bearer auth](#bitbucket-cloud-publishing-token-without-username-uses-bearer-auth) | Warns at publish | Set `BITBUCKET_USERNAME` if your token is an app password / API token |
| [Flatpak target requires `flatpak` >= 1.12.4 and `flatpak-builder` >= 1.2.2](#flatpak-tooling-requirements) | Fails build | Only for tools older than the stock packages of Ubuntu 22.04 and Debian 12: update them (the `electronuserland/builder` images with a date tag newer than `-05.26` include them, those up to `-05.26` none); replace `DEBUG=@malept/flatpak-bundler` with `DEBUG=electron-builder` |
| [Flatpak `runtimeVersion` / `baseVersion` default to `26.08`](#flatpak-tooling-requirements) | Warns | A build that sets neither is built for the `26.08` runtime and installs the three `26.08` refs (about 3.2 GB) on the build machine if they are missing — install them in images and on offline machines that held the `20.08` ones. Set both to `"20.08"` to keep the previous, end-of-life runtime |
| [Flatpak `files` and `symlinks` must stay inside the app](#flatpak-tooling-requirements) | Fails build | A `flatpak.files` destination or `flatpak.symlinks` link that leaves the app prefix with `..`, or a directory in `flatpak.files` copied onto a symlink to a directory, now fails the build |

---

## Node.js & CLI {#nodejs-cli}

### Node.js >=22.12.0 required {#nodejs-22120-required}

**How you'll find out:** **Fails the build.** electron-builder refuses to start on an older Node.js and links here.

v27 requires **Node.js 22.12.0 or later**. This is the version where Node's [`require(esm)`](https://nodejs.org/en/blog/release/v22.12.0) support was stabilized (no flags needed), which allows both CJS and ESM consumers to use these packages without any code changes.

```json
{
  "engines": {
    "node": ">=22.12.0"
  }
}
```

See the walkthrough for [updating your runtime, CI, and Docker images](./v26-to-v27#step-2-update-nodejs).

### Implicit `--publish` removed {#implicit-publish-removed}

**How you'll find out:** **Warns during the build** when a CI tag and a publish configuration are present but no `--publish` flag is passed.

v27 no longer auto-publishes based on the presence of CI tag environment variables, git tags, or npm lifecycle events. Pass `--publish <always|onTag|onTagOrDraft|never>` explicitly in your release scripts, or set the `publish` option in your configuration.

> **Why:** unexpected auto-publishing could accidentally expose secrets or publish unfinished work. Making publishing explicit closes that hole.

### Implicit publish on `npm run release` removed

**How you'll find out:** **Silent.**

electron-builder no longer inspects `npm_lifecycle_event`: naming your npm/yarn/pnpm script `release` (e.g. `npm run release`) no longer forces publishing on. Publish explicitly instead — pass a `--publish` flag (`--publish always`, `--publish onTag`, `--publish onTagOrDraft`) or set the `publish` option in your electron-builder config.

### Removed flags: `--em.build`, `--em.directories` {#removed-flags-embuild-emdirectories}

**How you'll find out:** **Fails the build** (these flags have thrown since v22).

These flags are removed (they have thrown since v22).

| Removed flag | Replacement |
|---|---|
| `--em.build` | `-c` (pass build config inline) |
| `--em.directories` | `-c.directories` |

---

## Toolsets & environment variables {#toolsets-environment-variables}

### Toolset defaults resolve to `"latest"` (newest bundle) {#toolset-defaults-resolve-to-latest-newest-bundle}

**How you'll find out:** **Info log only.** The build logs which toolset version it uses, with a link here, but not that the default changed. Without Wine installed, a macOS build that needs it fails with a bare `spawn wine ENOENT`.

In v27 every `toolsets.*` property defaults to **`"latest"`** — an unset property or the literal `"latest"` resolves to the **newest published bundle** for that toolset. (Earlier v27 prereleases pinned a fixed default per toolset; those fixed defaults are gone.) (In v26 an unset or `null` toolset resolved to the legacy `"0.0.0"` bundle, so pin `"0.0.0"` if you need to stay on it.) A `null` value and the retired `appimage: "1.0.2"` pin are config changes: see [`toolsets.*: null` rejected](./v27-config-changes.md#toolsets-null-rejected).

| Toolset | v26 default | v27 `"latest"` resolves to | What the upgrade entails |
|---------|-------------|----------------------------|--------------------------|
| `wine` | `0.0.0` (Wine 4.0.1, macOS only) | `system` | Host-installed Wine, on macOS and Linux, started by absolute path from its install locations or [`toolsets.executables.wine`](../toolsets.md#executables), never from `PATH`. **Requires a host Wine on macOS** — see the note below. The `"1.0.1"` Wine 11.0 bundle still downloads when pinned, but ships no PE builtins and cannot run Windows tools on its own |
| `winCodeSign` | `0.0.0` (winCodeSign 2.6.0) | `1.3.1` | Windows Kits 10.0.26100.0; `osslsigncode` 2.11 + native arm64; bundles the Azure Trusted Signing `dlib` + .NET 8 runtime |
| `appimage` | `0.0.0` (FUSE2 runtime) | `1.1.0` | Static FUSE3-compatible runtime (runs without a host FUSE install); adds `unsquashfs` support |
| `nsis` | `0.0.0` (NSIS 3.0.4.1, split bundle) | `1.2.1` | NSIS 3.12; unified single-archive bundle; entrypoint scripts auto-set `NSISDIR` |
| `fpm` | `2.2.1` | `2.2.1` | Unchanged — FPM 1.17.0 / Ruby 3.4.3 |
| `icons` | `1.1.0` | `1.2.3` | Newer bundle — `wasm-vips` + `@resvg/resvg-wasm`; 16/32 px ICNS entries written as ARGB |
| `linuxToolsMac` | `1.0.0` | `1.0.1` | Same tools rebuilt to run on macOS 15+ (1.0.0 required macOS 26) |
| `sevenZip` | `1.0.0` | `1.0.1` | Correct per-arch Windows `7za.exe` (x64, ia32, arm64) |
| `squirrel` | *(electron-winstaller npm package)* | `1.1.1` | New toolset — Squirrel.Windows vendor bundle, replaces the `electron-winstaller` dependency |

**No action required** for most projects — the new bundles are drop-in replacements and produce identical output. **`wine` is the exception:** its default is no longer a bundle at all, so a macOS host that builds Windows targets now needs Wine installed (`brew install --cask wine-stable`). If you hit a regression introduced by a newer bundle, pin back by setting the toolset version to `"0.0.0"`:

```json5
{ "build": { "toolsets": { "winCodeSign": "0.0.0", "nsis": "0.0.0", "appimage": "0.0.0", "wine": "0.0.0" } } }
```

This escape hatch is intended as a short-term workaround. The `"0.0.0"` alias may be removed in a future major release.

Legacy-base snap template builds (`core18`/`core20`/`core22` with `useTemplateApp`) now pack with the `mksquashfs` from `toolsets.appimage` instead of always using the legacy `"0.0.0"` bundle, so an `appimage: "0.0.0"` pin applies to them too — and its `mksquashfs` supports only `gzip`/`xz`, so snap `compression: "lzo"` (or `linux.compression: "store"`) needs a newer toolset.

### Azure Trusted Signing `signtool /dlib` is the default {#azure-trusted-signing-signtool-dlib-is-the-default}

**How you'll find out:** **Info log only.** Each signed file logs which signing path was used. Falling back to the legacy PowerShell path logs a line that links here.

Azure Trusted Signing (`win.sign: { type: "azure" }`) uses the faster `signtool /dlib` path automatically: the default `winCodeSign` (`"latest"` → `1.3.1`) ships the ATS `dlib` + .NET 8 payload, so no pin is required. To **force the legacy** PowerShell `Invoke-TrustedSigning` path instead (which requires the `TrustedSigning` PS module in the signing environment), pin `winCodeSign` below `1.3.0`:

```json5
{ "build": { "toolsets": { "winCodeSign": "1.2.1" } } } // or "0.0.0" — forces the legacy PowerShell signing path
```

The signer resolves the path from the `winCodeSign` value: unset / `null` / `"latest"` and any explicit version `>= 1.3.0` use `signtool /dlib`; a version below `1.3.0` (no `dlib` in the bundle) uses PowerShell. A `ToolsetCustom` object uses `dlib` from your supplied bundle.

### Toolset env-var overrides removed {#toolset-env-var-overrides-removed}

**How you'll find out:** **Fails the build** for most variables. Five variables only warn (see below). Both the warning and the error link here.

**This is a breaking change if you used env-var toolset overrides.** The following environment variables are **removed** — replace each with a [`ToolsetCustom`](#toolset-env-var-overrides-removed) object on the relevant `toolsets` key:

| Removed env var | Toolset it controlled | Replace with |
|---|---|---|
| `APPIMAGE_TOOLS_PATH` | AppImage build tools (`mksquashfs`, runtime) | `toolsets.appimage` |
| `MKSQUASHFS_PATH` | `mksquashfs` for legacy (core18/20/22) snap builds | `toolsets.appimage` |
| `LINUX_TOOLS_MAC_PATH` | Linux-tools-mac bundle (`ar`, `lzip`, `gtar`) | `toolsets.linuxToolsMac` |
| `CUSTOM_FPM_PATH` | FPM executable | `toolsets.fpm` |
| `ELECTRON_BUILDER_NSIS_DIR` | NSIS compiler bundle directory | `toolsets.nsis` |
| `ELECTRON_BUILDER_NSIS_RESOURCES_DIR` | NSIS resources/plugins directory | `toolsets.nsis` |
| `CUSTOM_NSIS_RESOURCES` | Alternate NSIS resources bundle | `toolsets.nsis` |
| `ELECTRON_BUILDER_WINE_TOOLSET_DIR` | Wine bundle directory | `toolsets.wine` |
| `ELECTRON_BUILDER_7ZIP_PATH` | 7-Zip executable | `toolsets.sevenZip` |
| `ELECTRON_BUILDER_ICONS_TOOLSET_DIR` | Icon-conversion tools bundle | `toolsets.icons` |
| `ELECTRON_BUILDER_OSSL_SIGNCODE_PATH` | `osslsigncode` binary | `toolsets.winCodeSign` |
| `ELECTRON_BUILDER_RCEDIT_PATH` | `rcedit` binary | `toolsets.winCodeSign` |
| `ELECTRON_BUILDER_WINDOWS_KITS_PATH` | Windows SDK / signtool kit directory | `toolsets.winCodeSign` |
| `SIGNTOOL_PATH` | Path to `signtool.exe` | `win.sign` / `toolsets.winCodeSign` |
| `USE_SYSTEM_WINE` | Forced the host-installed Wine instead of the downloaded bundle (now the default — `toolsets.wine: "system"`) | `toolsets.wine` (see note) |
| `USE_SYSTEM_SIGNCODE` | Forced the host `signtool`/`signcode` instead of the bundled `winCodeSign` toolset | `win.sign` + `winCodeSign` |
| `USE_SYSTEM_OSSLSIGNCODE` | Forced the host `osslsigncode` instead of the bundled one | `win.sign` + `winCodeSign` |
| `USE_SYSTEM_FPM` | Forced the host-installed `fpm` instead of the bundled FPM | `toolsets.fpm` |

> **v27 tells you at build start.** If any removed variable in this section is still set in the build environment, electron-builder logs a one-time deprecation warning naming the variable and its replacement, and for most of them then **fails the build** with a message naming the `toolsets` replacement. `MKSQUASHFS_PATH`, `CUSTOM_NSIS_RESOURCES`, `ELECTRON_BUILDER_OSSL_SIGNCODE_PATH`, `ELECTRON_BUILDER_RCEDIT_PATH` and `ELECTRON_BUILDER_WINDOWS_KITS_PATH` only warn: they no longer have any effect. Unset them once you have migrated to the `toolsets`/`win.sign` config.

The two signing `USE_SYSTEM_*` variables (`USE_SYSTEM_SIGNCODE`, `USE_SYSTEM_OSSLSIGNCODE`) have **no env-var replacement** — configure signing through [`win.sign`](./v27-config-changes.md#windows-signing-winsign) and the `winCodeSign` toolset instead. `USE_SYSTEM_WINE` is replaced by `toolsets.wine: "system"`, which is already the default. `USE_SYSTEM_FPM` is now **also removed** (it was still functional in earlier v27 prereleases): supply a custom FPM via `toolsets.fpm: { url: "file:///path/to/dir" }`. On Windows there is no bundled FPM, so an FPM-based target now **requires** an explicit custom `toolsets.fpm` and otherwise throws a clear configuration error (previously it silently fell back to a host `fpm` on `PATH`).

The `url` accepts an `https://` URL (downloaded and cached automatically) or a `file://` path (used as-is). The bundle must mirror the directory layout of the corresponding built-in bundle (see [electron-builder-binaries/packages](https://github.com/electron-userland/electron-builder-binaries/tree/master/packages)).

```json5
// Remote bundle (URL)
{ "build": { "toolsets": { "nsis": { "url": "https://example.com/my-nsis-bundle-1.0.tar.gz", "checksum": "<SHA-256 hex or base64 SHA-512 of the archive>", "version": "my-custom-1.0" } } } }

// Local directory (no checksum required)
{ "build": { "toolsets": { "appimage": { "url": "file:///path/to/my-appimage-tools-dir" } } } }
```

> **Wine note:** macOS and Linux both use the host-installed Wine by default (`"latest"` resolves to `"system"`), so `USE_SYSTEM_WINE` can simply be dropped. electron-builder starts it only from an absolute path, never from `PATH`: from its install locations, or from [`toolsets.executables.wine`](../toolsets.md#executables) for a Wine installed elsewhere. A custom Wine bundle is a `ToolsetCustom` object on `toolsets.wine`, whose directory must contain a prebuilt `wine-home` prefix alongside `bin/` and `lib/`.

Supported archive formats: `.zip`, `.7z`, `.tar.gz`, `.tar.xz`. **Exception for `sevenZip`**: because 7-Zip is used to extract `.7z` and `.tar.xz` archives, a custom `sevenZip` bundle can only be supplied as a `.tar.gz`, `.zip`, or bare `file://` directory.

### `CI_BUILD_TAG` environment variable {#ci_build_tag-environment-variable}

**How you'll find out:** **Warns, then fails the build**, with a link here.

Removed. Use `CI_COMMIT_TAG` (the standard GitLab CI variable) to provide the release tag. A build with `CI_BUILD_TAG` still set fails.

### `ELECTRON_BUILDER_BINARIES_ALLOW_HTTP` renamed {#electron_builder_binaries_allow_http-renamed}

**How you'll find out:** **Warns during the build**, with a link here, when the old name is set. The old name has no effect.

Renamed to `ELECTRON_BUILDER_DANGEROUSLY_ALLOW_HTTP` to make the security implication explicit. The behavior is unchanged: set it to `true` to permit non-`localhost` plain-HTTP mirror / download-override URLs that would otherwise be rejected. Set the new name instead; the old one is no longer read.

---

## Dependencies & file copying

### `node_modules` are now arch/os-filtered on every build {#node_modules-are-now-archos-filtered-on-every-build}

**How you'll find out:** **Info log only.** The build lists the excluded packages in one summary line.

v27 filters `node_modules` by each package's `package.json` `cpu` / `os` fields against the **target** arch and platform on **every** build (previously this effectively only mattered for `universal` macOS builds). A dependency that declares an incompatible `cpu`/`os` for the target is excluded from the packaged app, whereas v26 copied host-installed `node_modules` verbatim.

**No action is required for typical projects** — this fixes universal-build failures and produces correctly-scoped output. Be aware of it only if you *intentionally* bundled a cross-arch or cross-os optional binary that is now dropped; in that rare case, include it explicitly via `extraResources` / `files`.

### Redundant production `dependencies` are excluded, not rejected {#redundant-production-dependencies-are-excluded-not-rejected}

**How you'll find out:** **Info log only** for `electron` / `electron-builder`. **Warns during the build** when `electron-prebuilt`, `electron-rebuild` or `electron-nightly` are packaged. Setting the removed `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` variable **fails the build**.

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

In v26, this (undocumented) environment variable was the only way to keep `electron-builder` in `dependencies` without erroring, and setting it meant the package **was bundled** into the app. In v27 setting the variable fails the build, and the behavior is the opposite: `electron-builder` is in the default ignore list, so it is **silently excluded** from the copied `node_modules` (an info-level log is the only trace). If you relied on the env var to actually ship `electron-builder` inside your app, you must now override the list and drop `"electron-builder"` from it, e.g. `"ignoredProductionDependencies": ["electron"]`.

#### `electron-prebuilt` / `electron-rebuild` no longer error — and are NOT excluded {#electron-prebuilt-electron-rebuild-no-longer-error-and-are-not-excluded}

The v26 hard error also rejected `electron-prebuilt` and `electron-rebuild` in `dependencies`. v27 removes that guard **without** adding them to the default ignore list, so if you still declare them they now **ship inside your app** silently — `electron-prebuilt` drags a full Electron binary along. Both packages are long deprecated (`electron-prebuilt` was renamed to `electron` in 2016; `electron-rebuild` moved to `@electron/rebuild`), which is why this major release drops the special-casing instead of carrying it forward. `electron-nightly` was never guarded and is likewise not in the default list. If you use any of them:

- **Preferred**: migrate — replace `electron-prebuilt` with `electron`, and `electron-rebuild` with `@electron/rebuild` in `devDependencies`.
- Otherwise: move them to `devDependencies`, or add them to `ignoredProductionDependencies` (e.g. `["electron", "electron-builder", "electron-prebuilt", "electron-nightly"]`) if they must stay declared as production dependencies for tooling.

This is a runtime behavior change, not a config-key rename, so `electron-builder migrate-schema` does not modify your config for it.

### `allowMissingDependencies` now fails the build {#allowmissingdependencies-now-fails-the-build}

**How you'll find out:** **Fails the build**, listing every missing dependency, with a link here.

A production dependency that cannot be resolved during `node_modules` collection is now a **hard error**. In v26 this logged `cannot find path for dependency` / `dependency not found on disk` warnings and produced a package that failed at runtime with `MODULE_NOT_FOUND`; v27 fails the build up front, listing every missing dependency at once.

```json5
{ "build": { "allowMissingDependencies": true } }   // restore the v26 warn-only behavior
{ "build": { "allowMissingDependencies": ["some-pkg"] } }  // allow only specific names
```

`false` / `null` / omitted (the default) fails on any missing production dependency. Missing **optional** dependencies (declared in `optionalDependencies`, e.g. `fsevents` on Linux/Windows) are always allowed and never fail the build.

**Action:** if a build that previously succeeded now fails here, fix the installation, list the affected names in `allowMissingDependencies`, or set it to `true` to keep the v26 behavior.

### Native binaries are verified against the target {#native-binaries-are-verified-against-the-target}

**How you'll find out:** **Fails the build**, with a link here, for a `.node` addon built for another target. Other mismatched native files only warn.

After the app is packed, electron-builder reads the header of every `.node` addon in `app.asar`, `app.asar.unpacked` (or the unpacked `app` directory) and checks its format and machine type (ELF `e_machine`, Mach-O `cputype` including every slice of a fat binary, PE `Machine`) against the target platform and arch. A mismatch is now a **hard error** naming the file, what it was built for and what was expected. In v26 a stale or host-platform binary left in `node_modules` by a skipped or cached rebuild was packaged silently and only failed at runtime (`invalid ELF header`, `not a valid Win32 application`, `incompatible architecture`). For a macOS universal build each per-arch slice is checked before the slices are merged.

Other native files (`.so`, `.dylib`, `.dll`, `.exe`, extensionless executables) that mismatch only log a warning, since packages legitimately bundle helper binaries for several platforms. Files whose package declares another platform in `package.json` `os`/`cpu`, or whose path names another platform/arch (prebuildify's `prebuilds/linux-arm64/`, `@img/sharp-darwin-arm64`), are skipped.

```json5
{ "build": { "nativeModules": { "verifyNativeBinaries": "warn" } } }  // log mismatches, keep packaging
{ "build": { "nativeModules": { "verifyNativeBinaries": false } } }   // skip the check
```

Relatedly, `nativeModules.buildDependenciesFromSource` no longer skips the native rebuild for a target whose platform differs from the host (which shipped the host's binary). Native modules cannot be cross-compiled from source, so for such a target the rebuild runs with prebuilt binaries for the target instead, and a warning is logged.

**Action is required only if** a build fails here — rebuild native dependencies for the target (for a cross-platform target, the module needs a prebuilt binary for it), or opt out as above.

### `extraFiles` / `extraResources` destinations are validated {#extrafiles--extraresources-destinations-are-validated}

**How you'll find out:** **Fails the build**, with a link here.

A `to` path that is absolute (POSIX, drive-letter, or UNC) or that escapes the build output directory now throws an `InvalidConfigurationError`. v26 accepted these and copied files onto the build machine outside the packaged app.

**Action is required only if** a build starts failing here — make the `to` path relative and keep it inside the output directory.

### `asar.ordering` is now applied {#asar-ordering-is-now-applied}

**How you'll find out:** **Warns during the build** once when an ordering file is applied. **Fails the build** when the file is missing.

`asar.ordering` was documented and validated in v26 but never read: the archive was always packed dependencies first, app files last. v27 honors it: the files listed in the ordering file are packed first in the order of the file, ahead of the default dependencies-first layout, and everything else follows in its original order. Builds that apply an ordering file log a one-time warning pointing here.

Two consequences for projects that already set the option:

- **The archive layout changes once.** Differential updates download most of `app.asar` on the first update after upgrading; later updates are unaffected.
- **A missing ordering file is now an error.** The path is resolved relative to the build resources directory, then the project directory, and the build fails with `InvalidConfigurationError` when neither has it.

Remove the option to keep the default layout, which is tuned for small differential updates.

---

## Architectures & app names {#architectures-app-names}

### `arch: "all"` now expands to x64 and arm64; 32-bit fails fast on Electron 44+ {#arch-all-now-expands-to-x64-and-arm64-32-bit-fails-fast-on-electron-44}

**How you'll find out:** **Warns during the build** when `arch: "all"` is used for Windows or Linux. **Fails the build** for Windows `ia32` / Linux `armv7l` on Electron 44+.

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

### macOS `productName` and `executableName` are validated, not sanitized {#macos-productname-and-executablename-are-validated-not-sanitized}

**How you'll find out:** **Fails the build** for a name that needs sanitization. The NFD change is **silent**.

electron-builder now **rejects** a macOS `productName` or `executableName` that would require filename sanitization, throwing an `InvalidConfigurationError` at build start (`assertSafeHelperName`). Previously such names were silently normalized/sanitized, which could make the generated `<Name> Helper.app` bundles diverge from `CFBundleName` and break Electron's helper-process discovery.

**Action is required only if** a build starts failing with an "is not a valid macOS app bundle name" error — choose a `productName`/`executableName` that needs no sanitization (avoid path separators, control characters, and other characters stripped by filename sanitization).

**Names are also no longer NFD-normalized.** The `.app` bundle, the helper bundles, and `CFBundleName` now use the product name exactly as configured. For any name containing accented characters this changes the **bytes** of the on-disk filename, which is what external notarization and upload tooling matches on — update anything that hard-codes the normalized form. Relatedly, archive creation falls back from 7z to zip for NFD-normalized filenames.

---

## Code signing {#code-signing}

### Windows `publisherName` is validated against the signing certificate {#windows-publishername-is-validated-against-the-signing-certificate}

**How you'll find out:** **Fails the build**, with a link here. `migrate-schema` also prints an advisory for a custom `win.sign.sign` hook without `publisherName`.

A configured `win.sign.publisherName` (v26: `win.signtoolOptions.publisherName` / `win.azureSignOptions.publisherName`) that does not match the signing certificate's subject now fails the build instead of producing an installer that electron-updater would reject every update for. The common triggers are a certificate rotation and the wrong certificate leaking into `WIN_CSC_LINK` / `CSC_LINK` in CI.

**Action is required only if** a build fails here — update `win.sign.publisherName` to the new certificate subject, sign with the intended certificate, or set `win.verifyUpdateCodeSignature: false` to opt out of update signature verification entirely.

A code-signed build whose publisher name cannot be determined now also fails with `InvalidConfigurationError`. This covers every custom `win.sign.sign` hook without `win.sign.publisherName`: a hook may sign with another certificate than any electron-builder can read, so its publisher name is never derived from a certificate, not even one in the config (`certificateFile`, `certificateSubjectName`, `certificateSha1`, `cscLink`) or from `WIN_CSC_LINK` / `CSC_LINK`. It also covers a certificate without a Common Name (including a certificate-store subject). It applies only to builds that write `app-update.yml`: `nsis`, `nsis-web` and `electronUpdaterAware` `appx` targets with a publish configuration, including one inferred from a GitHub `repository`.

**Action:** set `win.sign.publisherName` to the subject of the certificate that signs your app, copied from a binary it already signed ([how](../win.md#how-do-you-delegate-code-signing)) — every component you list must match. Set `win.verifyUpdateCodeSignature: false` instead only if your updates are not Authenticode-signed or you don't use electron-updater.

> **Tip:** `electron-builder migrate-schema` prints an advisory for a custom `win.sign.sign` hook without `win.sign.publisherName`, whatever certificate the config names.

> Related: a build that would write `app-update.yml` without any `publisherName` fails too, and electron-updater 7 rejects updates whose `app-update.yml` has none — see [A missing `publisherName` fails update verification](#missing-publishername-fails-update-verification).

### Windows `publisherName` must be a distinguished name {#windows-publishername-must-be-a-distinguished-name}

**How you'll find out:** **Fails the build**, with a link here, for a `publisherName` entry that is not a distinguished name, and `migrate-schema` prints an advisory. electron-updater 7 also warns at runtime about entries that can never match.

Every `publisherName` entry must now be in distinguished name (DN) format — for example `"CN=My Company, O=My Company, C=US"`. v26 also accepted a bare name (`"My Company"`) and compared it with the certificate's Common Name, which electron-updater accepted with a warning.

- **electron-updater 7** never matches a bare name. A DN entry matches when every attribute it lists equals the signer's, in the attribute names Windows uses (`S` for the state or province, not `ST`); attributes it leaves out are not compared. When `app-update.yml` (or `dev-app-update.yml`) has an entry that can never match, the updater warns once, naming the entries, and the `ERR_UPDATER_INVALID_SIGNATURE` failure says so too. This also happens when electron-updater 7 runs in an app built with electron-builder v26, whose `app-update.yml` carries the certificate's Common Name — build the app with v27.
- **electron-builder v27** fails the build with `InvalidConfigurationError` when an explicit `win.sign.publisherName` (any signing type: `signtool`, `hsm`, `pkcs11`, a custom `sign` hook or `azure`) has an entry that is not a DN, before anything is signed. `publisherName: null` no longer opts out of update signature verification — see [below](#missing-publishername-fails-update-verification).
- **Without `publisherName`**, the build now writes `CN=<common name>` of the certificate to `app-update.yml` (v26 wrote the bare Common Name), with the value quoted the way Windows quotes it in the certificate subject (e.g. `CN=My Company`, or `CN="My Company, Inc."`). Only the CN is compared, so a renewed certificate that keeps the same CN keeps updates working even when its other subject attributes change. For a stricter pin, set a fuller DN explicitly; a renewal that changes an attribute you configured then needs a release, signed with the old certificate, that lists both DNs before you switch to it (see [key rotation](../features/key-rotation.md#windows-code-signing-certificate-rotation)).

**Action:** replace each bare-name entry with a DN — the full certificate subject, which on Windows `(Get-AuthenticodeSignature .\dist\win-unpacked\<App>.exe).SignerCertificate.Subject` prints in the form to use as-is (see also [How do you delegate code signing?](../win.md#how-do-you-delegate-code-signing)), or the attributes of it you want compared. Or remove `publisherName` (unless a custom `sign` hook, PKCS#11 without a certificate file, or Azure signs) to let electron-builder derive `CN=<common name>` from the certificate.

```json5
{ "win": { "sign": { "publisherName": "My Company" } } }                                  // v26: matched the CN — fails in v27
{ "win": { "sign": { "publisherName": "CN=My Company, O=My Company, C=US" } } }           // v27
```

> **Tip:** `electron-builder migrate-schema` prints an advisory for a `win.sign.publisherName` entry that is not a DN (e.g. a bare name).

### A missing Windows `publisherName` fails update verification {#missing-publishername-fails-update-verification}

**How you'll find out:** **Fails the build**, with a link here, when `app-update.yml` would have no `publisherName`, and `migrate-schema` prints an advisory. electron-updater 7 rejects such updates at runtime with `ERR_UPDATER_INVALID_SIGNATURE`.

electron-updater verifies the Authenticode signature of a downloaded NSIS update against the `publisherName` in `app-update.yml`. In v26, an `app-update.yml` without `publisherName` (written for an unsigned build, `win.sign: false`, or `publisherName: null`) made it install updates **without verifying them**. v27 fails closed on both sides:

- **electron-updater 7** rejects the update with `ERR_UPDATER_INVALID_SIGNATURE` when `app-update.yml` (or `dev-app-update.yml`, or the `updateConfigPath` file) has no `publisherName`. A custom `verifyUpdateFileAuthenticodeSignature` / `verifyUpdateCodeSignature` is never called without a `publisherName`. This also applies to an app built with electron-builder v26 — build it with v27.
- **An app with no update config file at all** (no `app-update.yml`, e.g. one that only uses `setFeedURL`) is not verified, as before: its feed is configured by the developer, not by electron-builder.
- **electron-builder v27** fails the build with `InvalidConfigurationError` when it would write `app-update.yml` (an `nsis`, `nsis-web` or `electronUpdaterAware` `appx` target with a publish configuration of any provider, including one inferred from a GitHub `repository`) while `win.verifyUpdateCodeSignature` is enabled and no `publisherName` resolves: `win.sign: false` / `null`, no code signing certificate (no `certificateFile`, `WIN_CSC_LINK` / `CSC_LINK` or certificate-store lookup), or `win.sign.publisherName: null`. Builds without `app-update.yml` (e.g. `portable`, `zip`, `msi` or a `dir` target only, or `publish: null`) are not affected.
- **The only opt-out** is `win.verifyUpdateCodeSignature: false`. The build then writes `verifyUpdateCodeSignature: false` (and no `publisherName`) into `app-update.yml`, and electron-updater installs updates without verifying their signature, warning once per updater. `publisherName: null` is no longer an opt-out.

**Action:** sign the build with a code signing certificate (electron-builder writes `CN=<common name>` of it), or — when you sign outside electron-builder — set `win.sign.publisherName` to the subject of the certificate that signs your installer. Set `win.verifyUpdateCodeSignature: false` only if your updates are not Authenticode-signed.

```json5
{ "win": { "sign": false } }                                                                     // v26: updates installed unverified — fails in v27
{ "win": { "sign": { "type": "signtool", "publisherName": ["CN=My Company, O=My Company, C=US"] } } } // v27: signed outside electron-builder
{ "win": { "sign": false, "verifyUpdateCodeSignature": false } }                                 // v27: explicit opt-out
```

For testing updates in development (`forceDevUpdateConfig`), put the certificate subject into `dev-app-update.yml` as `publisherName`, or `verifyUpdateCodeSignature: false` to skip the check. Without a `dev-app-update.yml` (a feed set only with `setFeedURL`), the update is not verified, as before.

> **Tip:** `electron-builder migrate-schema` prints an advisory for `win.sign: false` / `null` or `win.sign.publisherName: null` without `win.verifyUpdateCodeSignature: false`.

### `forceCodeSigning` covers notarization and update manifests, and verifies signatures {#forcecodesigning-covers-notarization-and-update-manifests}

**How you'll find out:** **Fails the build** (only with `forceCodeSigning`), at build start where possible, with a link here. `migrate-schema` prints an advisory when `forceCodeSigning` is set.

In v26, `forceCodeSigning` only failed the build when no code signing identity or certificate was found: notarization and update-manifest signing could still be skipped with a log line, and nothing checked what a signing step produced. In v27, `forceCodeSigning: true` (at the root or on a platform) makes every signing step required, and verifies it:

- **macOS notarization is required.** Without notarization credentials (`APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`, `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`, or `APPLE_KEYCHAIN_PROFILE`) the build fails at build start, before anything is packed — also a `--dir` build, which signs and notarizes the app. The credentials must be in the environment when the build starts. After notarizing, `stapler validate` checks the stapled ticket.
- **macOS signing must be possible.** A build on a host other than macOS, or a pull-request build (where electron-builder skips signing unless `CSC_FOR_PULL_REQUEST=true`), now fails instead of producing an unsigned app.
- **Update manifests must be signed**, also by a build that does not publish — including pull-request builds, and Linux builds, where this is the only effect of `forceCodeSigning`. A missing signing key fails at build start, and so does a signing key outside `updateManifest.publicKey` (unless `allowSigningKeyOutsideTrustList` is set).
- **Signatures are verified.** Every file a Windows signing step reports as signed is read back and must carry a valid Authenticode signature, so a custom `win.sign.sign` hook that signs another path now fails the build. The output of a custom `mac.sign` signer is checked with `codesign --verify --deep --strict` (and a custom signer without a keychain identity is now called, as in v26, instead of being skipped silently). Signed `pkg` and MAS installers are checked with `pkgutil --check-signature`, and a DMG with `dmg.sign: true` must be signed.
- **A prepackaged app must already be signed** (and, on macOS, notarized), since electron-builder does not sign it. `win.sign: false` with a prepackaged app now fails too.
- **Squirrel.Windows `msi: true` fails.** Squirrel.Windows builds that MSI around `Setup.exe` before electron-builder signs it, so the installer inside it is unsigned; use the `msi` target for a signed MSI. Without `forceCodeSigning` it warns.

Explicit opt-outs are honored with a warning: `mac.notarize: false` (for an ad-hoc or development-signed app, or one you notarize yourself, e.g. in an `afterSign` hook), `updateManifest: false`, `win.signExts` exclusions, and a custom `nsis.script` (whose uninstaller electron-builder does not sign). An HSM/KMS signer that signs `latest*.yml` in a later step publishes with `publishAutoUpdate: false` on every provider (see [Key storage](../features/key-rotation.md#key-storage)), or builds without `forceCodeSigning`. Any valid signature counts, including ad-hoc and self-signed ones.

Every signed `latest*.yml` is also read back before it is written, with or without `forceCodeSigning`, so a manifest that would not verify is never written or uploaded.

**Action:** provide the notarization credentials and the update-manifest signing key wherever `forceCodeSigning` is set. Pull-request and local builds that cannot sign turn it off:

```bash
electron-builder --mac -c.forceCodeSigning=false      # pull-request or local builds without credentials
electron-builder --mac -c.mac.forceCodeSigning=false  # when the mac block sets it: a platform value wins over the root one
```

Run [`electron-builder verify`](../cli.md#verify) after a build to check the signatures, notarization and update manifests of its output.

> **Tip:** `electron-builder migrate-schema` prints an advisory when `forceCodeSigning` is set.

### `mac.notarize: true` requires notarization credentials {#mac-notarize-true-requires-credentials}

**How you'll find out:** **Fails the build** (only with `mac.notarize: true`), at build start on a macOS host, with a link here.

`mac.notarize: true` now means that notarization is required: a build without notarization credentials (`APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`, `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`, or `APPLE_KEYCHAIN_PROFILE`) fails with an `InvalidConfigurationError`, at build start and again when notarizing — wherever notarization would run: on a macOS host, outside a pull-request build, and, for the app, unless the configuration turns its signing off (`mac.sign: null`, `sign.identity: null`, or `CSC_IDENTITY_AUTO_DISCOVERY=false` without an identity or custom signer); a `pkg` installer is notarized whenever it is built. Elsewhere missing credentials only warn. Previously `true` behaved like leaving `notarize` unset, which notarizes when the credentials are set and skips notarization with a warning otherwise; that is still the default.

**Action:** if you set `mac.notarize: true` only because the docs showed it, remove it: notarization still runs whenever the credentials are set. Keep it where a build without notarization must fail, and make sure the credentials are in the environment when the build starts.

---

## Publishing & update metadata {#publishing-update-metadata}

### Signed update manifests are required {#signed-update-manifests-are-required}

**How you'll find out:** **Fails the build** when publishing without a signing key. **Warns** otherwise.

Ed25519 signing of `latest*.yml` is new in v27 and **required by default**. A build with a publish policy that includes a target writing auto-update metadata — NSIS, AppImage, deb/rpm/pacman, macOS zip/dmg, or AppX with `electronUpdaterAware` — now fails unless a signing key resolves. The check runs at build start, before anything is packed or uploaded:

```
auto-update manifests must be signed, but no Ed25519 signing key was found for mac. Generate one with
`electron-builder create-update-key`, then supply it via the ELECTRON_BUILDER_UPDATE_SIGN_KEY (base64-encoded PEM file)
or ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE (path) environment variable, or via updateManifest.signingKey /
updateManifest.signingKeyFile in the build configuration. To publish unsigned manifests anyway, opt out
explicitly with `updateManifest: false`.
```

Only a **publishing** build fails — or any build with [`forceCodeSigning`](#forcecodesigning-covers-notarization-and-update-manifests). A build without a publish policy warns instead, so local builds keep working — which matters because `app-update.yml` is generated whenever a publish configuration exists *or* can be inferred from your `repository` field.

**To adopt it** (recommended):

```bash
npx electron-builder create-update-key          # once; store the base64-encoded PEM as a CI secret
ELECTRON_BUILDER_UPDATE_SIGN_KEY="$(base64 < update-private-key.pem | tr -d '\n')" electron-builder --publish always
```

`ELECTRON_BUILDER_UPDATE_SIGN_KEY` holds the PEM file **base64-encoded on one line**, so masked CI variables can hold it; for several keys, concatenate the PEM files and encode them once (`cat old.pem new.pem | base64 | tr -d '\n'`). `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` and `updateManifest.signingKey` / `signingKeyFile` keep taking PEM. See [Providing the key in CI](../features/signed-update-manifests.md#ci-secrets) for the encode command on each OS.

:::note[Changed during the v27 pre-releases]
27.0.0-alpha.9 to alpha.11 read `ELECTRON_BUILDER_UPDATE_SIGN_KEY` as raw PEM text. A raw PEM — or any value that is not the base64 of complete PEM private keys — now fails the build with an `InvalidConfigurationError` that names the variable and gives the encode command without printing the value. Re-encode the secret, or point `ELECTRON_BUILDER_UPDATE_SIGN_KEY_FILE` at the PEM file. A build script that sets the variable from a PEM string can pass `Buffer.from(pem).toString("base64")`, or set `updateManifest.signingKey` instead.
:::

`electron-builder publish -f` checks every update manifest it is given before it uploads anything: an unsigned manifest is refused, and with `updateManifest.publicKey` set the manifest must be signed by one of those keys (another key is allowed, with a warning, under `allowSigningKeyOutsideTrustList`). Without `publicKey` the signature cannot be checked against a trust list, which warns, and fails under `forceCodeSigning`. Only public keys are used.

**To opt out**, set `updateManifest: false` at the top level or under a platform key. Every build that emits a manifest then logs a warning. `false` also short-circuits the environment variables, so a leftover `ELECTRON_BUILDER_UPDATE_SIGN_KEY` cannot silently re-enable signing. A platform value of `null` is **not** an opt-out — it falls back to the top-level value.

A publishing build whose targets write no update info (for example only snap, flatpak, MSI/MSIX, portable, mas/pkg or plain archives) needs no key. Two more cases need no configuration at all: when every publish provider sets `publishAutoUpdate: false` no manifest is emitted, so the requirement is waived; and a `publicKey` with no private key does **not** satisfy it, since electron-builder still has nothing to sign with (that HSM/KMS workflow either builds without a publish policy, or publishes with `publishAutoUpdate: false` and generates the manifest itself — see [Key storage](../features/key-rotation.md#key-storage)).

:::danger[Opting out is not reversible for a release line]
Once a release embeds a public key, its installs are **fail-closed**: an unsigned manifest is rejected with `ERR_UPDATER_MANIFEST_NOT_SIGNED` and those installs stop updating entirely. Do not switch to `updateManifest: false` after shipping signed manifests, and make sure every pipeline that can publish a release — including a hotfix built from a laptop — has the key.
:::

Note that installs already in the field are unaffected but also unprotected: they carry whatever `app-update.yml` they shipped with, so those built before you adopted signing keep accepting unsigned manifests. Full protection begins with the installs built after the public key was embedded.

See [Signed Update Manifests](../features/signed-update-manifests.md) and [Key Rotation](../features/key-rotation.md).

### Signing key must be in `updateManifest.publicKey` {#signing-key-must-be-in-updatemanifestpublickey}

**How you'll find out:** **Fails the build** when publishing. **Warns** otherwise.

When `updateManifest.publicKey` is set explicitly, it is the whole trust list embedded in `app-update.yml`. If none of the keys the build signs `latest*.yml` with is in that list, installs of the release reject manifests signed with the current key(s), and every later release has to be signed by a listed key. Earlier v27 pre-releases only warned about this; a **publishing** build now fails at build start, before anything is packed or uploaded, with an `InvalidConfigurationError` that names the key ids of the signing keys and of the listed keys (never key material). A build without a publish policy still only warns.

**Action:**

- **Unintended mismatch** (a stale `publicKey`, or a CI secret that was regenerated): add the signing key's public key to `updateManifest.publicKey` (`electron-builder create-update-key` prints it with its key id), or sign with a key that is listed.
- **Deliberate cutover release** (signed with the old key, which the installs in the field trust, while embedding only the new key): set `allowSigningKeyOutsideTrustList: true` for that release. The build then publishes and logs a warning. Remove it again once you sign with the new key.

```yaml
updateManifest:
  publicKey: "-----BEGIN PUBLIC KEY-----\n…" # the NEW key only
  allowSigningKeyOutsideTrustList: true     # this release is still signed with the OLD key
```

When `publicKey` is not set, the trust list is derived from the signing keys and nothing changes. See [Key Rotation](../features/key-rotation.md#cutover-without-dual-signing).

### `app-update.yml` feed follows the update-writing targets {#app-updateyml-feed-follows-the-update-writing-targets}

**How you'll find out:** **Silent** for the feed choice itself. Targets with conflicting feeds **fail the build** when publishing and **warn** otherwise, with a link here.

The feed an installed app polls — the first provider embedded in its `app-update.yml`, together with the manifest public key — is now resolved from the `publish` settings of the targets that write update info, not only from the platform/top-level `publish`. This changes package contents in three cases:

- **Target-level `publish`** (e.g. `nsis.publish`, `appImage.publish`, `dmg.publish`) now decides the feed. An `nsis.publish`-only build used to ship no `app-update.yml` (or, with a GitHub `repository`, a GitHub feed while the manifests went elsewhere); it now ships that feed and the key that verifies its signed manifests.
- **Providers with `publishAutoUpdate: false` are skipped** when a later provider receives the manifest, also in platform/top-level lists: `win.publish: [{ provider: "s3", …, publishAutoUpdate: false }, "github"]` now embeds GitHub, where v26 embedded the S3 feed that never gets a `latest*.yml`. When every provider sets `publishAutoUpdate: false` (the external-signing route), the first one is still embedded.
- **Targets of one app must agree.** One packaged app holds a single `app-update.yml`, so two update-writing targets built from it (for example `dmg` and `zip`, or `nsis` and an updater-aware `appx`) whose feeds differ fail a publishing build at build start with an `InvalidConfigurationError`; a build without a publish policy warns that publishing will fail and writes no `app-update.yml` for that app. Only feed-identifying options are compared — upload-only ones such as `publishAutoUpdate` or `timeout` may differ.

Builds with no update-writing target, or whose only such target opts out (`publish: null`), keep the platform/top-level feed and the GitHub fallback as before. **Action:** only if you use target-level `publish`, per-target feeds within one app, or a disabled first provider — configure `publish` once at the platform level, or check that the embedded feed is the one you publish `latest*.yml` to. See [which settings become the auto-update feed](../publish.md#app-update-yml-feed).

### Suffixed update channels now expand to lower channels {#suffixed-update-channels-now-expand-to-lower-channels}

**How you'll find out:** **Warns during the build** once per expanded channel.

With `generateUpdatesFilesForAllChannels` enabled and a non-GitHub provider, `beta` published `beta.yml` + `alpha.yml` and `latest` published all three — but only when the channel was *exactly* `alpha`, `beta`, or `latest`. A channel with a suffix, such as the per-arch `channel: "${channel}-${arch}"` pattern that resolves to `beta-arm64`, fell through and published a single file, so suffixed pre-release users were never promoted.

v27 reads the base channel off the front of the name and reattaches the suffix:

- `beta-arm64` → `beta-arm64.yml`, `alpha-arm64.yml`
- `latest-arm64` → `latest-arm64.yml`, `alpha-arm64.yml`, `beta-arm64.yml`
- `alpha-arm64` → unchanged (lowest channel)
- bare `alpha` / `beta` / `latest` → unchanged

**This only affects you if you use `generateUpdatesFilesForAllChannels` with a suffixed channel name on a non-GitHub provider.** In that case a suffixed channel now writes 2–3 update files where it previously wrote one, and a `latest-x64` publish overwrites `beta-x64.yml` / `alpha-x64.yml` in the same bucket — changing what live `beta-x64` users are offered. That is the same behaviour bare `latest` has always had, but it is new for suffixed channels. Set `generateUpdatesFilesForAllChannels: false` if you want suffixed channels to keep publishing a single file.

### `latest*.yml` drops legacy top-level `path`/`sha512` {#latestyml-drops-legacy-top-level-pathsha512}

**How you'll find out:** **Silent** in the default case: the fields are no longer written.

The deprecated top-level `path` and `sha512` fields are **no longer written** to the generated update-metadata files (`latest.yml` / `latest-mac.yml` / `latest-linux.yml`) by default. They were kept for electron-updater **1.x – 2.15.0**, which predate the `files[]` array (introduced in 2.16.0, released 2017). Both fields are now emitted only when `electronUpdaterCompatibility` declares a range that intersects those legacy versions — the same mechanism that already controlled the Windows `sha2` field and the legacy `latest-mac.json`. The default `electronUpdaterCompatibility` is now `>=2.16` (previously `>=2.15`), and `UpdateInfo.path` / `UpdateInfo.sha512` are now **optional** on the exported TypeScript type.

- **No action** for virtually all projects: every electron-updater since 2.16.0 reads `files[]` and ignores the top-level fields. Already-published `latest*.yml` files are unaffected.
- **If your app code reads `info.path` / `info.sha512`** (e.g. in an `update-downloaded` handler), switch to `info.files[0].url` / `info.files[0].sha512`.
- **If external tooling parses `latest.yml`** (a custom update server or dashboard), point it at `files[]`.
- **If you still ship apps embedding electron-updater 1.x – 2.15**, keep emitting the legacy descriptor by declaring a compatibility range that includes them, e.g. `"electronUpdaterCompatibility": ">=1.0.0"` (also settable per platform, e.g. `win.electronUpdaterCompatibility`).

> Related: metadata validated only by the legacy SHA-256 `sha2` checksum is deprecated — v27 warns and **v28 will reject sha2-only metadata (fail-closed)**. Avoid pinning `electronUpdaterCompatibility` to a legacy range unless you actually ship 1.x–2.15 clients.

### S3 publishing requires an explicit `awsCredentials.source` {#s3-publishing-requires-an-explicit-awscredentialssource}

**How you'll find out:** **Fails at publish**, with a link here. Builds that don't publish are silent.

The `s3` publisher no longer picks up AWS credentials from ambient sources, and there is no default source. To publish, set the new `awsCredentials` publish option; only the source it names is consulted:

- **`source: "env"`** reads only `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and the optional `AWS_SESSION_TOKEN`, or the variable names you give in `awsCredentials.env`.
- **`source: "profile"`** reads the named `profile` (required) from the shared config and credentials files (`~/.aws/config` and `~/.aws/credentials`, or `configFile` / `credentialsFile`). Static keys, IAM Identity Center (SSO) sessions from `aws sso login`, `credential_process` and assume-role profiles are supported.
- **`source: "sso-role-chain"`** is for an assume-role `profile` (`role_arn` + `source_profile`) whose chain starts at an IAM Identity Center (SSO) profile. electron-builder walks the chain itself in the same files (up to 5 assume-role hops, cycles rejected), resolves the SSO profile, then calls STS `AssumeRole` for each hop with the previous hop's credentials.

<details>
<summary>What changed compared with v26</summary>

- Publishing to `s3` without `awsCredentials.source` **fails** with an `InvalidConfigurationError` that names both sources. Builds that don't publish (e.g. `--publish never`) don't need it.
- `AWS_PROFILE`, `AWS_SDK_LOAD_CONFIG`, `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` are **no longer read**, and `~/.aws/credentials` is no longer used as an implicit fallback.
- When the configured source has no credentials, publishing **fails** with a clear error. Before, the request was signed with whatever aws4 found in the environment (including the undocumented `AWS_ACCESS_KEY` / `AWS_SECRET_KEY`), or with `Credential=undefined`.
- For a bucket name with dots and no `region`, the region is now looked up **only when publishing**. Builds that don't publish log a warning and leave `region` unset, so set `region` explicitly for dotted bucket names.
- With `source: "profile"`, an assume-role profile whose `source_profile` chain starts at an SSO profile is rejected, because the AWS SDK would resolve that SSO profile without the configured files. Use `source: "sso-role-chain"` for it (see below).
- With `source: "profile"`, a profile that sets `credential_source` (`Environment`, `Ec2InstanceMetadata`, `EcsContainer`), web identity (`web_identity_token_file`) or an `aws login` session (`login_session`), itself or anywhere in its `source_profile` chain, is rejected with an `InvalidConfigurationError`: they read ambient credentials, or an AWS SDK STS / sign-in client that takes its region, endpoint or token cache from `AWS_REGION` / `AWS_ENDPOINT_URL_STS` / `AWS_CONFIG_FILE` / `AWS_LOGIN_CACHE_DIRECTORY`. In CI with OIDC, export the temporary keys first and use `source: "env"`.
- `awsCredentials` is build-time only and is never written to `app-update.yml`. electron-updater is unaffected: it downloads S3 updates without credentials.
- DigitalOcean Spaces (`DO_KEY_ID` / `DO_SECRET_KEY`) and Cloudflare R2 (`CF_R2_*`) are unchanged.

</details>

**Action is required for every S3 publish configuration.** If CI exports `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (for example `aws-actions/configure-aws-credentials`), choose the env source:

```json
"publish": {
  "provider": "s3",
  "bucket": "my-bucket",
  "awsCredentials": { "source": "env" }
}
```

If you relied on `AWS_PROFILE`, `~/.aws/credentials`, `~/.aws/config` + `AWS_SDK_LOAD_CONFIG=1`, or an SSO login, name the profile:

```json
"awsCredentials": { "source": "profile", "profile": "release" }
```

If your publishing role is assumed from an SSO login through `source_profile` (for example `aws sso login --profile login` plus a `deploy` profile with `role_arn` and `source_profile = login`), opt in to the role chain:

```json
"awsCredentials": { "source": "sso-role-chain", "profile": "deploy" }
```

Each hop honours `role_session_name`, `external_id` and `duration_seconds`. STS is called in the named profile's `region` (default `us-east-1`) with its `sts_regional_endpoints`; `AWS_REGION`, `AWS_PROFILE`, `AWS_CONFIG_FILE` and `AWS_ENDPOINT_URL*` are not read. `credential_source`, `mfa_serial`, `web_identity_token_file` and `credential_process` are rejected in the chain. A chain that starts at static keys or a `credential_process` keeps working with `source: "profile"`.

To keep publish-only keys apart from other `AWS_*` variables in the same job, point `awsCredentials.env` at different names:

```json
"awsCredentials": { "source": "env", "env": { "accessKeyId": "RELEASE_S3_KEY_ID", "secretAccessKey": "RELEASE_S3_SECRET" } }
```

### Bitbucket Cloud publishing: token without username uses Bearer auth {#bitbucket-cloud-publishing-token-without-username-uses-bearer-auth}

**How you'll find out:** **Warns at publish** when no username is set.

The Bitbucket publisher now selects its authentication scheme by whether a username is present:

- **Username present** (`bitbucket.username`, or the `BITBUCKET_USERNAME` env var) → HTTP **Basic** auth, as before. Use this for an **app password** or an Atlassian **API token** (the username is your Bitbucket username or Atlassian account email).
- **No username** → the token is sent as `Authorization: Bearer <token>` (a repository / project / workspace **access token**). This is the new behavior; previously a token was always sent as Basic auth using the repository owner as the username.

**Action is required only if** your CI sets `BITBUCKET_TOKEN` (or `bitbucket.token`) to an **app password / API token without a username** — those requests now go out as Bearer and will fail authentication. Set `BITBUCKET_USERNAME` (or `bitbucket.username`) so Basic auth is used. Genuine access tokens need no username.

---

## Flatpak build tooling {#flatpak-build-tooling}

### Flatpak: native build, minimum tool versions, `26.08` runtime by default {#flatpak-tooling-requirements}

**How you'll find out:** **Fails the build** for tools that are too old, or `files` / `symlinks` paths that leave the app. **Warns during the build** for the new default runtime and for `DEBUG=@malept/flatpak-bundler`.

The flatpak target no longer depends on `@malept/flatpak-bundler`: electron-builder now drives `flatpak` and `flatpak-builder` itself. It also has a newer default runtime. Six things change:

- **`flatpak` 1.12.4+ and `flatpak-builder` 1.2.2+ are required.** Both versions are checked before the target installs a runtime or runs `flatpak-builder`, and an older tool fails the build with a message naming the required version, e.g. `flatpak-builder 1.0.12 is not supported - version 1.2.2 or newer is required to build the flatpak target`. v26 checked no version. The stock packages of Ubuntu 22.04 (Flatpak 1.12.7, `flatpak-builder` 1.2.2), Debian 12 (1.14.10, 1.2.3), RHEL 8 and 9 (1.12.9, 1.2.3) and newer releases are new enough; those of older releases, such as Ubuntu 20.04 (now only covered by Ubuntu Pro) and Debian 11, are not. With `flatpak-builder` older than 1.4, AppStream metadata in the app cannot be composed with the current SDKs, and with one older than 1.4.4 a build with `flatpak.modules` warns — see [Build Requirements](../flatpak#build-requirements). The `electronuserland/builder` Docker images with a date tag newer than `-05.26`, the first ones published after this release, include both tools from the Flatpak team's PPA; those with the date tag `-05.26` or an older one include neither — see [Flatpak in the Docker Images](../features/multi-platform-build#flatpak-in-the-docker-images).
- **`flatpak.runtimeVersion` and `flatpak.baseVersion` default to `26.08`.** They defaulted to `20.08`, which Flathub reports as end-of-life (no longer receiving fixes and security updates). A build that sets neither option now produces a bundle for the `26.08` freedesktop runtime, built on the `26.08` Electron base app; a build that sets only one of them gets the new default for the other. The build machine needs the three `26.08` refs (runtime, SDK and base app): whichever is missing is installed at the start of the build — about 3.2 GB in the user installation for all three, measured on aarch64 — and where no remote of the user installation can supply them, for example offline, the build fails with `No remote refs found`. Installed `20.08` refs are no longer used; electron-builder does not remove them. Installing the `26.08` refs and building against them works with the stock tools of Ubuntu 24.04 (Flatpak 1.14.6, `flatpak-builder` 1.4.2). A build that leaves either option unset warns once, naming this change. To keep the previous runtime, set both options to `"20.08"` (quoted in YAML). Setting both, to either version, also keeps the build on that version when a later release changes the default — see [Choosing Versions](../flatpak#choosing-versions).
- **`DEBUG=@malept/flatpak-bundler` no longer has any effect.** A flatpak build warns once when `DEBUG` still names it. A failed `flatpak` / `flatpak-builder` command now prints that tool's own output as part of the build error, and `DEBUG=electron-builder` logs every command that is run.
- **The scratch directory is removed when the build finishes.** v26 left a `flatpak-bundler-*` directory (a full copy of the app plus an OSTree repository) in the system temp directory after every build. The stage directory `<outDir>/__flatpak-<arch>`, which v26 left behind when a build failed, is now removed in that case too (unless `DEBUG=electron-builder` is set).
- **`flatpak.files` destinations and `flatpak.symlinks` links must stay inside the app prefix.** v26 joined them to the build directory as given, so a path that climbed out with `..` wrote outside the app, for example over the app's `metadata` file. v27 fails the build with `flatpak.files destination "<path>" is outside the app prefix` (or `flatpak.symlinks link`) before anything is installed. A destination or link that leads out of the prefix through a symlink placed there by the base app, a module or an earlier `files` pair fails the build too, with `... resolves outside the app prefix (/app in the sandbox) through a symlink`, when it is about to be written. Paths are relative to `/app` in the sandbox, as before.
- **A directory in `flatpak.files` can no longer be copied onto a symlink to a directory.** v26 copied through such a link, into the directory it points to; v27 fails the build with `Cannot overwrite non-directory with directory` (`ERR_FS_CP_DIR_TO_NON_DIR`). No `org.electronjs.Electron2.BaseApp` branch from 20.08 to 26.08 contains such a link, so this only matters when another base app, a module or an earlier `files` pair creates one — use the directory the link points to as the destination. Symlinks inside a copied directory are now kept as they are, including ones that do not resolve on the build machine, which failed the build in v26.

As in v26, every build updates the runtime, SDK and base app that are already installed and installs whichever is missing into the user installation (`flatpak install --user`, which only searches the remotes of the user installation). The commands differ in details: `flatpak install` and `flatpak update` run with `--noninteractive` instead of `--assumeyes`; an install that fails with `No remote refs found` logs a hint with the `flatpak remote-add --user` command to run; and the `flatpak` commands no longer see environment variables whose names look like credentials (`*TOKEN*`, `*KEY*`, `*SECRET*`, `*PASS*`, …). `flatpak-builder` still receives the whole environment when the manifest has `modules`, whose sources may need those variables to download, and the filtered one otherwise.

New in v27: `flatpak.additionalArgs` passes extra arguments to the underlying tools (`flatpakBuilder`, `buildExport` and `buildBundle`, for `flatpak-builder`, `flatpak build-export` and `flatpak build-bundle`), which is what makes [building in unprivileged containers](../flatpak#building-in-unprivileged-containers) possible. electron-builder never adds such arguments on its own; when a build fails for lack of FUSE or user namespaces it logs a hint naming the option to set. [Building Flatpak Bundles in CI and Containers](../tutorials/flatpak-in-ci-and-containers) covers the image and the build command for such a container.
