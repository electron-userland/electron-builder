---
"app-builder-lib": patch
"electron-builder-squirrel-windows": patch
---

Dead code removal: delete ProtonFramework, LibUiFramework, and binDownload.ts; consolidate all binary downloads into `downloadBuilderToolset`.

## PR Description

### Summary

This cascade removes dead framework code and consolidates the fragmented binary-download infrastructure into a single, testable API surface.

**Dead frameworks removed:**
- `ProtonFramework.ts` — never wired into the active build path; `createFrameworkInfo` in `packager.ts` only called `createElectronFrameworkSupport`. The `framework: "proton"` config key had no runtime handler.
- `frameworks/LibUiFramework.ts` — only referenced by ProtonFramework. Helper exports (`downloadNodeJsBinary`, `downloadLaunchUiDir`, `validateShellEmbeddable`, etc.) became dead when the framework class was removed.
- `test/src/protonTest.ts`, `test/src/libUiFrameworkTest.ts`, `test/snapshots/protonTest.js.snap` — integration/unit tests for deleted code.
- `packager.ts` now throws `InvalidConfigurationError` for any unknown `framework` config value.

**`binDownload.ts` and `targets/tools.ts` removed:**
- `getBinFromUrl(release, file, hash)` — superseded by `downloadBuilderToolset({ releaseName, filenameWithExt, checksums })`
- `getBinFromCustomLoc(name, ver, url, hash)` — superseded by `downloadBuilderToolset({ ..., overrideUrl })`
- All call sites migrated (see below)

**Migrated call sites:**
| File | Old API | New API |
|------|---------|---------|
| `toolsets/windows.ts` | `getBinFromUrl` × 3 + `getBinFromCustomLoc` × 2 | `downloadBuilderToolset` |
| `toolsets/linux.ts` | `getBinFromUrl` | `downloadBuilderToolset` |
| `targets/MsiTarget.ts` | `getBinFromUrl` | `downloadBuilderToolset` |
| `SquirrelWindowsTarget.ts` | `getBinFromUrl` | `downloadBuilderToolset` |
| `codeSign/codesign.ts` | `download` (from binDownload) | `download` (from electronGet) + `null` hash |

**`indexInternal.ts` updated:**
- Old: `export { getBinFromUrl } from "./binDownload.js"`
- New: `export { download, resolveBuilderBinaryUrl } from "./util/electronGet.js"`

**`test/src/binDownloadTest.ts` replaced:**
- Old tests mocked internal download helpers
- New tests directly exercise `resolveBuilderBinaryUrl` and `downloadBuilderToolset` with no mocking needed

**`coreLegacy.ts` fix:**
- `validateShellEmbeddable` was inlined (previously imported from deleted `LibUiFramework.ts`) pending its promotion to `builder-util/envUtil` in cascade-003.

### Changed Files

| File | Change |
|------|--------|
| `packages/app-builder-lib/src/binDownload.ts` | Deleted |
| `packages/app-builder-lib/src/targets/tools.ts` | Deleted |
| `packages/app-builder-lib/src/ProtonFramework.ts` | Deleted |
| `packages/app-builder-lib/src/frameworks/LibUiFramework.ts` | Deleted |
| `test/src/protonTest.ts` | Deleted |
| `test/src/libUiFrameworkTest.ts` | Deleted |
| `test/snapshots/protonTest.js.snap` | Deleted |
| `packages/app-builder-lib/src/packager.ts` | Remove framework imports; throw on unknown framework |
| `packages/app-builder-lib/src/indexInternal.ts` | Re-export download/resolveBuilderBinaryUrl |
| `packages/app-builder-lib/src/codeSign/codesign.ts` | Use electronGet download |
| `packages/app-builder-lib/src/toolsets/windows.ts` | All calls → downloadBuilderToolset |
| `packages/app-builder-lib/src/toolsets/linux.ts` | fpm download → downloadBuilderToolset |
| `packages/app-builder-lib/src/targets/MsiTarget.ts` | WiX download → downloadBuilderToolset |
| `packages/app-builder-lib/src/targets/snap/coreLegacy.ts` | Inline validateShellEmbeddable |
| `packages/electron-builder-squirrel-windows/src/SquirrelWindowsTarget.ts` | squirrel download → downloadBuilderToolset |
| `test/src/binDownloadTest.ts` | Replace with direct API tests |

### Validations

- `pnpm compile` exits 0
- `pnpm typecheck` exits 0
- `pnpm typecheck:test` exits 0

### Test Plan

- [x] `pnpm compile` passes (TypeScript build succeeds)
- [x] `pnpm typecheck` passes (source packages)
- [x] `pnpm typecheck:test` passes (test suite types)
- [ ] `downloadBuilderToolset` integration: covered by existing toolset download tests in CI
- [ ] No regressions in NSIS/MSI/Squirrel Windows builds: covered by platform-specific CI
