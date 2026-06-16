# Migration Guide

## v26 → v27

v27 migrates the entire electron-builder package ecosystem to **native ES modules** and requires **Node.js >=22.12.0**. Alongside ESM, this release hard-deletes the deprecated APIs that had accumulated since v22 and reorganizes several configuration properties into clearer groupings.

**Most projects need only a Node.js version bump.** The `build()` API and all exported types are unchanged, and CJS `require()` continues to work on Node >=22.12 — no code changes needed unless you used `electronCompile` or one of the removed config options below.

Full guide: **[https://www.electron.build/docs/migration/v26-to-v27](https://www.electron.build/docs/migration/v26-to-v27)**

### Step 0: run the automated migrator

Before upgrading, let the built-in command rewrite your static config (`package.json` build key, `electron-builder.json`/`.json5`/`.yml`/`.yaml`) in place:

```bash
electron-builder migrate-schema           # apply changes
electron-builder migrate-schema --dry-run # preview only
```

It handles **every config-level breaking change** automatically: `electronCompile`, `framework`/`nodeVersion`/`launchUiVersion`, the `nativeModules` grouping, ASAR consolidation (`asarUnpack` → `asar.unpack`, `disableSanityCheckAsar` → `asar.disableSanityCheck`, `disableAsarIntegrity` → `asar.disableIntegrity`, legacy `asar-unpack`/`asar.unpackDir` keys), macOS signing consolidation (`mac.identity`/`entitlements`/`hardenedRuntime`/etc. → `mac.sign.*`, `signIgnore` → `sign.ignore`), `mac.universal` consolidation (`mergeASARs`/`singleArchFiles`/`x64ArchFiles` → `mac.universal.*`), `electronDownload` → `electronGet`, `appImage.systemIntegration`, `vPrefixedTagName`, `win.azureSignOptions` extras, `snap` → `snapcraft`, `helper-bundle-id`, `squirrelWindows.noMsi`, and root-level `directories`. Programmatic configs (`.js`/`.ts`/`.cjs`/`.mjs`) and TOML are detected and printed as manual steps instead.

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
| `win.azureSignOptions` index-signature keys | ✓ | Moved into `additionalMetadata` |
| `snap` config key removed | ✓ | Restructured to `snapcraft` with an explicit `base` |
| `build.helper-bundle-id` removed | ✓ | Moved to `mac.helperBundleId` |
| `squirrelWindows.noMsi` removed | ✓ | Replaced by `msi` (inverted) |
| Root-level `directories` removed | ✓ | Moved under `build.directories` |
| Implicit `--publish` removed | — | Pass `--publish` explicitly |
| `--em.build` / `--em.directories` CLI flags removed | — | Use `-c` / `-c.directories` |
| `PackagerOptions.devMetadata` / `extraMetadata` removed | — | Use `config` / `config.extraMetadata` |
| Toolset env-var overrides removed | — | Use `toolsets.X: { url, checksum }` (`ToolsetCustom`) |
| Toolset default versions bumped | — | Optionally pin to `"0.0.0"` to restore legacy bundles |
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

See the complete, sectioned guide at [https://www.electron.build/docs/migration/v26-to-v27](https://www.electron.build/docs/migration/v26-to-v27).
