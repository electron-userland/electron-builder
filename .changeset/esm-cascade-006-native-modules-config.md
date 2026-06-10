---
"app-builder-lib": major
---

Breaking: group native-module rebuild options under `nativeModules` sub-key

Four previously root-level `Configuration` properties are moved into a new `nativeModules`
sub-key, and `nativeRebuilder` is renamed to `rebuildMode`.

```diff
-{
-  "buildDependenciesFromSource": true,
-  "nodeGypRebuild": false,
-  "npmRebuild": true,
-  "nativeRebuilder": "parallel"
-}
+{
+  "nativeModules": {
+    "buildDependenciesFromSource": true,
+    "nodeGypRebuild": false,
+    "npmRebuild": true,
+    "rebuildMode": "parallel"
+  }
+}
```

`npmArgs` remains at the root — it governs the package-manager install phase, not
the native-module rebuild step.

---

### Summary

- **New `NativeModulesConfig` interface** on `CommonConfiguration.nativeModules`:
  - `buildDependenciesFromSource` — was root-level, same name
  - `nodeGypRebuild` — was root-level, same name
  - `npmRebuild` — was root-level, same name
  - `rebuildMode` — was root-level `nativeRebuilder` (renamed for clarity)
- Log strings updated from `config.buildDependenciesFromSource` → `config.nativeModules?.buildDependenciesFromSource` etc.
- Regenerated `scheme.json` to reflect new shape.
- Prettier formatting pass over several source files.

### Migration

| Before (v26) | After (v27) |
|---|---|
| `{ "npmRebuild": false }` | `{ "nativeModules": { "npmRebuild": false } }` |
| `{ "nodeGypRebuild": true }` | `{ "nativeModules": { "nodeGypRebuild": true } }` |
| `{ "buildDependenciesFromSource": true }` | `{ "nativeModules": { "buildDependenciesFromSource": true } }` |
| `{ "nativeRebuilder": "parallel" }` | `{ "nativeModules": { "rebuildMode": "parallel" } }` |

### Changed Files

| File | Change |
|---|---|
| `packages/app-builder-lib/src/configuration.ts` | New `NativeModulesConfig` interface; root-level properties removed |
| `packages/app-builder-lib/src/packager.ts` | All refs updated to `config.nativeModules?.X` |
| `packages/app-builder-lib/src/util/yarn.ts` | `rebuild()` reads `nativeModules?.rebuildMode` |
| `packages/app-builder-lib/scheme.json` | Regenerated |
| `test/src/**` | Tests migrated to `nativeModules.*` |

### Validations

- `pnpm compile` — passes (0 errors)
- `pnpm typecheck` — passes
- `pnpm typecheck:test` — passes
