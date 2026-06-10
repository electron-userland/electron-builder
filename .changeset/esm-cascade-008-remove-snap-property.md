---
"electron-builder": major
"app-builder-lib": major
---

feat(breaking): remove deprecated `snap` config property

The top-level `snap` configuration key is removed from `Configuration`. It was deprecated in v26
in favour of the structured `snapcraft` key and is now gone. All snap packaging support (the
`snap` build target, `snapcraftTest.ts`, CI snap jobs) is unaffected.

### Migration

Replace the flat `snap` key with `snapcraft` using an explicit `base` field:

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

Run `electron-builder migrate-schema` for a warning and link to the migration guide.

### Changed Files

| File | Change |
|---|---|
| `packages/app-builder-lib/src/configuration.ts` | `snap?: SnapOptions \| null` property removed |
| `packages/app-builder-lib/src/index.ts` | `SnapOptions` removed from public exports |
| `packages/electron-builder/src/index.ts` | `SnapOptions` removed from public exports |
| `packages/app-builder-lib/src/targets/linux/snap/SnapTarget.ts` | Removed `snap` fallback; always reads `snapcraft` config |
| `test/src/linux/snapTest.ts` | Deleted — all tests used deprecated `snap:` config; coverage exists in `snapcraftTest.ts` |

### Validations

- `pnpm compile` — passes (0 errors)
- `pnpm typecheck` — passes
- `pnpm typecheck:test` — passes
