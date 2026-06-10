---
"electron-builder": major
"app-builder-lib": major
"builder-util-runtime": major
"electron-publish": major
"electron-builder-squirrel-windows": major
---

feat(breaking): remove deprecated `snap` config property and all remaining deprecated APIs

Hard-deletes 14 deprecated features accumulated across the codebase. No migration shims remain.

### Removed APIs

| Removed | Replacement |
|---|---|
| `snap` config key (`Configuration`) | Use `snapcraft` with an explicit `base` field |
| `GithubOptions.vPrefixedTagName` | Use `tagNamePrefix: "v"` (or `""` for no prefix) |
| `PlatformPackager.info` (was public) | Use the typed getters on `PlatformPackager`; `info` is now `protected` |
| `PackagerOptions.devMetadata` | Use `config` instead |
| `PackagerOptions.extraMetadata` (in options) | Use `config.extraMetadata` |
| `asar-unpack` / `asar-unpack-dir` config keys | Use `asarUnpack` |
| `--em.build` CLI option | Use `-c` |
| `--em.directories` CLI option | Use `-c.directories` |
| `npmSkipBuildFromSource` | Use `nativeModules.buildDependenciesFromSource` |
| `appImage.systemIntegration` | Remove; AppImageLauncher handles desktop integration |
| `"directories"` in root `package.json` | Move to `build.directories` |
| `build.helper-bundle-id` (hyphenated) | Use `build.mac.helperBundleId` |
| `<%= varName %>` EJS template syntax in Linux scripts | Use `${varName}` |
| `noMsi` SquirrelWindows option | Use `msi: true` |
| `CI_BUILD_TAG` environment variable | Use `CI_COMMIT_TAG` |

### snap Migration

```diff
 {
   "build": {
-    "snap": {
-      "confinement": "strict",
-      "stagePackages": ["libfoo"],
-      "base": "core22"
-    }
+    "snapcraft": {
+      "base": "core22",
+      "core22": {
+        "confinement": "strict",
+        "stagePackages": ["libfoo"]
+      }
+    }
   }
 }
```

Run `electron-builder migrate-schema` to auto-migrate most of these changes.

### Changed Files

| File | Change |
|---|---|
| `packages/app-builder-lib/src/configuration.ts` | `snap?: SnapOptions \| null` property removed |
| `packages/app-builder-lib/src/index.ts` | `SnapOptions` removed from public exports |
| `packages/electron-builder/src/index.ts` | `SnapOptions` removed from public exports |
| `packages/app-builder-lib/src/targets/linux/snap/SnapTarget.ts` | Removed `snap` fallback; always reads `snapcraft` config |
| `packages/builder-util-runtime/src/publishOptions.ts` | `GithubOptions.vPrefixedTagName` removed; `githubTagPrefix` simplified |
| `packages/app-builder-lib/src/platformPackager.ts` | `info` made `protected`; `asar-unpack`/`asar-unpack-dir` checks deleted |
| `packages/app-builder-lib/src/packager.ts` | `devMetadata`/`extraMetadata` throw blocks removed |
| `packages/app-builder-lib/src/util/config/config.ts` | `--em.build`, `--em.directories`, `npmSkipBuildFromSource`, `appImage.systemIntegration` throws removed |
| `packages/app-builder-lib/src/util/packageMetadata.ts` | Root-level `directories` error removed |
| `packages/app-builder-lib/src/electron/mac/electronMac.ts` | `build.helper-bundle-id` fallback removed |
| `packages/app-builder-lib/src/targets/linux/FpmTarget.ts` | `<%= %>` template syntax removed |
| `packages/electron-builder-squirrel-windows/src/SquirrelWindowsTarget.ts` | `noMsi` compat block removed |
| `packages/electron-publish/src/publisher.ts` | `CI_BUILD_TAG` fallback removed |
| `packages/app-builder-lib/scheme.json` | `GithubOptions.vPrefixedTagName` schema entry removed |
| `test/src/linux/snapTest.ts` | Deleted — all tests used deprecated `snap:` config; coverage exists in `snapcraftTest.ts` |

### Validations

- `pnpm compile` — passes (0 errors)
- `pnpm typecheck` — passes
- `pnpm typecheck:test` — passes
