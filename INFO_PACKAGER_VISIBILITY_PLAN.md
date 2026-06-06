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
