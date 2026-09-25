# Migration Guide

## v26 → v27

v27 migrates the entire electron-builder package ecosystem to **native ES modules** and requires **Node.js >=22.12.0**. Alongside ESM, this release hard-deletes the deprecated APIs that had accumulated since v22 and reorganizes several configuration properties into clearer groupings.

**Most projects need only a Node.js version bump plus one command.** The `build()` API is unchanged and CJS `require()` continues to work on Node >=22.12. Renamed or restructured config keys are rewritten by `electron-builder migrate-schema` (Step 0); a few type exports were renamed, and several runtime defaults changed — see the breaking-changes page.

> **⚠️ Read the breaking changes before upgrading:** **[electron.build/docs/migration/v27-breaking-changes](https://www.electron.build/docs/migration/v27-breaking-changes)** — the authoritative catalogue of everything that changed.

Step-by-step walkthrough: **[electron.build/docs/migration/v26-to-v27](https://www.electron.build/docs/migration/v26-to-v27)**

> **Toolsets now default to `"latest"`.** In v27 every `toolsets.*` property defaults to the **newest published bundle**: an unset property and the literal `"latest"` both resolve to the latest version for that toolset (`null` is rejected by the schema; `migrate-schema` removes it). The effective defaults moved (v26 defaulted to the legacy bundles) — `wine` → `"system"` (the host `wine` on `PATH`; **building Windows targets on macOS now needs Wine installed**), `winCodeSign` → `1.3.0` (adds Azure Trusted Signing `dlib` + .NET 8), `appimage` → `1.1.0` (static FUSE3 runtime, `unsquashfs`), `nsis` → `1.2.1` (NSIS 3.12), `icons` → `1.2.3`, `linuxToolsMac` → `1.0.1`, `sevenZip` → `1.0.1`; `fpm` (2.2.1) is unchanged. Pin a toolset to `"0.0.0"` to restore its legacy bundle. Because `winCodeSign` now defaults to `1.3.0`, Azure Trusted Signing uses the faster `signtool /dlib` path automatically — pin `winCodeSign` below `1.3.0` only to force the legacy PowerShell path.

### Step 0: run the automated migrator

Before upgrading, let the built-in command rewrite your config (`package.json` build key, `electron-builder.json`/`.json5`/`.yml`/`.yaml`, or a `.js`/`.ts`/`.cjs`/`.mjs` config) in place:

```bash
electron-builder migrate-schema           # apply changes
electron-builder migrate-schema --dry-run # preview only
```

It handles every config-level breaking change that has a mechanical v27 equivalent: `electronCompile`, `framework`/`nodeVersion`/`launchUiVersion`, `disableDefaultIgnoredFiles`, `linux.syncDesktopName`, the `nativeModules` grouping, ASAR consolidation (`asarUnpack` → `asar.unpack` at the root and per platform, `disableSanityCheckAsar` → `asar.disableSanityCheck`, `disableAsarIntegrity` → `asar.disableIntegrity`, legacy `asar-unpack`/`asar.unpackDir` keys), macOS signing consolidation (`mac.identity`/`type`/`entitlements`/`hardenedRuntime`/etc. → `mac.sign.*`, `signIgnore` → `sign.ignore`, `gatekeeperAssess` removed), `mac.universal` consolidation, Windows signing (`win.signtoolOptions` / `win.azureSignOptions` → `win.sign`, `signExecutable` / `signAndEditExecutable`), `electronDownload` → `electronGet`, `appImage.systemIntegration`, GitHub `vPrefixedTagName` → `tagNamePrefix`, `snap` → `snapcraft`, `helper-bundle-id`, `squirrelWindows.noMsi`, `toolsets.*` values v27 rejects, and root-level `directories`. JS/TS configs are rewritten with a comment-preserving codemod; TOML is printed as manual steps. `squirrelWindows.customSquirrelVendorDir` cannot be rewritten and is reported with a warning.

### Breaking changes at a glance

| Change | Auto-migrated | Action required |
|--------|:---:|----------------|
| **Node.js >=22.12.0 required** | — | Update runtime and CI |
| All packages are native ESM | — | None — CJS `require()` still works on Node >=22.12 |
| `electronCompile` removed | ✓ | Remove from config; migrate to a modern bundler |
| `framework`, `nodeVersion`, `launchUiVersion` removed | ✓ | Removed automatically (Electron is the only framework) |
| Native-module options grouped under `nativeModules` | ✓ | `nativeRebuilder` → `rebuildMode`; `npmSkipBuildFromSource` → `buildDependenciesFromSource` |
| Legacy `asar-unpack` / `asar.unpack*` keys consolidated | ✓ | All ASAR config moved under `asar` object: `asar.unpack`, `asar.disableSanityCheck`, `asar.disableIntegrity` |
| macOS signing fields consolidated under `mac.sign` | ✓ | `identity`, `entitlements`, `hardenedRuntime`, `type`, etc. → `mac.sign.*`; `signIgnore` → `sign.ignore` (also `mas`/`masDev`) |
| `mac.universal` consolidation | ✓ | `mergeASARs`, `singleArchFiles`, `x64ArchFiles` → `mac.universal.*` |
| `electronDownload` → `electronGet` | ✓ | Renamed; `mirror` → `mirrorOptions.mirror`, `isVerifyChecksum` → `unsafelyDisableChecksums` |
| `appImage.systemIntegration` removed | ✓ | Removed automatically |
| `GithubOptions.vPrefixedTagName` removed | ✓ | Replaced by `tagNamePrefix` |
| Windows signing unified under `win.sign` | ✓ | `win.signtoolOptions` / `win.azureSignOptions` → `win.sign: { type, … }` (Azure extra keys → `additionalMetadata`); `win.signExecutable: false` → `win.sign: false` |
| `snap` config key removed | ✓ | Restructured to `snapcraft` with an explicit `base` |
| `build.helper-bundle-id` removed | ✓ | Moved to `mac.helperBundleId` |
| `squirrelWindows.noMsi` removed | ✓ | Replaced by `msi` (inverted) |
| Root-level `directories` removed | ✓ | Moved under `build.directories` |
| `squirrelWindows.customSquirrelVendorDir` removed | — | Supply a custom bundle via `toolsets.squirrel` (different layout; `migrate-schema` warns) |
| Implicit `--publish` removed | — | Pass `--publish` explicitly |
| `--em.build` / `--em.directories` CLI flags removed | — | Use `-c` / `-c.directories` |
| `PackagerOptions.devMetadata` / `extraMetadata` removed | — | Use `config` / `config.extraMetadata` |
| Toolset env-var overrides removed | — | `APPIMAGE_TOOLS_PATH`, `ELECTRON_BUILDER_NSIS_DIR`, etc. → `toolsets.X: { url, checksum }` (`ToolsetCustom`); `USE_SYSTEM_WINE` → drop it (host Wine is the default) |
| Toolset defaults now resolve to `"latest"` (newest bundle) | — | No action; pin to `"0.0.0"` to restore a legacy bundle. `wine` is now the host install (install Wine on macOS build hosts), `winCodeSign`→1.3.0, `appimage`→1.1.0 |
| Runtime defaults and electron-updater API changes | — | Entitlements, DMG APFS, missing-dependency errors, `quitAndInstall` / `autoInstallEvent` / `downloadUpdate()`, … — see the [breaking changes](https://www.electron.build/docs/migration/v27-breaking-changes#breaking-changes-at-a-glance) |
| `electron-forge-maker-*` are now ESM | — | None — same API, same `export default` shape |

### 1. Update Node.js

```bash
# nvm
nvm install 22 && nvm use 22

# fnm
fnm install 22 && fnm use 22
```

GitHub Actions:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '22'
```

### 2. ESM/CJS — no code changes needed on Node >=22.12

```js
// CJS — still works
const { build } = require("electron-builder")

// ESM — now the preferred style
import { build } from "electron-builder"
```

### 3. Remove `electronCompile` from build config (if present)

```json5
{
  "build": {
    "electronCompile": true  // ← remove this line
  }
}
```

Migrate to [electron-vite](https://electron-vite.org/), [esbuild](https://esbuild.github.io/), or [webpack](https://webpack.electron.build/).

### Full migration details

See the full **[breaking changes reference](https://www.electron.build/docs/migration/v27-breaking-changes)** and the step-by-step **[migration walkthrough](https://www.electron.build/docs/migration/v26-to-v27)**.
