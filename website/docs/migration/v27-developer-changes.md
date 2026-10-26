---
title: "v27 Developer-Only Changes"
sidebar_label: "Developer-Only"
---

# v27 Developer-Only Changes

Changes that only matter if you write code that plugs into electron-builder: build hooks, custom signing functions, the programmatic `build()` API, custom targets and plugins built on `app-builder-lib`, custom NSIS or Linux maintainer scripts, and TypeScript imports. A project with only a config file can skip this page. Part of the [v27 Breaking Changes](./v27-breaking-changes.md) reference.

**How you'll find out:** most of these surface as a **TypeScript error** or **fail the build**. Each entry starts with a **How you'll find out** line; the **Silent** ones are worth a manual check.

## At a glance {#at-a-glance}

| Change | Announced | Action required |
|--------|---|----------------|
| [All packages are native ESM](#native-esm-output) | — | None — `require()` still works on Node >=22.12 |
| [`electron-forge-maker-*` are now ESM](#electron-forge-maker-plugins) | — | None — same API, same export shape |
| [`devMetadata` / `extraMetadata` in `PackagerOptions` removed](#devmetadata-extrametadata-programmatic-packageroptions) | Fails build | Use `config` / `config.extraMetadata` |
| [`PlatformPackager.info` & `platformSpecificBuildOptions` now `protected`](#programmatic-plugin-author-api-changes) | TS error | Plugin authors: hard break — `.info` no longer compiles externally; use the new pass-through getters |
| [ProtonFramework & LibUiFramework removed](#removed-exports) | Import / TS error | Migrate to an Electron-based build setup |
| [Renamed type exports (`ElectronDownloadOptions`, `WindowsAzureSigningConfiguration`, …)](#removed-exports) | TS error | Import the new names — no compat aliases |
| [`SnapOptions`, `ProtonFramework`, `LibUiFramework` exports removed](#removed-exports) | Import / TS error | Use the `snapcraft` config shape / Electron framework |
| [Hooks reading `files` / `extraResources` / `extraFiles`](#hooks-reading-file-options) | Warns / fails | Read and write `fileOptions.files` / `.extraResources` / `.extraFiles` instead; assigning a flat key throws |
| [NSIS `customInstallMode` macro guard casing corrected](#nsis-custominstallmode-macro-guard-casing-corrected) | Silent | Rename a `customInstallmode` (lowercase `m`) macro definition in custom NSIS scripts to the documented `customInstallMode` |
| [Linux maintainer-script EJS syntax removed](#linux-maintainer-script-ejs-template-syntax) | Fails build | Use `${var}` instead of `<%= var %>` |

---

## Module format (ESM) {#runtime-esm}

### Native ESM output {#native-esm-output}

**How you'll find out:** Nothing to announce: `require()` keeps working on Node.js 22.12+.

electron-builder packages now ship as native ES modules. On **Node >=22.12.0** both styles continue to work:

```js
// CJS require() — still works
const { build, Platform } = require("electron-builder")

// ESM import — now the preferred style
import { build, Platform } from "electron-builder"
```

If your project uses `"type": "module"` or ESM imports, no changes are needed. If it uses CJS on Node >=22.12, `require()` continues to work as before. The `build()` function signature, all configuration options, and all exported types are otherwise unchanged.

**`moduleResolution`** — v27 packages include `exports` maps and full TypeScript declarations. `"node"` (legacy), `"node16"`/`"nodenext"`, and `"bundler"` (recommended) all work.

<details>
<summary>Why native ESM?</summary>

`electron-builder` historically shipped CommonJS. The move to native ESM was driven by the ecosystem: major dependencies (`chalk`, `figures`, `ora`, etc.) have dropped CJS support, and Node.js 22.12's stabilized `require(esm)` makes it safe to ship ESM without breaking CJS consumers. The minimum was set to 22.12.0 specifically because earlier Node.js versions require `--experimental-require-module` to `require()` an ESM package.

</details>

### `electron-forge-maker-*` plugins {#electron-forge-maker-plugins}

**How you'll find out:** Nothing to announce: no config change is needed.

The four Forge maker plugins (`electron-forge-maker-appimage`, `electron-forge-maker-nsis`, `electron-forge-maker-nsis-web`, `electron-forge-maker-snap`) are now native ES modules. Electron Forge loads them via dynamic `import()` internally, so no config changes are required.

Their default export is now a maker class that Electron Forge 6 and later can load (`{ name: "electron-forge-maker-nsis", config }`) or that you can instantiate (`new MakerNsis(config)`, also a named export); the `config` is the target's options. Calling the default export as an Electron Forge 5 maker function still works. See [Electron Forge Integration](../features/electron-forge.md).

---

## Programmatic & plugin-author API changes {#programmatic-plugin-author-api-changes}

> **The `info` and `platformSpecificBuildOptions` changes only affect you if you import from `app-builder-lib` and access the `packager` or `platformPackager` objects directly.** Standard project configurations are unaffected.

### `devMetadata` / `extraMetadata` (programmatic `PackagerOptions`) {#devmetadata-extrametadata-programmatic-packageroptions}

**How you'll find out:** **Fails the build** (these fields have thrown since v22).

These fields in the programmatic `PackagerOptions` API are removed (they have thrown `InvalidConfigurationError` since v22).

```ts
// Before
await build({ targets: Platform.MAC.createTarget(), devMetadata: { … }, extraMetadata: { … } })
// After
await build({ targets: Platform.MAC.createTarget(), config: { extraMetadata: { … } } })
```

### `info: Packager` is now `protected`

**How you'll find out:** **TypeScript error only.** Plain JavaScript keeps working.

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

<details>
<summary><code>PlatformPackager.info</code> is now protected</summary>

The public `info: Packager` field created a hard coupling: any internal `Packager` refactor became a breaking change for all plugins. In v27, direct pass-through getters and methods were added for the properties plugin authors actually need, and `info` was changed from `public` to **`protected`**. This is a hard break in v27 (not a deferred deprecation): external `packager.info.X` access no longer compiles, so migrate to the direct getters listed above.

</details>

### `platformSpecificBuildOptions` is now `protected`

**How you'll find out:** **TypeScript error only.** Plain JavaScript keeps working.

External consumers should use the two new public helpers instead:

| Access pattern | v27 replacement |
|---|---|
| `packager.platformSpecificBuildOptions` (direct read) | `packager.platformOptions` |
| `deepAssign({}, packager.platformSpecificBuildOptions, config.X)` | `packager.getOptionsForTarget<T>("X")` |

`platformOptions` is a typed getter returning the same platform-level config object. `getOptionsForTarget<T>(key)` performs the standard merge of platform options with the named per-target key (e.g. `"appx"`, `"msi"`) and returns the result as `T`. All built-in targets have been migrated; custom targets extending `PlatformPackager` must update any direct `.platformSpecificBuildOptions` access.

---

## Removed exports {#removed-exports}

**How you'll find out:** **TypeScript error** for a removed type. Importing a removed class (`ProtonFramework`, `LibUiFramework`) from ESM fails when the module loads; `require()` returns `undefined`.

`ProtonFramework`, `LibUiFramework`, and `SnapOptions` are removed from the public exports of `app-builder-lib` and `electron-builder`. `CustomNsisBinary` is removed from the public exports of `app-builder-lib`, together with the [`customNsisBinary` option](./v27-config-changes.md#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis); use `ToolsetCustom` (for `toolsets.nsis`) instead. Use the Electron framework and the [`snapcraft`](./v27-config-changes.md#snap-snapcraft) config shape respectively. The removed framework support means `framework: "proton" | "libui"` no longer has any effect — see [`framework` removed](./v27-config-changes.md#framework-nodeversion-launchuiversion).

### Renamed type exports {#renamed-type-exports}

**How you'll find out:** **TypeScript error only.**

These exported TypeScript types were **renamed with no compatibility alias** — `import { OldName }` is now a hard compile error. Update the import to the new name:

| v26 export | v27 export |
|---|---|
| `ElectronDownloadOptions` | `ElectronGetOptions` |
| `WindowsAzureSigningConfiguration` | `WindowsAzureSigningConfig` |
| `WindowsSigntoolConfiguration` | `WindowsSigntoolSigningConfig` |

`ElectronGetOptions` is re-exported from the top-level `electron-builder` package, so this affects ordinary TypeScript consumers, not just `app-builder-lib` plugin authors.

---

## Build hooks & custom signers {#build-hooks-custom-signers}

### Hooks reading `files`, `extraResources` or `extraFiles` {#hooks-reading-file-options}

**How you'll find out:** reading a key **warns during the build** once per key; assigning one **fails the build**.

**Code that reads `files`, `extraResources` or `extraFiles` from the loaded configuration** (a hook reading `context.packager.config.files` or `context.packager.platformOptions.extraResources`, a `build()` caller reading `buildResult.configuration.extraFiles`) gets the `fileOptions` value: the loaded configuration and its platform sections forward these reads to `fileOptions`, logging one warning per key. These forwarding properties are not enumerable, so they never appear in the effective configuration (`builder-effective-config.yaml`), in `JSON.stringify` output or in `Object.keys`. Assigning one of them (for example `context.packager.config.files = […]` in a hook) throws a configuration error naming the `fileOptions` property to set instead. Read and write `fileOptions.files` / `fileOptions.extraResources` / `fileOptions.extraFiles` directly. The config change itself is described under [`files` / `extraResources` / `extraFiles` → `fileOptions`](./v27-config-changes.md#file-options-fileoptions).

### Also affecting hooks and custom signers {#also-affecting-hooks}

These are documented on other pages:

- **`afterPack` hooks on macOS:** with Electron 41+, the Electron Framework is patched and signed again ad hoc after `afterPack`. If you sign the app in `afterPack`, or change `app.asar` / `Info.plist` after it, see [the ASAR integrity digest](./v27-runtime-changes.md#macos-asar-integrity-digest).
- **Custom Windows signing hooks** move to `win.sign.sign` ([config change](./v27-config-changes.md#custom-windows-signing-hooks-move-to-winsignsign)) and now need `win.sign.publisherName` ([build check](./v27-build-changes.md#windows-publishername-is-validated-against-the-signing-certificate)).
- **Custom macOS signing functions** (`mac.sign: "./customSign.js"`) can no longer sit next to sibling signing options: see [macOS signing → `mac.sign`](./v27-config-changes.md#macos-signing-macsign).
- **Custom electron-updater providers** that don't extend a built-in provider must override `Provider.feedBaseUrl` when used with credential headers: see [Update credentials stay on the feed's origin](./v27-runtime-changes.md#update-credentials-stay-on-the-feeds-origin).

---

## Custom scripts {#custom-scripts}

A custom NSIS script that hard-codes a file-association ProgID is affected by the [NSIS ProgID format change](./v27-runtime-changes.md#nsis-file-association-progid-format-changed).

### NSIS `customInstallMode` macro guard casing corrected {#nsis-custominstallmode-macro-guard-casing-corrected}

**How you'll find out:** **Silent.**

The guard around the `customInstallMode` macro in `multiUserUi.nsh` previously checked `!ifmacrodef customInstallmode` (lowercase `m`), while the [documentation](../nsis.md) and the adjacent `!insertmacro customInstallMode` call use `customInstallMode`. In v27 the guard checks the documented name, `customInstallMode`.

**No action is required if** your custom NSIS script (`build/installer.nsh` or `nsis.include`) defines the macro with the documented casing — it is now reliably applied on the install-mode page of assisted multi-user installers (e.g. to set `$isForceMachineInstall`).

**Action is required only if** you defined the macro under the exact lowercase name `customInstallmode`, which relied on the undocumented casing of the old guard — rename the definition to `customInstallMode`:

```nsis
!macro customInstallMode
  # set $isForceCurrentInstall or $isForceMachineInstall here
!macroend
```

### Linux maintainer-script EJS template syntax {#linux-maintainer-script-ejs-template-syntax}

**How you'll find out:** **Fails the build** when a maintainer script still contains an EJS tag.

The legacy `<%= varName %>` EJS interpolation in Linux maintainer scripts (e.g. FPM `after-install`/`after-remove`) is removed. Use shell-style `${varName}` instead.

---

## Internal changes (non-user-facing)

These changes have no impact on your build configuration or the public API. They are listed for transparency about what shipped in v27.

<details>
<summary>Show internal changes</summary>

- **Native ESM build pipeline.** Babel was removed entirely; packages are compiled by `tsc` to native ESM with `exports` maps and full type declarations.
- **Code-quality modernization.** Production code paths adopt native Node.js APIs and modern TypeScript patterns (`sleep()` from `timers/promises`, native process signal handlers, `Error.cause`, `Reflect.get`/`set`, the WHATWG `URL` API, SHA-256 for WiX directory-ID generation).
- **Dead-code removal.** `ProtonFramework`, `LibUiFramework`, and `binDownload.ts` were deleted; all binary downloads were consolidated into a single `downloadBuilderToolset` path.
- **Flags consolidation.** All boolean `process.env` flags were consolidated into a single `flags.ts`, and `validateShellEmbeddable` moved to `builder-util/envUtil`.
- **Source reorganization.** Platform-specific files were split into per-platform subdirectories. The public API surface is unchanged.
- **Test suite.** Duplicated test files were replaced by runtime-generated tests that fan out across toolset version combinations.
- **`@electron/*` dependency major bumps.** `@electron/get` 3→5 (now `fetch`-based; drives the [`electronGet`](./v27-config-changes.md#electrondownload-electronget) rename), `@electron/osx-sign` 1→2 and `@electron/universal` 2→3 (drive the [`mac.sign`](./v27-config-changes.md#macos-signing-macsign) / [`mac.universal`](./v27-config-changes.md#macuniversal) pass-throughs), plus `@electron/asar` 3→4, `@electron/notarize` 2→3, and `@electron/fuses` 1→2. The fuses bump adds an optional `wasmTrapHandlers?: boolean` field to `electronFuses`; no existing fuse field was removed.

</details>
