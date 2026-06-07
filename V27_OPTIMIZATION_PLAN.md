# V27 Optimization & Technical Debt Reduction Plan

> **Scope**: Findings NOT covered in `migration-plan.md` (info visibility, `platformSpecificBuildOptions`, dep slim-down, v27 deprecation cleanup, MsiTarget mutation bug) or `V27_DEPRECATION_PLAN.md` (Groups A–E). All items below are net-new opportunities.
>
> **Goals**: Reduce cyclomatic complexity, improve type safety, modernize Node.js API usage, and ensure a clean exit from alpha once v27-alpha ships.

---

## Section A — Type Safety Hardening

### A1. Enable ESLint Unsafe Rules Incrementally

**File:** [eslint.config.mjs](eslint.config.mjs)

`eslint.config.mjs` currently disables 10 type-safety rules from `@typescript-eslint/recommended-requiring-type-checking`. These rules exist precisely to surface the `as any` problems described in A2–A3. Enabling them one at a time generates a finite, fixable error list.

**Rules currently `"off"` that should be enabled:**

| Rule | Impact | Suggested order |
|------|--------|-----------------|
| `@typescript-eslint/no-explicit-any` | Flags every `as any` and `: any` annotation | 1st |
| `@typescript-eslint/no-unsafe-assignment` | Flags assignment of `any` to typed variables | 2nd |
| `@typescript-eslint/no-unsafe-member-access` | Flags property reads on `any` | 3rd |
| `@typescript-eslint/no-unsafe-call` | Flags calling an `any`-typed value | 4th |
| `@typescript-eslint/no-unsafe-return` | Flags returning `any` from typed functions | 5th |
| `@typescript-eslint/no-unsafe-argument` | Flags passing `any` to typed parameters | 6th |
| `@typescript-eslint/no-non-null-assertion` | Flags `!` assertions | 7th |
| `@typescript-eslint/prefer-promise-reject-errors` | Flags `reject(nonError)` | 8th |
| `@typescript-eslint/ban-ts-comment` | Flags `@ts-ignore` without explanation | 9th |

**Strategy:** Flip each rule from `"off"` to `"warn"` first (no CI break), fix the warnings, then promote to `"error"`. One rule per PR keeps diffs manageable.

**Severity: HIGH | Effort per rule: S–M**

---

### A2. `as any` Cast Audit — 76 Instances

**Distributed across:** `packages/electron-updater/`, `packages/app-builder-lib/`

There are **76 `as any` casts** in non-test source (verified by grep). Most cluster into three fixable patterns:

#### Pattern 1 — Config key indexing (~20 instances)
```typescript
// Current (platforms, targets, etc.)
(this.config as any)[platform.buildConfigurationKey]
(this.packager.config as any)[this.name]
```
Fix: Once `getOptionsForTarget()` is in place (migration-plan.md Phase 1), the internal config indexing in `PlatformPackager.normalizePlatformSpecificBuildOptions` can use a typed helper instead of `as any`. The remaining cases in `fileMatcher.ts:320-322` and `macPackager.ts:512` should use `keyof Configuration`.

#### Pattern 2 — Deprecated field reads (~10 instances)
```typescript
// Current — reading removed/deprecated fields
(metadata as any).directories  // packageMetadata.ts:48
(metadata as any).devDependencies  // packageMetadata.ts:71
(fileInfo as any).sha2  // Provider.ts:154
(updateInfo as any).sha2  // Provider.ts:142
```
These are legacy compatibility reads. Once V27_DEPRECATION_PLAN.md Groups A and C are executed, these casts disappear with the code.

#### Pattern 3 — Structural casts that should be typed properly (~15 instances)
```typescript
// electron-updater/src/AppUpdater.ts:284
this.httpExecutor = null as any
// electron-updater/src/AppUpdater.ts:410
stagingPercentage = parseInt(stagingPercentage as any, 10)
// differentialDownloader/DifferentialDownloader.ts:312
(value / 1024).toFixed(2) as any
```
- `null as any` → type the field as `HttpExecutor | null` and handle null in callers
- `parseInt(x as any)` → `parseInt(String(x), 10)` — no cast needed
- `.toFixed(2) as any` → `.toFixed(2)` returns `string`; `Intl.NumberFormat.format()` accepts `string | number` in Node 22

#### Pattern 4 — `process.stdout.isTTY` (~1 instance)
```typescript
// packager.ts:418
if (!isCI && (process.stdout as any).isTTY) {
```
Node 22 types `process.stdout` as `WriteStream & { fd: 1 }` which includes `isTTY?: boolean`. The cast is unnecessary — remove it.

**Severity: MEDIUM | Effort: L (all patterns combined)**

---

### A3. `@ts-ignore` Cleanup — 4 Instances

**File:** [packages/app-builder-lib/src/publish/updateInfoBuilder.ts](packages/app-builder-lib/src/publish/updateInfoBuilder.ts#L175-L181)

Lines 175, 177, 179, 181 suppress errors on conditional property assignments:
```typescript
// @ts-ignore
releaseInfo.releaseName = ...
// @ts-ignore
releaseInfo.releaseDate = ...
```
These likely exist because `releaseInfo` is typed as `Readonly<ReleaseInfo>` or similar. Fix: narrow the type at the assignment site using `Partial<ReleaseInfo>` or a builder pattern, then remove the suppressions.

**Severity: LOW | Effort: XS**

---

### A4. Non-null Assertion (`!`) Review

There are 30+ non-null assertions scattered across `electron-updater`. Many are legitimate (lazy initialization patterns), but some indicate fields that should be typed `T | null` with explicit null-checks:

Key offenders:
- `AppUpdater.ts` — multiple `this.downloadedUpdateHelper!.*` calls (lazy init, but accessor could enforce initialization order)
- `DataSplitter.ts`, `DifferentialDownloader.ts` — stream state assumptions

**Recommended approach:** Add a private helper `assertInitialized()` that narrows type via control flow, removing the assertions. This matches the pattern already used elsewhere in the codebase.

**Severity: LOW | Effort: M**

---

## Section B — Node.js Modern API Adoption

### B1. Replace `url.format()` with `URL` Constructor

**File:** [packages/app-builder-lib/src/publish/PublishManager.ts:428](packages/app-builder-lib/src/publish/PublishManager.ts#L428)

```typescript
// Current — legacy url module
return url.format({ ...baseUrl, pathname: path.posix.resolve(baseUrl?.pathname || "/", encodeURI(fileName)) })

// Modern — URL API (Node 22, no import needed for global URL)
const u = new URL(baseUrl.href)
u.pathname = path.posix.resolve(u.pathname || "/", encodeURI(fileName))
return u.toString()
```

The `url` module import can then be removed. The `URL` global is available in Node 22 without an import.

**Severity: LOW | Effort: XS**

---

### B2. Replace MD5 with SHA-256 in MsiTarget Directory ID Generation

**File:** [packages/app-builder-lib/src/targets/MsiTarget.ts:231](packages/app-builder-lib/src/targets/MsiTarget.ts#L231)

```typescript
// Current — MD5 is non-cryptographic here, but signals a code smell
directoryId = "d" + createHash("md5").update(dirName).digest("base64")...

// Better — SHA-256 prefix (first 8 bytes of hex is sufficient for a stable ID)
directoryId = "d" + createHash("sha256").update(dirName).digest("hex").slice(0, 16)
```

MD5 is not broken for this purpose (deterministic directory ID), but replacing it avoids future friction if FIPS-compliant builds are required. SHA-256 is available in the same `crypto` import.

**Severity: LOW | Effort: XS**

---

### B3. Replace `new Promise(r => setTimeout(r, N))` with `timers/promises`

**Affected files (8 instances):**

| File | Line | Delay |
|------|------|-------|
| [NsisTarget.ts](packages/app-builder-lib/src/targets/nsis/NsisTarget.ts#L442) | 442 | 300ms |
| [NsisTarget.ts](packages/app-builder-lib/src/targets/nsis/NsisTarget.ts#L839) | 839 | 2000ms |
| [electronGet.ts](packages/app-builder-lib/src/util/electronGet.ts#L201) | 201 | 300ms * N |
| [snapcraftBuilder.ts](packages/app-builder-lib/src/targets/snap/snapcraftBuilder.ts#L154) | 154 | retryDelay |
| [dmgUtil.ts](packages/dmg-builder/src/dmgUtil.ts#L94) | 94 | 3000ms |
| [httpExecutor.ts](packages/builder-util-runtime/src/httpExecutor.ts#L434) | 434 | 1000ms * N |
| [retry.ts](packages/builder-util-runtime/src/retry.ts#L12) | 12 | interval |
| [DifferentialDownloader.ts](packages/electron-updater/src/differentialDownloader/DifferentialDownloader.ts) | multiple | various |

Node 22 ships `timers/promises` with `setTimeout` as a named export:

```typescript
import { setTimeout as sleep } from "timers/promises"

// Replaces: await new Promise(resolve => setTimeout(resolve, 300))
await sleep(300)
```

**Recommendation:** Add a single `sleep` re-export to `builder-util-runtime` (or `builder-util`) and replace all 8 call sites. This reduces boilerplate, eliminates `new Promise` wrappers, and makes intent clear.

**Severity: LOW | Effort: S (centralize + replace all)**

---

### B4. Replace Sequential Promise `reduce` with `for…of await`

**File:** [packages/app-builder-lib/src/codeSign/macCodeSign.ts:192](packages/app-builder-lib/src/codeSign/macCodeSign.ts#L192)

```typescript
// Current — promise-chaining reduce (hard to read, hard to debug)
securityCommands.reduce(
  (promise, cmd) => promise.then(() => exec("/usr/bin/security", cmd)),
  new Promise(resolve => resolve(null))
)

// Modern — simple, readable, debuggable
for (const cmd of securityCommands) {
  await exec("/usr/bin/security", cmd)
}
```

The `reduce` pattern predates `async/await`. It has the same sequential semantics but is opaque and prevents proper stack traces on rejection.

**Severity: LOW | Effort: XS**

---

### B5. Adopt `Error.cause` in `builder-util`

**File:** [packages/builder-util/src/util.ts:192](packages/builder-util/src/util.ts#L192)

```typescript
// TODO: switch to ECMA Script 2026 Error class with `cause` property to return stack trace
```

This TODO is already actionable — `Error.cause` was introduced in **Node.js 16.9** and is fully stable in Node 22. The project's `engines` field requires `>=22.12.0`, so there are no compatibility constraints.

```typescript
// Before
throw new Error(`spawn error: ${stderr}`)

// After
throw new Error(`spawn error: ${stderr}`, { cause: originalError })
```

Wrapping errors with `cause` preserves the original stack trace, which dramatically improves debugging of child-process failures.

**Severity: MEDIUM | Effort: S**

---

### B6. Replace `.pipe()` with `stream.pipeline()` in Differential Downloader

**Affected files (electron-updater differential download stack):**

| File | Location |
|------|----------|
| [DownloadedUpdateHelper.ts:177](packages/electron-updater/src/DownloadedUpdateHelper.ts#L177) | hash pipe |
| [DataSplitter.ts:32](packages/electron-updater/src/differentialDownloader/DataSplitter.ts#L32) | readStream pipe |
| [DifferentialDownloader.ts:183](packages/electron-updater/src/differentialDownloader/DifferentialDownloader.ts#L183) | stream chain |
| [DifferentialDownloader.ts:243](packages/electron-updater/src/differentialDownloader/DifferentialDownloader.ts#L243) | response pipe |
| [multipleRangeDownloader.ts:80](packages/electron-updater/src/differentialDownloader/multipleRangeDownloader.ts#L80) | response pipe |

`stream.pipe()` does not propagate errors between stream stages. An error in a downstream transform is silently swallowed unless each stage has an explicit `on('error')` handler. The `stream/promises.pipeline()` function (Node.js 15+) handles this correctly:

```typescript
import { pipeline } from "stream/promises"

// Replaces: readStream.pipe(out, { end: false })
await pipeline(readStream, out, { end: false })
```

This is particularly critical in the differential downloader, where a mid-download error could produce a corrupt update file. The `DataSplitter.ts` and `DifferentialDownloader.ts` files already have per-stream `on('error')` handlers as a workaround — `pipeline()` makes those unnecessary.

**Note:** Some pipes here use `{ end: false }` (don't close the destination on stream end) — `pipeline()` supports this via the `signal`/options argument; care is needed to preserve the non-ending behavior where required.

**Severity: MEDIUM | Effort: M**

---

## Section C — Architecture & Cyclomatic Complexity

### C1. `autoUpdater` Proxy Pattern → Typed Platform Factory

**File:** [packages/electron-updater/src/index.ts](packages/electron-updater/src/index.ts)

The `autoUpdater` export is a `Proxy` over a lazily initialized `AppUpdater`. The proxy intercepts property access to forward to the real updater, which is determined at first access by calling `doLoadAutoUpdater()`. This pattern has several problems:

1. **Proxy traps are untyped** — `get` and `set` traps use `(prop: string | symbol)` with `as any` casts throughout.
2. **Not tree-shakeable** — bundlers cannot determine which updater class is used at build time.
3. **Error messages are confusing** — proxy interception hides the real class in stack traces.
4. **`doLoadAutoUpdater()` uses sync `require()`** — necessary today because the proxy must behave synchronously, but this prevents using `import()`.

**Proposed alternative:** Export `autoUpdater` as a getter using `Object.defineProperty` with a lazy initializer, retaining sync semantics but removing the Proxy:

```typescript
let _autoUpdater: AppUpdater | undefined

export const getAutoUpdater = (): AppUpdater => {
  if (!_autoUpdater) {
    _autoUpdater = doLoadAutoUpdater()
  }
  return _autoUpdater
}

// For backwards compat, keep the property accessor:
// Object.defineProperty(exports, "autoUpdater", { get: getAutoUpdater })
```

Alternatively, if the sync constraint can be lifted (it likely can in the ESM world since `electron-updater` is loaded asynchronously by Electron), convert to top-level `await import()` with platform branching — this is the cleanest ESM-native solution.

**Severity: MEDIUM | Effort: M**

---

### C2. Replace `async-exit-hook` with Native `process` Events

**File:** [packages/app-builder-lib/src/vm/ParallelsVm.ts:85](packages/app-builder-lib/src/vm/ParallelsVm.ts#L85)

```typescript
require("async-exit-hook")((callback: (() => void) | null) => { ... })
```

`async-exit-hook` is a dependency that wraps `process.on('exit')` / `process.on('SIGTERM')` etc. to support async cleanup. Node 22 supports `process.on('beforeExit', async () => {...})` for async cleanup. For the specific use case in `ParallelsVm` (stop the VM on exit), this can be replaced with:

```typescript
process.once("beforeExit", async () => { await this.stop() })
process.once("SIGTERM", async () => { await this.stop(); process.exit(0) })
process.once("SIGINT",  async () => { await this.stop(); process.exit(0) })
```

This removes one runtime dependency and eliminates a `createRequire` call. Check [migration-plan.md Dependency Slim-Down] to see if `async-exit-hook` is already on the removal list — if not, add it.

**Severity: LOW | Effort: XS**

---

### C3. Remove `experimentalDecorators` from tsconfig (Dead Config)

**File:** [tsconfig-base.json](tsconfig-base.json)

```json
"useDefineForClassFields": false,
"experimentalDecorators": true,
```

Searching the entire `packages/` directory reveals **zero usage of TypeScript decorator syntax** (`@Something` on a class/method/property). These two flags exist as legacy configuration from when the project may have used class decorators.

- `experimentalDecorators: true` enables Stage 2 (legacy) decorators. TypeScript 5.x uses native Stage 3 decorators by default when this flag is absent.
- `useDefineForClassFields: false` changes class field semantics to use `Object.defineProperty` instead of assignment — needed for Stage 2 decorators but not for modern code.

**Action:** Remove both flags from `tsconfig-base.json`. If either causes a compile error, that is a signal of actual decorator usage that should be surfaced and reviewed.

**Severity: MEDIUM | Effort: XS**

---

### C4. Reduce Cyclomatic Complexity in `NsisTarget.configureDefines()`

**File:** [packages/app-builder-lib/src/targets/nsis/NsisTarget.ts](packages/app-builder-lib/src/targets/nsis/NsisTarget.ts) — estimated lines 478–582

`configureDefines()` (~104 lines) has an estimated cyclomatic complexity of 14–16. It reads dozens of NSIS installer options and conditionally writes `defines` entries. The function's shape is:

```typescript
// Repeated ~15 times:
if (options.X) {
  defines.SOME_DEFINE = ...
}
```

**Refactor opportunity:** Extract a `setDefine(key, value, condition?)` helper and a declarative options-to-defines map:

```typescript
const DEFINE_MAP: Array<[keyof NsisOptions, string, ((v: any) => string)?]> = [
  ["oneClick",       "ONE_CLICK"],
  ["perMachine",     "ALL_USERS"],
  ["allowElevation", "ALLOW_ELEVATION"],
  // ...
]
for (const [optKey, defineKey, transform] of DEFINE_MAP) {
  const v = options[optKey]
  if (v !== undefined && v !== null) {
    defines[defineKey] = transform ? transform(v) : v
  }
}
```

This reduces the function to ~20 lines + the declarative table, cuts CC from ~15 to ~3, and makes it easy to add new NSIS options.

**Severity: MEDIUM | Effort: M**

---

### C5. Reduce Cyclomatic Complexity in `NsisTarget.buildInstaller()`

**File:** [packages/app-builder-lib/src/targets/nsis/NsisTarget.ts](packages/app-builder-lib/src/targets/nsis/NsisTarget.ts) — lines 170–386 (~216 lines)

`buildInstaller()` orchestrates the full NSIS build: resolves arches, merges scripting, generates installers. Estimated CC: 15–18.

Key extraction opportunities:
1. **Lines 190–220** — arch resolution + per-arch packaging → extract to `resolveInstallerArches(): Promise<Map<Arch, string>>`
2. **Lines 240–280** — NSIS script file discovery + merge → extract to `buildScriptArgs(): Promise<string[]>`
3. **Lines 300–340** — `defines` construction → already partially extracted via `configureDefines()` (see C4 above); the remaining ad-hoc additions should move there

After extraction, `buildInstaller()` should be < 60 lines with CC < 6.

**Severity: MEDIUM | Effort: M**

---

### C6. Reduce Cyclomatic Complexity in `Packager.build()`

**File:** [packages/app-builder-lib/src/packager.ts](packages/app-builder-lib/src/packager.ts) — 685 lines total

`Packager.build()` handles platform dispatch, signing orchestration, and artifact collection. The method chains platform checks, arch iteration, and packaging steps inline.

Key extraction opportunities:
1. **Framework initialization block** — the `if (framework === "proton" || framework === "proton-native") {...}` dispatch in `resolveFramework()` (lines 60–80) collapses entirely once ProtonFramework/LibUiFramework are removed per V27_DEPRECATION_PLAN.md C5.
2. **Platform-loop body** — the inner platform iteration that spawns packagers and collects artifacts should be extracted to `buildPlatform(platform, arch): Promise<void>`.
3. **CI/TTY banner printing** — lines 415–430 (the update-notifier + TTY check block) should be its own method `printBuildStartBanner()`.

**Severity: MEDIUM | Effort: M**

---

### C7. `AppUpdater.doDownloadUpdate()` Complexity

**File:** [packages/electron-updater/src/AppUpdater.ts](packages/electron-updater/src/AppUpdater.ts) — 949 lines total

`doDownloadUpdate()` combines: download decision (cached vs fresh), differential download eligibility check, progress reporting, and post-download verification. Estimated CC: 12–15.

Extraction opportunities:
1. **Differential eligibility check** (~20 lines) → `canUseDifferentialUpdate(fileInfo): boolean`
2. **Cached download check** (~15 lines) → `tryLoadFromCache(fileInfo): Promise<string | null>`
3. **Download + verify flow** → already delegates to `downloadUpdateAndInstall()`, but the branching before that call is dense

**Severity: MEDIUM | Effort: M**

---

## Section D — Logging Discipline

### D1. Replace `console.*` with Logger Abstraction in Production Code

There are **13 `console.*` calls** in non-test production source. The codebase has a proper logger (`log` from `builder-util`, `this._logger` in `AppUpdater`). Console calls bypass log level filtering, cannot be silenced in tests, and don't respect the structured log format.

**Instances to migrate:**

| File | Line | Call | Replacement |
|------|------|------|-------------|
| [electron-updater/src/types.ts:49](packages/electron-updater/src/types.ts#L49) | 49 | `console.log("%s %s", event, args)` | `this._logger.debug(...)` |
| [electron-updater/src/index.ts:57](packages/electron-updater/src/index.ts#L57) | 57 | `console.warn(...)` | `_autoUpdater._logger.warn(...)` after init |
| [electron-updater/src/differentialDownloader/DataSplitter.ts:77](packages/electron-updater/src/differentialDownloader/DataSplitter.ts#L77) | 77 | `console.error(...)` | logger.error |
| [electron-updater/src/differentialDownloader/DifferentialDownloader.ts:110](packages/electron-updater/src/differentialDownloader/DifferentialDownloader.ts#L110) | 110 | `console.error(errorOnLog)` | logger.error |
| [app-builder-lib/src/node-module-collector/hoist.ts:206](packages/app-builder-lib/src/node-module-collector/hoist.ts#L206) | 206 | `console.log(perf)` | `log.debug(...)` |
| [app-builder-lib/src/node-module-collector/hoist.ts:218](packages/app-builder-lib/src/node-module-collector/hoist.ts#L218) | 218 | `console.log(dumpDepTree)` | `log.debug(...)` |
| [app-builder-lib/src/util/timer.ts:18](packages/app-builder-lib/src/util/timer.ts#L18) | 18 | `console.info(label, elapsed)` | `log.info(...)` |
| [app-builder-lib/src/asar/asarUtil.ts:76-85](packages/app-builder-lib/src/asar/asarUtil.ts#L76) | 76–85 | `console.log` monkey-patch | Intercept via logger stream instead |

**Note on `hoist.ts`:** This file is a vendor copy from `@yarnpkg/nm` (see Section G1) and is excluded from ESLint. Its console calls cannot use `log` from `builder-util` without modifying the vendor API. The correct fix is to pass a `log` callback via the `options.debugLevel` parameter.

**Note on `asar/asarUtil.ts`:** The monkey-patch of `console.log` (saving and restoring the original) is fragile. Replace with a dedicated output-capture mechanism.

**Severity: MEDIUM | Effort: S**

---

## Section E — Build Tooling & ESLint Config Alignment

### E1. Modernize ESLint Flat Config — Remove `FlatCompat` Layer

**File:** [eslint.config.mjs](eslint.config.mjs)

The current ESLint config uses `FlatCompat` to adapt legacy `eslintrc` plugin extends:
```javascript
const compat = new FlatCompat({ ... })
...compat.extends("plugin:@typescript-eslint/recommended", ...)
```

`@eslint/eslintrc` (which provides `FlatCompat`) is a bridge for migrating to flat config. All three extended configs — `eslint:recommended`, `@typescript-eslint/recommended`, and `@typescript-eslint/recommended-requiring-type-checking` — now ship native flat config variants:

```javascript
// Modern — no FlatCompat needed
import tseslint from "typescript-eslint"

export default tseslint.config(
  tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { project: [...] } } }
)
```

This eliminates `@eslint/eslintrc`, `@eslint/js` (used only for the compat shim), and `@typescript-eslint/eslint-plugin` as a separate import — `typescript-eslint` re-exports everything.

**Severity: LOW | Effort: S**

---

### E2. Add `eslint-plugin-n` for Node.js-Specific Lint Rules

With Node.js >=22 as the hard requirement, `eslint-plugin-n` (successor to `eslint-plugin-node`) can enforce:

- `n/no-deprecated-api` — flags deprecated Node APIs (catches B1–B2 class of issues automatically)
- `n/prefer-promises/fs` — prefers `fs.promises.*` over callback `fs.*`
- `n/prefer-promises/dns` / `n/prefer-promises/readline`
- `n/no-process-exit` — flags `process.exit()` outside CLI entry points (flags the `builder-util/src/promise.ts:5` call)

**Severity: LOW | Effort: S**

---

### E3. `moduleResolution: "bundler"` vs `@tsconfig/node22`

**File:** [tsconfig-base.json](tsconfig-base.json)

The base tsconfig overrides `moduleResolution` to `"bundler"` while `@tsconfig/node22` sets `"node16"`. This matters:

- `"bundler"` allows bare specifiers without extensions (convenient for authoring) but relies on the bundler to resolve `.js` → `.ts`.
- `"node16"` / `"node22"` requires explicit `.js` extensions on relative imports and validates ESM resolution rules at compile time.

Since the packages ship as native ESM (all `"type": "module"` + `.js` imports in the built output), `"node22"` is the more correct setting for build validation. It would catch resolution errors at compile time rather than at runtime in the user's project.

**Action:** Change `moduleResolution` from `"bundler"` to `"node22"` in `tsconfig-base.json` and run `pnpm compile` to surface any extension-missing import errors that currently only fail at runtime.

**Severity: MEDIUM | Effort: S (change) + M (fix errors)**

---

## Section F — Public API Documentation

### F1. Add JSDoc to All Exported Types

**Files:** `packages/*/src/index.ts` and all referenced types

The public API has moderate JSDoc coverage. Types without any JSDoc (verified by scanning exported interfaces and classes):

- `AfterPackContext` — hook callback type used by all users; has no description
- `BeforePackContext` — same
- `ArtifactBuildStarted`, `ArtifactCreated` — event types emitted for every artifact
- `BuildResult` — returned by `build()`; `artifactPaths` is undocumented
- `ForgeOptions` — used by electron-forge integration; minimal docs
- Most `*Options` interfaces in `packages/app-builder-lib/src/options/` have field-level `@description` comments (good) but no class-level summary

**Priority:** Hook context types (`AfterPackContext`, `BeforePackContext`) and `BuildResult` are what external users interact with first. Document these before the v27 stable release.

**Severity: LOW | Effort: M**

---

### F2. Audit `SnapOptions` Export Complexity

**File:** [packages/app-builder-lib/src/options/SnapOptions.ts](packages/app-builder-lib/src/options/SnapOptions.ts)

Per V27_DEPRECATION_PLAN.md Group B2, the `snap` key is being removed in favor of `snapcraft`. The `SnapOptions.ts` file currently exports multiple overlapping types:
- `SnapOptions` (legacy flat format)
- `SnapOptions24`
- `SnapOptionsLegacy`
- `SnapOptionsCustom`
- `SnapcraftOptions`

Post-deprecation, there should be a single canonical `SnapcraftOptions` export. The index.ts still exports `SnapOptions` — clean up the export surface after Group B2 is complete.

**Severity: LOW | Effort: XS (post-B2 cleanup)**

---

## Section G — Vendor Code Maintenance

### G1. Sync `hoist.ts` with Upstream `@yarnpkg/nm`

**File:** [packages/app-builder-lib/src/node-module-collector/hoist.ts](packages/app-builder-lib/src/node-module-collector/hoist.ts)

This 1,141-line file is an inlined copy of `@yarnpkg/nm/src/hoist.ts` from the [yarnpkg/berry](https://github.com/yarnpkg/berry) monorepo. The copyright header is present but there is no mechanism to detect when it drifts from upstream.

**Risks:**
- Upstream bug fixes in yarn's hoisting algorithm don't flow in automatically
- The file is excluded from ESLint (`hoist.ts` in ignores list), so regressions aren't caught
- There is a known performance debug call (`console.log` at lines 206, 218) that exists in the vendor copy and is not appropriate for production use (see D1)

**Recommendations:**
1. Add a comment at the top pinning the exact upstream commit SHA that was copied
2. Set up a periodic dependency audit (GH Actions schedule or Renovate custom rule) to detect when the upstream file changes
3. Consider switching to `require("@yarnpkg/nm").hoist` as a proper dependency — this eliminates the vendor copy entirely. Check if `@yarnpkg/nm` ships a usable public API.

**Severity: LOW | Effort: S–M**

---

## Section H — `electron-updater` Architecture

### H1. `doLoadAutoUpdater()` — Synchronous `require()` Blocks Tree-Shaking

**File:** [packages/electron-updater/src/index.ts:28–55](packages/electron-updater/src/index.ts#L28)

The `doLoadAutoUpdater()` function selects the correct updater class at runtime using synchronous `require()`:

```typescript
if (process.platform === "win32") {
  updater = new (require("./NsisUpdater.js").NsisUpdater)()
} else if (process.platform === "darwin") {
  updater = new (require("./MacUpdater.js").MacUpdater)()
} ...
```

Because the platform checks are runtime values, bundlers cannot statically determine which updater to include — they must bundle **all** updaters. For an Electron app, this means Windows apps ship `MacUpdater.ts` and Linux apps ship `NsisUpdater.ts`.

**Alternative:** Expose named platform-specific exports and document that users should import the correct one directly:

```typescript
// Explicit — tree-shakeable, no runtime overhead
import { NsisUpdater } from "electron-updater"
export const autoUpdater = new NsisUpdater()
```

The `autoUpdater` export can remain as a convenience, but document that it bundles all platforms. The Electron Forge / Vite ecosystem already encourages explicit imports.

**Severity: LOW | Effort: M (documentation-heavy, low code change)**

---

### H2. `GenericProvider` — Inline `new Promise` Wrapper for Stream Drain

**File:** [packages/electron-updater/src/providers/GenericProvider.ts:35](packages/electron-updater/src/providers/GenericProvider.ts#L35)

```typescript
await new Promise((resolve, reject) => { ... })
```

This wraps a stream drain operation. Once B6 (pipeline migration) is in place, this specific pattern may be replaceable with `stream/promises.pipeline()`.

**Severity: LOW | Effort: XS**

---

## Section I — Testing Infrastructure

### I1. Remove Wine Workaround TODO Once Wine 11 is Default

**File:** [packages/app-builder-lib/src/targets/nsis/NsisTarget.ts:429](packages/app-builder-lib/src/targets/nsis/NsisTarget.ts#L429)

```typescript
// TODO: remove workaround when wine is fully upgraded to 11
```

Track the docker image version in [docker/](docker/) to determine when Wine 11 is the default. Once confirmed, remove the workaround and delete the TODO.

**Severity: LOW | Effort: XS (when docker image is updated)**

---

### I2. Add `eslint-plugin-vitest` to Enforce Test Best Practices

The test suite uses Vitest 3.2.2 but there is no ESLint plugin enforcing Vitest-specific rules. `eslint-plugin-vitest` catches:

- `vitest/no-identical-title` — duplicate describe/it blocks
- `vitest/no-disabled-tests` — forgotten `.skip` tests
- `vitest/prefer-to-be` — cleaner assertions
- `vitest/valid-expect` — catches async expect without await

**Severity: LOW | Effort: S**

---

### I3. `windowsSignAzureManager.ts` Publisher Name TODO

**File:** [packages/app-builder-lib/src/codeSign/windowsSignAzureManager.ts:21](packages/app-builder-lib/src/codeSign/windowsSignAzureManager.ts#L21)

```typescript
// TODO: Is there another way to automatically pull Publisher Name from AzureTrusted service?
```

The Azure Trusted Signing API (`https://codesigning.azure.net`) exposes a `GET /codesigningaccounts/{accountName}/certificateprofiles/{profileName}` endpoint that returns publisher details. This could auto-populate the publisher name. Worth exploring for v27 to reduce user configuration surface.

**Severity: LOW | Effort: M (requires API research)**

---

## Priority Matrix

| ID | Title | Severity | Effort | Alpha Exit Blocker |
|----|-------|----------|--------|--------------------|
| A1 | Enable ESLint unsafe rules | HIGH | S/rule | No |
| A2 | `as any` cast reduction | MEDIUM | L | No |
| B5 | `Error.cause` adoption | MEDIUM | S | No |
| B6 | `.pipe()` → `pipeline()` | MEDIUM | M | **Yes — data corruption risk** |
| C1 | autoUpdater Proxy cleanup | MEDIUM | M | No |
| C3 | Remove dead `experimentalDecorators` | MEDIUM | XS | No |
| D1 | console.* → logger | MEDIUM | S | No |
| E3 | `moduleResolution: "node22"` | MEDIUM | S+M | No |
| B3 | `sleep` utility from `timers/promises` | LOW | S | No |
| B4 | Sequential reduce → `for…of` | LOW | XS | No |
| C4 | NsisTarget `configureDefines` refactor | MEDIUM | M | No |
| C5 | NsisTarget `buildInstaller` refactor | MEDIUM | M | No |
| C6 | `Packager.build()` extraction | MEDIUM | M | No |
| C7 | `AppUpdater.doDownloadUpdate()` refactor | MEDIUM | M | No |
| A3 | `@ts-ignore` cleanup | LOW | XS | No |
| B1 | `url.format()` → `URL` | LOW | XS | No |
| B2 | MD5 → SHA-256 | LOW | XS | No |
| C2 | `async-exit-hook` → native | LOW | XS | No |
| E1 | ESLint flat config modernization | LOW | S | No |
| E2 | Add `eslint-plugin-n` | LOW | S | No |
| F1 | JSDoc for public types | LOW | M | No |
| G1 | Sync `hoist.ts` with upstream | LOW | S–M | No |
| H1 | Tree-shaking for updater imports | LOW | M | No |
| I2 | Add `eslint-plugin-vitest` | LOW | S | No |

---

## Suggested Execution Order for Alpha Exit

```
Sprint 1 (alpha → beta gate):
  [B6] pipeline() migration — prevents silent corrupt updates
  [D1] console.* → logger — required for clean beta logging
  [C3] Remove experimentalDecorators — zero-risk, unblocks tsconfig cleanup

Sprint 2 (beta quality):
  [A1] Enable ESLint rules (one per PR, warn first) — surfaces type issues
  [B5] Error.cause adoption — improves debugging of all child-process failures
  [E3] moduleResolution: node22 — compile-time ESM resolution validation
  [B3] sleep utility — small, high-leverage cleanup

Sprint 3 (beta → stable gate):
  [A2] as any audit — systematic type tightening
  [C4+C5] NsisTarget complexity — tested Windows critical path
  [C7] AppUpdater complexity — tested cross-platform critical path

Sprint 4 (stable polish):
  [F1] JSDoc — required for stable public API
  [G1] hoist.ts upstream sync
  [C1] autoUpdater factory refactor
  [E1+E2] ESLint modernization
```
