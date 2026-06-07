# Migration Plan: Reduce `PlatformPackager.info` Visibility

## Background

`PlatformPackager` holds a `readonly info: Packager` constructor parameter. Because TypeScript constructor parameters declared with `readonly` (but without an explicit access modifier) default to `public`, `info` is currently accessible everywhere — including Target subclasses, helper classes, and internal framework code. Targets routinely chain through `packager.info.*` to reach properties that could be (and in several cases already are) exposed as first-class getters on `PlatformPackager`.

---

## Can `info` be made `private`?

**No.** `PlatformPackager` subclasses (`MacPackager`, `WinPackager`, `LinuxPackager`) access `this.info.*` extensively in their own methods. `private` would break those.

## Can `info` be made `protected`?

**Yes — with a migration.** `protected` allows subclass access via `this.info.*`, but prevents external access via an instance reference (`packager.info.*`). All 78 external usages are internal to the monorepo (targets, helpers, framework code, tests); no user-facing hook or public API exposes `packager.info` directly.

### Security check: user-facing hooks
User hooks (`beforePack`, `afterPack`, `afterSign`, etc.) receive an `AfterPackContext` object, not a `PlatformPackager`. The hook context carries `packager: PlatformPackager<any>`, so if `info` becomes `protected`, user code that currently does `context.packager.info.*` would get a TypeScript error. **This is the primary blocker** (see Scope section below).

---

## Proposed Change

```diff
- readonly info: Packager
+ protected readonly info: Packager
```

---

## Why bother?

There are **24 distinct `Packager` properties** accessed through the `info` chain from outside `PlatformPackager`. The most frequent clusters are:

| Cluster | Properties | External callsites |
|---------|-----------|-------------------|
| Event emission | `emitArtifactBuildStarted`, `emitArtifactBuildCompleted`, `emitArtifactCreated`, `emitMsiProjectCreated`, `emitAppxManifestCreated` | 30+ |
| Temp/build utilities | `tempDirManager`, `buildResourcesDir`, `getWorkspaceRoot()` | 10+ |
| Metadata | `metadata.dependencies`, `.author`, `.license`, `.main`, `.homepage` | 8 |
| Framework info | `framework.distMacOsAppName`, `framework.isCopyElevateHelper` | 5 |
| Cancellation | `cancellationToken` | 3 |
| Misc | `repositoryInfo`, `stageDirPathCustomizer`, `relativeBuildResourcesDirname` | 9 |

Making `info` protected is worthwhile because:
1. Targets calling `packager.info.emitArtifactBuildStarted(...)` could call `packager.emitArtifactBuildStarted(...)` — cleaner call site.
2. `tempDirManager` is accessed 10+ times across targets; a `get tempDir()` getter hides the `Packager` indirection.
3. `metadata` is accessed in 8 places; a `get metadata()` pass-through on `PlatformPackager` makes the chain one step shorter.
4. Reduces the number of places that depend on the concrete `Packager` type, making future substitution easier.

---

## Pass-through Getters Already on PlatformPackager

These five getters already delegate to `this.info` and serve as the template:

```typescript
get packagerOptions(): PackagerOptions  → this.info.options
get buildResourcesDir(): string         → this.info.buildResourcesDir
get projectDir(): string                → this.info.projectDir
get config(): Configuration             → this.info.config
get debugLogger(): DebugLogger          → this.info.debugLogger
```

---

## Migration Phases

### Phase 1 — Add missing pass-through getters to `PlatformPackager`

Add public getters for the most-used `info` properties that external code reaches through the chain. Prioritized by callsite count:

| Getter to add | Delegates to | Callsites it fixes |
|---------------|-------------|-------------------|
| `get tempDirManager()` | `this.info.tempDirManager` | 10+ |
| `get metadata()` | `this.info.metadata` | 8 |
| `get framework()` | `this.info.framework` | 11+ (mostly MacPackager; also external) |
| `get cancellationToken()` | `this.info.cancellationToken` | 3+ |
| `get repositoryInfo()` | `this.info.repositoryInfo` | 3 |
| `get relativeBuildResourcesDirname()` | `this.info.relativeBuildResourcesDirname` | 3 |
| `get stageDirPathCustomizer()` | `this.info.stageDirPathCustomizer` | 2 |
| `get areNodeModulesHandledExternally()` | `this.info.areNodeModulesHandledExternally` | (internal use) |
| `get isPrepackedAppAsar()` | `this.info.isPrepackedAppAsar` | (internal use) |
| `get appDir()` | `this.info.appDir` | 4 |

> **Note on `framework`:** `MacPackager` subclass methods access `this.info.framework.*` internally. If `framework` is exposed as a getter, those become `this.framework.*`. But `framework` is already used directly in `doPack` via the local `this.info.framework` pattern — an explicit getter simply surfaces it at the `PlatformPackager` level.

### Phase 2 — Expose event emission methods as public delegates

The largest class of `info` accesses (30+ callsites) is event emission. Targets call:

```typescript
packager.info.emitArtifactBuildStarted({...})
packager.info.emitArtifactBuildCompleted({...})
packager.info.emitArtifactCreated({...})
packager.info.emitMsiProjectCreated({...})
packager.info.emitAppxManifestCreated({...})
```

Add forwarding methods to `PlatformPackager`:

```typescript
public emitArtifactBuildStarted(event: ArtifactBuildStarted): Promise<void> {
  return this.info.emitArtifactBuildStarted(event)
}
// ... similarly for the other four
```

This removes the motivation to reach through `info` at all.

> **Avoid `...args` rest-forwarding** — these are typed event objects; explicit signatures are safer and autocompleted.

### Phase 3 — Handle `metadata` accesses

Targets access `packager.info.metadata.dependencies`, `.author`, `.license`, etc. A `get metadata()` getter covers all of these. The existing `prepareAppInfo` usage inside `PlatformPackager` already uses `info.appInfo`/`info.metadata`; surfacing `metadata` as a public getter is consistent.

### Phase 4 — Migrate `tempDirManager` callsites

`packager.info.tempDirManager.getTempFile(...)` and `.createTempDir(...)` appear 10+ times across MsiTarget, FpmTarget, NsisTarget, SquirrelWindowsTarget, and several helpers. A `get tempDirManager()` getter resolves these.

The existing `getTempFile(suffix: string)` method on `PlatformPackager` (line 736) is a partial solution — it only covers `getTempFile`. Either extend it or add the full `tempDirManager` getter.

### Phase 5 — Change `info` to `protected`

After all external callsites are migrated to the new getters/methods, change the visibility:

```diff
- readonly info: Packager
+ protected readonly info: Packager
```

Run `pnpm compile`. Remaining TypeScript errors are residual callsites.

### Phase 6 — Address user-facing API breakage

**This is the hardest part.** User hook callbacks receive `context.packager: PlatformPackager<any>`. If those users currently write `context.packager.info.X`, making `info` protected is a **breaking change for users**.

Options:
- **Accept the break** with a major semver bump and migration guide. All needed properties will be available via the new getters.
- **Keep `info` public for one major version** via a `@deprecated` JSDoc note, then remove in the next.
- **Audit actual hook usage patterns** (via GitHub code search or community outreach) before deciding.

Recommendation: audit first. If `info` access in user hooks is rare (most users emit custom events or just read `appInfo`), accept the break in the next major. If it's common, add the getters first and deprecate `info` for a release cycle.

---

## Out of Scope for This Migration

- Changing `Packager` itself — it is a concrete class used directly in the build pipeline.
- Merging `Packager` and `PlatformPackager` — they serve different lifecycle roles.
- Making `info` `private` — not feasible without rewriting all subclass access.

---

## Summary Checklist

```
[ ] Phase 1 — Add pass-through getters (tempDirManager, metadata, framework, cancellationToken, etc.)
[ ] Phase 2 — Add event-emission forwarding methods
[ ] Phase 3 — Migrate metadata callsites
[ ] Phase 4 — Migrate tempDirManager callsites
[ ] Phase 5 — Change info to protected, fix compile errors
[ ] Phase 6 — Decide user-API breakage strategy before shipping
[ ] All phases — Run pnpm ci:test after each phase
```

# Dependency Slim-Down Plan for electron-builder

This document catalogs opportunities to further reduce or replace runtime dependencies across the monorepo packages, ranked by impact and effort.

---

## What Was Already Done

| Package | Removed | Reason |
|---|---|---|
| `dmg-builder` | `temp-file` (devDep) | Never directly imported; getTempFile flows through packager |
| `electron-builder-squirrel-windows` | `@types/archiver` (devDep) | archiver not imported anywhere in the package |
| `electron-builder-squirrel-windows` | `@types/fs-extra` (devDep) | fs-extra not imported anywhere in the package |

---

## Tier 1 — Quick Wins (Low Risk, Small Changes)

### 1. Inline `lodash.escaperegexp` → `electron-updater`

**Current:** `lodash.escaperegexp@4.1.2` + `@types/lodash.escaperegexp`
**Replace with:** One-liner native implementation

```ts
// Replaces: import * as escapeRegExp from "lodash.escaperegexp"
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
```

Used in `providers/Provider.ts` and `providers/GitLabProvider.ts`. Zero risk — the regex is RFC-standard and battle-tested. Removes 2 packages.

---

### 2. Replace `lodash.isequal` → `electron-updater`

**Current:** `lodash.isequal@4.5.0` + `@types/lodash.isequal`
**Options:**
- Inline `fast-deep-equal` (400 bytes, no sub-dependencies) — lighter than lodash
- Audit `DownloadedUpdateHelper.ts` to determine whether structural equality is actually needed vs. `JSON.stringify` comparison for the specific data shapes being compared

Used in a single file (`DownloadedUpdateHelper.ts`). Removes 2 packages.

---

### 3. Replace `sanitize-filename` → `builder-util`

**Current:** `sanitize-filename@1.6.3` (no runtime deps)
**Replace with:** A small inline function since `sanitize-filename` itself is only ~40 lines. The package has no sub-dependencies and is very lightweight; the gain here is removing an external dep with a 1-line replacement.

---

### 4. Replace `stat-mode` → `builder-util`

**Current:** `stat-mode@1.0.0`
**Replace with:** Native bitwise operations. `stat-mode` provides a thin wrapper over `fs.Stats.mode` bitmasks. Inline where used.

---

### 5. Remove or make optional `simple-update-notifier` → `electron-builder`

**Current:** Loaded via `require("simple-update-notifier")` in `cli/cli-util.ts`
**Options:**
- Gate behind a `--no-update-check` flag (currently no way to disable)
- Replace with a direct `npm view electron-builder version` check (no dependency, but loses caching)
- Remove entirely — users can check for updates themselves; this adds ~70 KB for a non-core feature

---

## Tier 2 — Medium Effort, High Value

### 6. Replace `form-data` → `electron-publish` with Node.js built-in

**Current:** `form-data@4.0.5`
**Minimum Node.js version in this project:** 14.0.0
**Path:** Node 18 shipped global `FormData`. Raise the minimum Node requirement to 18 (already a safe assumption in 2025–2026) and drop `form-data`. Removes 1 package + its transitive deps (`asynckit`, `combined-stream`, `mime-types`).

---

### 7. Consolidate `tiny-async-pool` → consider native async iteration

**Current:** `tiny-async-pool@1.3.0` used in both `app-builder-lib` and `builder-util`
`tiny-async-pool` itself is 34 lines. The dependency is harmless but is a candidate for inlining if we ever do a general audit pass, since the version is pinned to a specific release.

---

### 8. Move platform-specific deps to optional/peer dependencies

Several runtime deps are only needed on a specific platform or build target:

| Dep | Needed for | Current location |
|---|---|---|
| `@electron/notarize` | macOS notarization | `app-builder-lib` deps |
| `@electron/osx-sign` | macOS code signing | `app-builder-lib` deps |
| `@malept/flatpak-bundler` | Linux Flatpak target | `app-builder-lib` deps |
| `dmg-builder` | macOS DMG target | satisfied via peerDep of app-builder-lib |
| `electron-builder-squirrel-windows` | Windows Squirrel target | satisfied via peerDep of app-builder-lib |

**Plan:** Move `@electron/notarize`, `@electron/osx-sign`, and `@malept/flatpak-bundler` to `optionalDependencies` with platform guards (`"os": ["darwin"]` / `"os": ["linux"]`). This cuts install footprint significantly for Windows-only CI environments.

---

### 9. Replace `hosted-git-info` → `app-builder-lib`

**Current:** `hosted-git-info@4.1.0` used to parse git remote URLs in `normalizePackageData.ts` and `repositoryInfo.ts`
**Replace with:** A small regex or the `URL` built-in. `hosted-git-info`'s value here is mostly GitHub/GitLab/Bitbucket URL pattern matching, which can be done with ~20 lines. Removes `hosted-git-info` + its transitive dep `lru-cache`.

---

### 10. Audit `ejs` usage in `app-builder-lib`

**Current:** `ejs@3.1.8` used for NSIS installer script templating
**Options:**
- Replace with a simple `str.replace()` / hand-rolled template substitution if the template variables are not complex
- Replace with `mustache` (~12 KB, no deps) if logic is minimal

Worth auditing the NSIS templates to determine whether `ejs`'s full feature set (conditionals, loops) is exercised or if simple variable substitution would suffice.

---

## Tier 3 — Larger Refactors

### 11. Collapse the crypto stack in `app-builder-lib`

**Current:** `asn1js` + `pkijs` + `@peculiar/webcrypto` are all used together in `codeSign/certInfo.ts` for reading Windows PKCS#12 (`.pfx`) certificate files.
**Problem:** These three packages together pull in a heavy crypto stack.
**Alternatives:**
- `@peculiar/x509` — a higher-level wrapper over the same underlying crypto that might eliminate the need for raw `asn1js`/`pkijs` calls
- Use the `forge` library (`node-forge`) which handles PKCS#12 parsing in a single package
- Node.js 22 has `crypto.X509Certificate` with expanded DER/PEM support; evaluate if PKCS#12 can be handled natively

---

### 12. Replace `sax` → `builder-util-runtime`

**Current:** `sax@1.2.4` used in `xml.ts` for parsing XML (primarily Sparkle update manifests and plist files)
**Replace with:** `@xmldom/xmldom` (W3C DOM parser) or a lightweight streaming parser. Alternatively, since the XML parsed here is structured and predictable (Sparkle appcast, nuspec), a regex-based or hand-rolled minimal parser could eliminate the dependency entirely. Removes `sax` + `@types/sax`.

---

### 13. Make `@electron/rebuild` optional

**Current:** `@electron/rebuild@^4.0.4` in `app-builder-lib` dependencies — brings in a heavy build toolchain
**This is only needed** when users have native Node.js addons in their app.
**Plan:** Move to `optionalDependencies` and dynamically require it only when native modules are detected, erroring with a helpful message if it's not installed.

---

### 14. Separate `dotenv` / `dotenv-expand` as optional

**Current:** `dotenv@16.4.5` + `dotenv-expand@11.0.6` in `app-builder-lib` dependencies
These are loaded to allow `.env` files to supply build config. This is a convenience feature, not core functionality.
**Plan:** Move to `optionalDependencies` or only load if a `.env` file is detected in the project root.

---

## Summary Table

| Item | Packages saved | Effort |
|---|---|---|
| Inline `lodash.escaperegexp` | 2 | ~5 min |
| Replace `lodash.isequal` | 2 | ~30 min |
| Inline `sanitize-filename` | 1 | ~10 min |
| Inline `stat-mode` | 1 | ~10 min |
| Remove/gate `simple-update-notifier` | 1 | ~1 hr |
| Drop `form-data` (Node 18+) | 1 + transitive | ~2 hr |
| Platform-optional deps (notarize, osx-sign, flatpak) | 3 | ~1 day |
| Replace `hosted-git-info` | 1 + lru-cache | ~2 hr |
| Audit/replace `ejs` | 1 | ~4 hr |
| Collapse crypto stack | 2–3 | ~1 week |
| Replace `sax` | 1 + @types | ~4 hr |
| Optional `@electron/rebuild` | heavy transitive | ~1 day |
| Optional `dotenv`/`dotenv-expand` | 2 | ~2 hr |

**Quick wins subtotal:** removing lodash pair + sanitize-filename + stat-mode eliminates 6 packages with < 1 hour of effort.
**Platform guards subtotal:** marking 3 macOS/Linux-only packages as `optionalDependencies` can cut install footprint by 30–50 MB for Windows CI.

# Migration Plan: Encapsulate `platformSpecificBuildOptions` & Consolidate Target Options

## Problem Statement

`PlatformPackager.platformSpecificBuildOptions` is a `public readonly` field. Every Target subclass that needs a merged view of platform + target-specific config reaches through its packager reference and performs the same manual merge inline:

```typescript
// Repeated in ~9 Target subclasses today
readonly options: FooOptions = deepAssign({}, this.packager.platformSpecificBuildOptions, (this.packager.config as any)[this.name])
```

This creates four concrete problems:

1. **Leaked abstraction** — callers can read raw platform options and use them as if they were fully-resolved target options, or vice versa.
2. **Duplicated merge logic** — each Target re-implements the same 3-object `deepAssign` pattern.
3. **Two targets mutate the shared object** — `MsiTarget` and `MsiWrappedTarget` pass `platformSpecificBuildOptions` as the _first_ (mutation-target) arg to `deepAssign`, silently corrupting the platform-level options for anything that reads them later in the same pack run.
4. **Type-unsafe dynamic config access** — `(this.packager.config as any)[this.name]` suppresses TypeScript across every call site.

---

## Primary Objective: Scope & Proposed API

### New method on `PlatformPackager`

```typescript
// packages/app-builder-lib/src/platformPackager.ts
public getOptionsForTarget<T extends PlatformSpecificBuildOptions>(targetConfigKey: string): T {
  return deepAssign({}, this.platformSpecificBuildOptions, (this.config as any)[targetConfigKey]) as T
}
```

`deepAssign({}, ...)` ensures the result is always a fresh object — platform options are never mutated.

### Visibility change

```diff
- readonly platformSpecificBuildOptions: DC
+ protected readonly platformSpecificBuildOptions: DC
```

`protected` is the correct choice over `private` because:
- `MacPackager`, `WinPackager`, and `LinuxPackager` legitimately access `this.platformSpecificBuildOptions` for platform-level concerns (compression, code-signing, icon, etc.) — they are subclasses and `protected` keeps that working without introducing new pass-through getters.
- `Target` subclasses are _not_ subclasses of `PlatformPackager`; they hold a reference to one. `protected` makes `packager.platformSpecificBuildOptions` a TypeScript error from a Target, which is exactly the enforcement wanted.

> **Net result:** Packagers read it via `this.platformSpecificBuildOptions`. Targets get a merged, fresh object via `this.packager.getOptionsForTarget(...)`.

---

## Migration Phases

### Phase 0 — Fix the mutation bugs (no API change)

These two targets silently mutate the shared `platformSpecificBuildOptions` object. Fix first, independently, as a bug fix.

| File | Current (broken) | Fix |
|------|-----------------|-----|
| `targets/MsiTarget.ts:27` | `deepAssign(this.packager.platformSpecificBuildOptions, this.packager.config.msi)` | `deepAssign({}, this.packager.platformSpecificBuildOptions, this.packager.config.msi)` |
| `targets/MsiWrappedTarget.ts:13` | `deepAssign(this.packager.platformSpecificBuildOptions, this.packager.config.msiWrapped)` | `deepAssign({}, this.packager.platformSpecificBuildOptions, this.packager.config.msiWrapped)` |

**Verify:** existing tests pass; no behavior change (the mutation was likely unintentional).

---

### Phase 1 — Add `getOptionsForTarget` to `PlatformPackager`

- Add the method to `PlatformPackager` (no visibility change to `platformSpecificBuildOptions` yet).
- No callers changed yet — this is purely additive.
- **Verify:** `pnpm compile` passes.

---

### Phase 2 — Migrate uniform-pattern Target subclasses

These all follow the exact `deepAssign({}, platformSpecificBuildOptions, config[this.name])` pattern and can be mechanically swapped:

| Class | File | Key passed to `getOptionsForTarget` | Before | After |
|-------|------|------|--------|-------|
| `FpmTarget` | `targets/FpmTarget.ts:37` | `this.name` (`"deb"`, `"rpm"`, etc.) | `deepAssign({}, this.packager.platformSpecificBuildOptions, (this.packager.config as any)[this.name])` | `this.packager.getOptionsForTarget<LinuxTargetSpecificOptions>(this.name)` |
| `FlatpakTarget` | `targets/FlatpakTarget.ts:16` | `this.name` (`"flatpak"`) | same pattern | `this.packager.getOptionsForTarget<FlatpakOptions>(this.name)` |
| `AppImageTarget` | `targets/appimage/AppImageTarget.ts:22` | `this.name` (`"appimage"`) | same pattern | `this.packager.getOptionsForTarget<AppImageOptions>(this.name)` |
| `AppXTarget` | `targets/AppxTarget.ts:54` | `"appx"` | `deepAssign({}, this.packager.platformSpecificBuildOptions, this.packager.config.appx)` | `this.packager.getOptionsForTarget<AppXOptions>("appx")` |
| `MsiTarget` | `targets/MsiTarget.ts:27` | `"msi"` | (fixed in Phase 0) | `this.packager.getOptionsForTarget<MsiOptions>("msi")` |
| `MsiWrappedTarget` | `targets/MsiWrappedTarget.ts:13` | `"msiWrapped"` | (fixed in Phase 0) | `this.packager.getOptionsForTarget<MsiWrappedOptions>("msiWrapped")` |
| `SquirrelWindowsTarget` | `electron-builder-squirrel-windows/src/SquirrelWindowsTarget.ts:16` | `"squirrelWindows"` | `{ ...this.packager.platformSpecificBuildOptions, ...this.packager.config.squirrelWindows }` | `this.packager.getOptionsForTarget<SquirrelWindowsOptions>("squirrelWindows")` — **note:** changes spread to deepAssign, which affects nested objects; validate behavior |

**Verify after each file change:** `pnpm compile` + relevant unit tests.

---

### Phase 3 — Migrate special-case Targets

#### `NsisTarget` (`targets/nsis/NsisTarget.ts:52–78`)

NsisTarget has a two-step initialization: initial `readonly options` assignment followed by a conditional in-constructor `deepAssign()` mutation for `"nsis-web"` → `"nsisWeb"` remapping:

```typescript
// current
readonly options: NsisOptions = deepAssign({}, this.packager.platformSpecificBuildOptions, (this.packager.config as any)[this.name === "nsis-web" ? "nsis" : this.name])
// then in constructor:
deepAssign(this.options, (this.packager.config as any)[this.name === "nsis-web" ? "nsisWeb" : this.name])
```

Migration options (choose one):
- **Option A**: Pre-resolve the config key before calling `getOptionsForTarget` and make the secondary merge a second `deepAssign({}, firstResult, config.nsisWeb)` — keep `readonly options` as a field.
- **Option B**: Make `options` a regular (non-`readonly`) field and initialize + merge in the constructor body.

Recommendation: Option A — keeps the `readonly` contract and is explicit about the two config layers.

#### `SnapTarget` (`targets/snap/SnapTarget.ts:44`)

SnapTarget merges from two possible config keys as a fallback:

```typescript
deepAssign({}, platformSpecificBuildOptions, snapcraft ?? snap ?? {})
// where snapcraft = this.packager.config.snapcraft, snap = this.packager.config.snap
```

This cannot be reduced to a single `getOptionsForTarget` call. Instead, expose a thin overload or keep the explicit form with just the internal call changed:

```typescript
// After Phase 1 is done, simply stop accessing platformSpecificBuildOptions directly:
readonly options: SnapOptions = deepAssign(
  {},
  this.packager.getOptionsForTarget<SnapOptions>("snap"),   // merges platform + snap
  this.packager.config.snapcraft ?? {}                      // snapcraft overrides snap
)
```

This still eliminates the direct `platformSpecificBuildOptions` access.

#### `DmgTarget` (`dmg-builder/src/dmg.ts:47`)

DmgTarget **does not merge** platform options at all:

```typescript
this.options: DmgOptions = this.packager.config.dmg || Object.create(null)
```

This is intentional — DMG is a packaging layer on top of the `.app`, not a platform-level concern. **Leave as-is.** Document the intentional divergence with a comment if desired.

#### `MacPackager` multi-variant case (`macPackager.ts:112–127`)

MacPackager merges platform options with `mas`/`mas-dev` config inline in methods (not at field initialization):

```typescript
deepAssign({}, this.platformSpecificBuildOptions, this.config.mas)
deepAssign({}, this.platformSpecificBuildOptions, this.config.mas, this.config.masDev, {...})
```

These are inside `MacPackager` itself (a PlatformPackager subclass), so they continue to use `this.platformSpecificBuildOptions` directly via `protected` access — **no change needed here**. The method is scoped to packager internals, not a Target.

---

### Phase 4 — Change visibility of `platformSpecificBuildOptions`

After all Target-side callsites are migrated:

```diff
- readonly platformSpecificBuildOptions: DC
+ protected readonly platformSpecificBuildOptions: DC
```

Run `pnpm compile`. Any remaining errors point to callsites that still need migration. Fix them.

**Known non-Target external callers to address:**

| File | Location | Notes |
|------|----------|-------|
| `targets/LinuxTargetHelper.ts:115` | `const { compression, ...linuxOptions } = this.packager.platformSpecificBuildOptions` | LinuxTargetHelper is a helper (not Target) but holds a LinuxPackager ref — migrate to `getOptionsForTarget` or a dedicated packager method |
| `publish/updateInfoBuilder.ts:17` | `packager.platformSpecificBuildOptions.releaseInfo` | Candidate for a `releaseInfo` getter on packager (see Secondary Objective) |
| `targets/targetFactory.ts:18` | `platformSpecificBuildOptions.target` | This reads the `target` list to know which targets to build — belongs in packager, should be a method like `packager.getConfiguredTargets()` or accessed via `packager.config` |
| `test/src/helpers/packTester.ts:520` | Mock construction in tests | Update test mock to use the new API |

---

### Phase 5 — Update public API exports / types

Check `packages/app-builder-lib/src/index.ts` and `packages/electron-builder/src/index.ts` for re-exports of `platformSpecificBuildOptions`. Remove them if present. Bump a minor semver if `platformSpecificBuildOptions` was part of the documented public API.

---

## Checklist Summary

```
[ ] Phase 0 — Fix MsiTarget / MsiWrappedTarget mutation bugs
[ ] Phase 1 — Add getOptionsForTarget() to PlatformPackager
[ ] Phase 2 — Migrate uniform-pattern Targets (6 files)
[ ] Phase 3 — Migrate NsisTarget, SnapTarget (special cases)
[ ] Phase 3 — Verify DmgTarget intentional non-merge is documented
[ ] Phase 4 — Change platformSpecificBuildOptions to protected
[ ] Phase 4 — Resolve remaining compile errors
[ ] Phase 5 — Audit public API exports
[ ] All phases — Run pnpm ci:test after each phase
```

---

---

## Secondary Objective: Other Obfuscating Paradigms & Extraction Candidates

The following patterns recur across the codebase and could follow the same "upstream getter" approach as the primary refactor. Listed in rough priority order.

### S1 — `releaseInfo` resolution (Medium priority)

**Current (in `publish/updateInfoBuilder.ts:17`):**
```typescript
{ ...(packager.platformSpecificBuildOptions.releaseInfo || packager.config.releaseInfo) }
```
The same "platform-specific overrides global config" pattern is used for `releaseInfo`. A getter on `PlatformPackager`:
```typescript
get releaseInfo(): ReleaseInfo | undefined {
  return this.platformSpecificBuildOptions.releaseInfo ?? this.config.releaseInfo
}
```
This eliminates both a direct `platformSpecificBuildOptions` access and the inline coalesce, and makes the precedence rule discoverable in one place.

---

### S2 — `(this.packager.config as any)[this.name]` → type-safe config lookup (Medium priority)

The `any` cast appears in 5+ targets. The root cause is that `Configuration` doesn't expose a typed index signature for target config keys. Options:

**Option A** — Add a typed lookup method on `PlatformPackager`:
```typescript
protected getTargetConfigSlice<K extends keyof Configuration>(key: K): Configuration[K] {
  return this.config[key]
}
```
Callers use `this.packager.getTargetConfigSlice("appx")` — no `any`. This requires that target config keys be `keyof Configuration` (they already are for named keys like `appx`, `msi`, `nsis`).

**Option B** — For dynamic targets (`deb`, `rpm`, `flatpak`, `appimage`) where `this.name` is the key but it's not statically typed, define a union type of valid dynamic target config keys and narrow in the method.

Note: `getOptionsForTarget` introduced in the primary objective already contains this `any` cast internally. Centralizing it there means there's only one `any` in the codebase for this pattern instead of N.

---

### S3 — `executableName` resolution in `LinuxPackager` (Low priority)

**Current (`linuxPackager.ts:20`):**
```typescript
this.platformSpecificBuildOptions.executableName ?? info.config.executableName
```

This is a `protected` subclass access and already inside `LinuxPackager` — it's fine. But if `LinuxTargetHelper` also needs this (it currently reads `packager.platformSpecificBuildOptions.executableName` directly in a few places), moving to a getter:

```typescript
// in LinuxPackager
get executableName(): string | null | undefined {
  return this.platformSpecificBuildOptions.executableName ?? this.config.executableName
}
```

…would make the resolution rule consistent across all Linux Target consumers.

---

### S4 — `ArchiveTarget`'s `(this.packager.config as any)[this.name]` (Low priority)

`ArchiveTarget` is the base for `zip`/`tar.gz`/`7z` targets. Its options initialization (`targets/ArchiveTarget.ts:19`) doesn't merge platform options at all — it reads only `config[this.name]`. This is likely intentional (archive options aren't platform-specific), but it's inconsistent with the "always merge via `getOptionsForTarget`" convention. Investigate whether platform-level defaults (e.g., `compression`) should flow in, and if so migrate; otherwise document the intentional divergence.

---

### S5 — `SquirrelWindowsTarget` spread vs. deepAssign inconsistency (Low priority)

Noted in Phase 2 above: the spread operator doesn't deep-merge nested objects. This is a behavioral difference from every other Target. Changing to `getOptionsForTarget` (which uses `deepAssign`) would align it — but only after validating that no existing `SquirrelWindowsOptions` consumers depend on the shallow-merge behavior.

---

### S6 — `defaultArch` / `compression` / `forceCodeSigning` — already good

These are already extracted as `get` accessors on `PlatformPackager` (e.g., `get compression()` at line 105). They serve as the model for what this refactor is standardizing more broadly. No further action needed.

---

### S7 — `MacPackager._activePackConfig` complexity (Out of scope for this PR)

MacPackager stores a mutable `_activePackConfig` that switches between `mac`, `mas`, and `mas-dev` config variants mid-build. This is inherently more complex than the standard single-variant case and warrants a separate investigation. The primary refactor should leave this subsystem untouched.

---

## Out of Scope (for this change)

- Re-typing `platformSpecificBuildOptions` to be more narrowly typed per target (would require generics threads through Target).
- Removing the `deepAssign` call from `getOptionsForTarget` and moving to a config-parse-time merge (would change the runtime model).
- Any changes to DmgTarget's intentionally-different options model.
- MacPackager `_activePackConfig` redesign.
- Moving `PlatformSpecificBuildOptions` type resolution to build config validation time.

eww we # v27 Deprecation & Legacy Cleanup Plan

Audit of all `@deprecated` annotations, runtime deprecation warnings, and legacy items across the codebase. Items are grouped by action type.

---

## Group A — Already Throws (remove guard code in v27)

These already throw `InvalidConfigurationError` at runtime. In v27 we can delete the guard + the dead option types entirely — nobody passing these values is still running successfully.

| Item | File | Lines | Guard → Remove |
|------|------|-------|----------------|
| `devMetadata` in packager options | [packager.ts](packages/app-builder-lib/src/packager.ts#L205) | 205–207 | Remove `if ("devMetadata" in options)` throw + dead `devMetadata` option from `PackagerOptions` type |
| `extraMetadata` in packager options | [packager.ts](packages/app-builder-lib/src/packager.ts#L208) | 208–210 | Remove `if ("extraMetadata" in options)` throw |
| `--em.build` CLI flag | [config.ts](packages/app-builder-lib/src/util/config/config.ts#L228) | 228–229 | Remove block + `build` field from `extraMetadata` merge path |
| `--em.directories` CLI flag | [config.ts](packages/app-builder-lib/src/util/config/config.ts#L230) | 230–232 | Remove block |
| `npmSkipBuildFromSource` option | [config.ts](packages/app-builder-lib/src/util/config/config.ts#L236) | 236–238 | Remove block + remove from any option type/schema |
| `appImage.systemIntegration` option | [config.ts](packages/app-builder-lib/src/util/config/config.ts#L240) | 240–242 | Remove block + remove from `AppImageOptions` |
| `directories` at package.json root | [packageMetadata.ts](packages/app-builder-lib/src/util/packageMetadata.ts#L49) | ~49 | Remove check entirely |
| `asar-unpack` / `asar-unpack-dir` / `asar.unpackDir` / `asar.unpack` build metadata keys | [platformPackager.ts](packages/app-builder-lib/src/platformPackager.ts#L557) | 557–570 | Remove the `errorMessage` helper + all four guard `if` blocks; fix typo `"is deprecated is deprecated"` en passant |

---

## Group B — Runtime Warnings Explicitly Targeting v27

These already warn users that they must change before v27. **Remove the behavior (not just the warning) in v27.**

### B1. Implicit publishing (`PublishManager.ts` lines 93, 98, 101)

[PublishManager.ts](packages/app-builder-lib/src/publish/PublishManager.ts#L93)

Currently warns when `publishOptions.publish` is `undefined` and the build was triggered by:
- npm lifecycle event `"release"`
- A git tag push
- CI detection

**v27 action:** Remove the three `log.warn` paths and the implicit-publish logic that follows them. Users must pass `--publish` explicitly. The three branches in the constructor that auto-set `publish` based on npm/git/CI heuristics should be deleted.

### B2. Snap `snap` config key → `snapcraft`

[configuration.ts](packages/app-builder-lib/src/configuration.ts#L114) · [SnapOptions.ts](packages/app-builder-lib/src/options/SnapOptions.ts#L76) · [LinuxTargetHelper.ts](packages/app-builder-lib/src/targets/LinuxTargetHelper.ts#L149)

The top-level `snap` key is deprecated; users must use `snapcraft` with an explicit `base` field.

**v27 action:**
1. Remove the `snap` field from `Configuration` in `configuration.ts`.
2. Delete the `SnapOptions` (flat/legacy) interface export — keep `SnapOptions24`, `SnapOptionsLegacy`, `SnapOptionsCustom` only as internal types under `SnapcraftOptions`.
3. Remove the runtime migration/warning in `LinuxTargetHelper.ts`.
4. Update schema JSON if any.

---

## Group C — `@deprecated` JSDoc — Remove Fields

These are typed `@deprecated` in interfaces. Remove the fields and all code paths that reference them.

### C1. `UpdateInfo.path` and `UpdateInfo.sha512` (legacy download descriptor fields)

[updateInfo.ts](packages/builder-util-runtime/src/updateInfo.ts#L51) lines 51, 54

```ts
/** @deprecated */
readonly path: string
/** @deprecated */
readonly sha512: string
```

These were per-file path/hash fields replaced by the `files[]` array. Search for all consumers before removing to ensure nothing still reads them as a fallback.

**v27 action:** Remove both fields from `UpdateInfo`. Audit `electron-updater` download code for any `updateInfo.path` / `updateInfo.sha512` fallback reads and remove those too.

### C2. `WindowsUpdateInfo.sha2`

[updateInfo.ts](packages/builder-util-runtime/src/updateInfo.ts#L88)

Legacy SHA-2 hash field predating `sha512`. No consumer should still need it.

**v27 action:** Remove `sha2` from `WindowsUpdateInfo`.

### C3. `UpdateCheckResult.versionInfo`

[types.ts](packages/electron-updater/src/types.ts#L66)

```ts
/** @deprecated */
readonly versionInfo: UpdateInfo
```

Aliased `updateInfo`. Check whether any downstream code still accesses `.versionInfo` and update it to `.updateInfo`.

**v27 action:** Remove `versionInfo` field. Update callers.

### C4. `GithubOptions.vPrefixedTagName` → `tagNamePrefix`

[publishOptions.ts](packages/builder-util-runtime/src/publishOptions.ts#L101)

```ts
/** @deprecated please use #tagNamePrefix instead. */
readonly vPrefixedTagName?: boolean
```

The shim logic at line 155–158 converts `vPrefixedTagName` into a `tagNamePrefix` value at runtime.

**v27 action:** Remove `vPrefixedTagName` from both `GithubOptions` and `BintrayOptions` (line 196). Remove the compatibility shim in `getTagNamePrefix()`.

### C5. `nodeVersion` / `launchUiVersion` / `framework` (libui/proton)

[configuration.ts](packages/app-builder-lib/src/configuration.ts#L290)

Already annotated as having no effect when using Electron. The framework values `"proton"` and `"libui"` are dead paths.

**v27 action:** Remove `nodeVersion`, `launchUiVersion`, and `framework` from `Configuration`. Remove any code that branches on `framework !== "electron"`.

---

## Group D — Default Value Changes

### D1. DMG `filesystem` default: `HFS+` → `APFS`

[macOptions.ts](packages/app-builder-lib/src/options/macOptions.ts#L312)

The property comment already says: _"This will be changed to APFS in the next major release."_

**v27 action:** Change the default from `"HFS+"` to `"APFS"` in the DMG target code. Update docs/schema.

---

## Group E — Legacy Code Cleanup (lower priority)

These are not blocking but worth cleaning up in v27.

| Item | File | Action |
|------|------|--------|
| `CI_BUILD_TAG` env var fallback | [publisher.ts](packages/electron-publish/src/publisher.ts#L53) | Remove the `CI_BUILD_TAG` fallback; GitLab now uses `CI_COMMIT_TAG` exclusively |
| `noMsi` Squirrel option | [SquirrelWindowsTarget.ts](packages/electron-builder-squirrel-windows/src/SquirrelWindowsTarget.ts#L317) | Remove option + warn path; `"msi": true` is already the replacement |
| FPM template `<%= varName %>` syntax warning | [FpmTarget.ts](packages/app-builder-lib/src/targets/FpmTarget.ts#L439) | Remove ERB-style template support entirely |
| `helper-bundle-id` in build metadata | [electronMac.ts](packages/app-builder-lib/src/electron/electronMac.ts#L105) | Remove compat read; require `build.mac.helperBundleId` |
| `electronDownload` (legacy) option | [configuration.ts](packages/app-builder-lib/src/configuration.ts#L263) | Evaluate removal vs. keeping as pass-through to `@electron/get` |
| Wine TODO workaround | [NsisTarget.ts](packages/app-builder-lib/src/targets/nsis/NsisTarget.ts#L429) | Remove macOS Catalina Wine workaround once Wine 11 toolset is default |
| Toolset version `"0.0.0"` (appimage, nsis, wine) | [configuration.ts](packages/app-builder-lib/src/configuration.ts#L355) | Consider removing `"0.0.0"` as a valid/accepted legacy toolset version |

---

## Suggested Work Order

```
1. Group A  — pure dead-code deletion, no behavior change, safe to batch
2. Group D1 — DMG default flip (single-line change, high user impact, document in changelog)
3. Group C4 — vPrefixedTagName removal (small shim, contained to publishOptions)
4. Group C3 — versionInfo removal (grep updater for callers first)
5. Group C1/C2 — UpdateInfo field removal (grep download code for fallback reads)
6. Group C5 — libui/proton framework removal (grep for framework !== "electron" branches)
7. Group B1 — implicit publish removal (high user impact, needs prominent changelog entry)
8. Group B2 — snap removal (high user impact, needs migration guide)
9. Group E  — as bandwidth allows, in any order
```

---

## Breaking Change Changelog Notes (draft)

- **Implicit `--publish`**: Removed. Builds no longer auto-publish based on npm lifecycle events, git tags, or CI env vars. Pass `--publish always|onTag|onTagOrDraft` explicitly.
- **`snap` config key**: Removed. Use `snapcraft` with an explicit `base` field (`core18` | `core20` | `core22` | `core24`).
- **DMG `filesystem` default**: Changed from `HFS+` to `APFS`. Set `dmg.filesystem: "HFS+"` explicitly to preserve old behavior.
- **`GithubOptions.vPrefixedTagName`**: Removed. Use `tagNamePrefix` (e.g., `"v"` or `""`).
- **`UpdateCheckResult.versionInfo`**: Removed. Use `.updateInfo`.
- **`UpdateInfo.path` / `UpdateInfo.sha512` / `WindowsUpdateInfo.sha2`**: Removed.
- **`framework`, `nodeVersion`, `launchUiVersion`**: Removed. Only Electron is supported.
- **`noMsi` (Squirrel)**: Removed. Use `"msi": true`.
- **`devMetadata`, `extraMetadata`, `--em.build`, `--em.directories`** in PackagerOptions: Already threw errors — option types removed from public API.
