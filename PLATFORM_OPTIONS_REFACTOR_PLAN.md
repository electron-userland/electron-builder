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
