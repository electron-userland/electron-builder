---
"app-builder-lib": patch
"builder-util": patch
---

Extract `validateShellEmbeddable` to `builder-util/envUtil`; consolidate all boolean env-var flags into `flags.ts`.

## PR Description

### Summary

Two independent refactors that share a common theme — making scattered, hard-to-discover environment variable checks named, testable, and centrally enumerable.

**`validateShellEmbeddable` promotion (`builder-util/envUtil`):**
- Moved from its previous temporary inline in `coreLegacy.ts` to `packages/builder-util/src/envUtil.ts`
- Re-exported from the `builder-util` barrel (`export * from "./envUtil.js"`)
- `coreLegacy.ts` now imports it from `builder-util` via the main import statement
- Tests added to `test/src/builder-util/utilTest.ts` covering safe values and shell-metacharacter rejection

**`flags.ts` consolidation (12 new wrappers):**

Previously only 3 env-var flags had named wrapper functions in `flags.ts`. The remaining 12 boolean flags were scattered inline across 10 files using ad-hoc `=== "true"` / `!== "true"` / `isEnvTrue(...)` expressions — hard to discover, impossible to stub uniformly in tests, and easy to miss when auditing behavior-controlling env vars.

New wrappers added to `packages/app-builder-lib/src/util/flags.ts`:

| Function | Env Var |
|----------|---------|
| `isCscForPullRequest()` | `CSC_FOR_PULL_REQUEST` |
| `isUseSystemOsslSigncode()` | `USE_SYSTEM_OSSLSIGNCODE` |
| `isRemoveStageDirEvenIfDebug()` | `ELECTRON_BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG` |
| `isOfflineModeEnabled()` | `ELECTRON_BUILDER_OFFLINE` |
| `isPublishForPullRequest()` | `PUBLISH_FOR_PULL_REQUEST` |
| `isElectronBuilderAllowedAsProductionDependency()` | `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` |
| `isNpmNoBinLinks()` | `NPM_NO_BIN_LINKS` |
| `isTravis()` | `TRAVIS` |
| `isUseSystemFpm()` | `USE_SYSTEM_FPM` |
| `isUseSystemWine()` | `USE_SYSTEM_WINE` |
| `isFpmDebug()` | `FPM_DEBUG` |
| `isSnapDestructiveMode()` | `SNAP_DESTRUCTIVE_MODE` |

**Call sites updated:**
- `codeSign/macCodeSign.ts`: `isEnvTrue(CSC_FOR_PULL_REQUEST)` → `isCscForPullRequest()`, `process.env.TRAVIS` → `isTravis()`; removed `isEnvTrue` from builder-util import
- `codeSign/windowsSignToolManager.ts`: `isUseSystemOsslSigncode` rename
- `publish/PublishManager.ts`: `process.env.PUBLISH_FOR_PULL_REQUEST` → `isPublishForPullRequest()`
- `targets/FpmTarget.ts`: `process.env.FPM_DEBUG` → `isFpmDebug()`; imports `getFpmPath` from `linux.ts` (not deleted `fpm.ts`)
- `targets/snap/coreLegacy.ts`: `isSnapDestructiveMode()` already wired via auto-merge
- `targets/targetUtil.ts`: `ELECTRON_BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG` → `isRemoveStageDirEvenIfDebug()`
- `toolsets/linux.ts`: `USE_SYSTEM_FPM` → `isUseSystemFpm()` (applied to merged file; `toolsets/fpm.ts` deleted)
- `toolsets/windows.ts`: `USE_SYSTEM_OSSLSIGNCODE` → `isUseSystemOsslSigncode()` (applied to merged file; `toolsets/winCodeSign.ts` deleted)
- `toolsets/wine.ts`: `USE_SYSTEM_WINE` → `isUseSystemWine()`
- `util/packageMetadata.ts`: `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` → `isElectronBuilderAllowedAsProductionDependency()`
- `util/yarn.ts`: `NPM_NO_BIN_LINKS` → `isNpmNoBinLinks()`

### Changed Files

| File | Change |
|------|--------|
| `packages/builder-util/src/envUtil.ts` | Export `validateShellEmbeddable` |
| `packages/app-builder-lib/src/util/flags.ts` | Add 12 named env-var wrapper functions |
| `packages/app-builder-lib/src/codeSign/macCodeSign.ts` | Use `isCscForPullRequest`, `isTravis` |
| `packages/app-builder-lib/src/codeSign/windowsSignToolManager.ts` | Use `isUseSystemOsslSigncode` |
| `packages/app-builder-lib/src/publish/PublishManager.ts` | Use `isPublishForPullRequest`, `isOfflineModeEnabled` |
| `packages/app-builder-lib/src/targets/FpmTarget.ts` | Use `isFpmDebug`; import from `linux.ts` |
| `packages/app-builder-lib/src/targets/snap/coreLegacy.ts` | Import `validateShellEmbeddable` from `builder-util` |
| `packages/app-builder-lib/src/targets/targetUtil.ts` | Use `isRemoveStageDirEvenIfDebug` |
| `packages/app-builder-lib/src/toolsets/linux.ts` | Use `isUseSystemFpm` |
| `packages/app-builder-lib/src/toolsets/windows.ts` | Use `isUseSystemOsslSigncode` |
| `packages/app-builder-lib/src/toolsets/wine.ts` | Use `isUseSystemWine` |
| `packages/app-builder-lib/src/util/packageMetadata.ts` | Use `isElectronBuilderAllowedAsProductionDependency` |
| `packages/app-builder-lib/src/util/yarn.ts` | Use `isNpmNoBinLinks` |
| `test/src/builder-util/utilTest.ts` | Add `validateShellEmbeddable` tests |

### Validations

- `pnpm compile` exits 0
- `pnpm typecheck` exits 0
- `pnpm typecheck:test` exits 0

### Test Plan

- [x] `pnpm compile` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm typecheck:test` passes
- [ ] `validateShellEmbeddable` unit tests: `TEST_FILES=utilTest pnpm ci:test`
- [ ] No regressions in code-signing, FPM packaging, or Wine-based builds
