# Plan: v27 upgrade guardrails — make every breaking change self-announcing

**Goal.** A user upgrades v26 → v27 without reading `website/docs/migration/v27-breaking-changes.md`. Today, a large share of the breaking changes either say nothing at all or fail with a message that names the problem but not the fix. This plan specifies the code changes that make every v27 breaking change announce itself at build/run time — `log.warn`, or `log.error` + `throw new InvalidConfigurationError(...)`.

**Status.** Audit complete, no code written yet. 133 findings, each adversarially re-verified against the source (126 confirmed, 6 label-corrected, 1 refuted and dropped). Every file/line reference below was read.

---

## 1. Headline verdict

Three things are true at once, and only the first is widely understood:

1. **Removed *config keys* already fail loudly** — `scheme.json` carries `additionalProperties: false` in 66 places, so `mac.identity`, `win.signtoolOptions`, `asarUnpack` etc. abort the build. The message is generic (`configuration.mac has an unknown property 'identity'`) and never names the replacement, but nobody ships a broken artifact because of it. **This is the safe majority.**

2. **Everything *outside* the validated `Configuration` object is completely silent** — environment variables, `PackagerOptions`, `package.json` root keys, CLI publish policy, `electron-updater`'s runtime API, and a dozen changed defaults. 46 findings are `none-silent`. These are the ones that ship wrong artifacts. **This is where the work is.**

3. **The doc and the code disagree in both directions.** The doc describes guards that do not exist (`asar: true` "no longer valid" — it is valid at all three layers), and the code contains `major`-flagged breaking changes the doc never mentions (`allowMissingDependencies` now fails builds closed).

### The five that will actually hurt people

| # | What | Why it is worse than the rest |
|---|---|---|
| 1 | `autoUpdater.autoInstallOnAppQuit = false` | Property removed with no accessor. The assignment silently no-ops, so an app that deliberately opted **out** of install-on-quit now installs on quit — the exact opposite of intent, in shipped desktop apps. |
| 2 | Linux maintainer-script EJS `<%= var %>` | `writeConfigFile` is now a plain `${var}` regex. `<%= executable %>` is copied **verbatim** into the shipped `.deb`/`.rpm` maintainer script. Build is green; every install runs a broken postinst. |
| 3 | Removed toolset env vars (11 + 3 undocumented) | Zero references remain in `packages/*/src`. A CI image setting `USE_SYSTEM_WINE` / `ELECTRON_BUILDER_NSIS_DIR` silently switches toolchain. `CI_BUILD_TAG` is worse: combined with #4, the release simply stops publishing. |
| 4 | Implicit `--publish` removed | `PublishManager` sets `isPublish = false` when no policy is passed. A tagged CI release goes green and uploads nothing. |
| 5 | `allowMissingDependencies` default flipped to fail-closed | **Undocumented.** Its own changeset is marked `major` with a migration paragraph; the breaking-changes doc mentions it zero times. Builds that previously warned now hard-fail. |

---

## 2. Severity policy

The rule applied to every finding, so the choice of `warn` vs `throw` is not ad-hoc:

- **`throw InvalidConfigurationError`** when the legacy input is *unambiguously v26* and cannot appear in a valid v27 config. For the 60 keys the schema already rejects this changes **nothing about pass/fail** — it only replaces a generic ajv line with a targeted one naming the replacement. Zero compatibility risk, which is why it is the default for WS1.
- **`warn`** when the config is still valid but its *meaning* changed, or when a v27-legitimate setup could trip the check.
- **`warn` now → `throw` in v28** for runtime APIs where a throw today would break a shipping app mid-flight (the `electron-updater` call-shape changes).
- **`doc-only`** where nothing is detectable from user input, or where the code is right and the doc is wrong.

**Never throw on something a valid v27 config can contain.** Two audit recommendations were downgraded for exactly this (`asar: true`, `SIGNTOOL_PATH`).

---

## 3. Architecture

Five mechanisms. The first two carry 77 of the 133 findings.

### 3.1 A single shared legacy-mapping table (prerequisite for everything else)

`migrate-schema.ts` already owns the authoritative v26→v27 key mapping (`MAC_SIGN_FIELDS`, `MAC_UNIVERSAL_FIELDS`, `AZURE_KNOWN_FIELDS`, `ELECTRON_DOWNLOAD_DROPPED`). The runtime guard needs the same table — but it lives in `packages/electron-builder`, which **depends on** `app-builder-lib`, so the runtime cannot import it.

**Move the table down into `app-builder-lib` and have the migrator import it up.** Confirmed direction: `electron-builder → app-builder-lib → builder-util`.

New file: `packages/app-builder-lib/src/util/config/legacyOptions.ts`

```ts
export interface LegacyOption {
  /** dot-path, `*` matches any platform key (mac|mas|masDev|win|linux) */
  readonly path: string
  readonly replacement: string | null   // null = removed with no equivalent
  readonly autoMigrated: boolean        // true => message ends with "run electron-builder migrate-schema"
  readonly severity: "error" | "warn"
  readonly detail?: string              // extra sentence, e.g. inverted polarity
  readonly anchor: string               // breaking-changes doc anchor
}
export const LEGACY_CONFIG_OPTIONS: readonly LegacyOption[] = [ /* … 60 entries … */ ]
```

`migrate-schema.ts` then derives `MAC_SIGN_FIELDS` et al. from this one table, so the migrator and the runtime guard can never drift. **This drift is not hypothetical — it has already happened once** (`gatekeeperAssess`, §6.2).

### 3.2 Pre-schema validation pass — `WS1`, 62 findings

`packages/app-builder-lib/src/util/config/config.ts`, in `validateConfiguration()` (line 228), **before** `validateSchema()` (line 229):

```ts
export async function validateConfiguration(config: Configuration, debugLogger: DebugLogger) {
  checkLegacyConfiguration(config)   // ← new; targeted message wins over generic ajv output
  validateSchema(await schemeDataPromise.value, config, { … })
}
```

Three properties that matter:

- **Runs before ajv**, so the targeted message replaces the generic one rather than competing with it.
- **Aggregates.** Collect *every* legacy key, then throw once — following the existing `checkMetadata` pattern at `packages/app-builder-lib/src/util/packageMetadata.ts:39` (`throw new InvalidConfigurationError(errors.join("\n"))`). A config with 12 legacy mac keys must not require 12 build attempts.
- **Walks platform keys.** `mac`/`mas`/`masDev`/`win`/`linux` all accept the same removed keys; the `*` path segment covers them.

Message shape:

```
electron-builder v27: `mac.identity` was moved to `mac.sign.identity`.
  Run `electron-builder migrate-schema` to update your config automatically.
  https://www.electron.build/docs/migration/v27-breaking-changes#macos-signing-macsign
```

This single hook resolves every "generic ajv" row in the appendix.

### 3.3 Centralized removed-env-var guard — `WS2`, 14 findings

`packages/app-builder-lib/src/util/flags.ts` — the file that used to read these vars and now has no trace of them:

```ts
const REMOVED_ENV_VARS: Record<string, { replacement: string; severity: "error" | "warn" }> = {
  APPIMAGE_TOOLS_PATH:  { replacement: 'toolsets.appimage: { url: "file:///…" }', severity: "error" },
  USE_SYSTEM_WINE:      { replacement: 'toolsets.wine: { url: "file:///…" }',     severity: "error" },
  CI_BUILD_TAG:         { replacement: "CI_COMMIT_TAG",                            severity: "error" },
  SIGNTOOL_PATH:        { replacement: 'toolsets.winCodeSign: { url: … }',        severity: "warn"  }, // generic name — CI images set it
  // … 14 total
}
export function checkRemovedEnvVars(): void { /* once per process */ }
```

Call it once from `Packager.build()` (`packages/app-builder-lib/src/packager.ts`, line 358, alongside `validateConfig()`) so it runs on every build regardless of entrypoint.

Three of the fourteen (`ELECTRON_BUILDER_7ZIP_PATH`, `SIGNTOOL_PATH`, `ELECTRON_BUILDER_ICONS_TOOLSET_DIR`) are **removed in code but absent from the doc's table** — they need doc rows too (§7).

### 3.4 electron-updater runtime guards — `WS3`, 8 findings

`packages/electron-updater/src/AppUpdater.ts`. These run inside a shipped app, so all three are **warn now, throw in v28**.

```ts
// after the autoInstallEvent field (line 92)
get autoInstallOnAppQuit(): boolean { … }
set autoInstallOnAppQuit(v: boolean) {
  this._logger.warn("autoInstallOnAppQuit was removed in v27 — use autoInstallEvent. " +
    `Mapping ${v} → "${v ? "onQuit" : "manual"}". This shim is removed in v28.`)
  this.autoInstallEvent = v ? "onQuit" : "manual"
}
```

- **`quitAndInstall`** — `normalizeQuitAndInstallOptions(options, legacyIsForceRunAfter)` as the first statement of `BaseUpdater.quitAndInstall` (`BaseUpdater.ts:28`) and `MacUpdater.quitAndInstall` (`MacUpdater.ts:277`). A `boolean` first argument warns and maps to `{ isSilent, isForceRunAfter }`.
- **`downloadUpdate()`** — attach a non-enumerable `Symbol.iterator` to the returned `DownloadExecutorResult` that warns and yields `[updateFile, packageFile]`. Turns `TypeError: … is not iterable` (and the silent `files[0] === undefined`) into a soft landing with a named fix.

**Scope constraint:** the Node `>=22.12` floor check from §3.5 must **not** be loaded here. `electron-updater` runs inside Electron's bundled Node, which is frequently below 22.12 on current Electron versions.

### 3.5 CLI, programmatic API & Node floor — `WS4`, 13 findings

- **Node floor.** No `process.version` check exists anywhere; only `engines`. On Node 20 a CJS consumer gets `ERR_REQUIRE_ESM`, which names neither electron-builder nor the required version. Add an explicit guard at the top of `packages/electron-builder/cli.js` **before** `import("./dist/cli/cli.js")`, plus the `app-builder-lib` programmatic entry. Builder entrypoints only.
- **Implicit `--publish`.** In `PublishManager`'s constructor (`packages/app-builder-lib/src/publish/PublishManager.ts:81-100`), when `publishOptions.publish == null` **and** `getCiTag() != null` **and** a publish config exists → `log.warn` that v27 removed implicit publishing and nothing will be uploaded without an explicit `--publish`. This is the single cheapest fix with the highest blast radius.
- **`PackagerOptions.devMetadata` / `extraMetadata`.** Split behavior confirmed live: `build({devMetadata})` throws a generic `Unknown option "devMetadata"` that names no replacement, while `new Packager({devMetadata}).build()` is **fully silent** (the key sits unread on `packager.options`). Add the check to the `Packager` constructor so both paths are covered.
- **`.info` / `.platformSpecificBuildOptions` / renamed exports** — TypeScript-only breaks; JS consumers keep working at runtime. `doc-only`.

---

## 4. Workstream sizing

| WS | Scope | Findings | Files touched | Risk |
|---|---|:---:|---|---|
| WS0 | Shared legacy table extracted to `app-builder-lib` | — | 2 | none (pure move) |
| WS1 | Pre-schema legacy-config pass | 62 | 2 new + 1 edit | **none** — 60 of 62 already fail today; only the message improves |
| WS2 | Removed env-var guard | 14 | 1 edit + 1 call site | low |
| WS3 | electron-updater runtime shims | 8 | 3 edits | low (warn-only, no behavior change) |
| WS4 | CLI / programmatic / Node floor | 13 | 4 edits | low |
| WS5 | Behavior-flip warnings | 28 | ~12 edits | low (log-only) |
| WS6 | Schema / validator repairs | 1 | 1 edit | **medium** — tightens validation that is currently a no-op (§6.1) |
| WS7 | Documentation | 6 + §7 | 1 doc | none |

---

## 5. Sequencing

```
1. WS0  Move the legacy table into app-builder-lib   → verify: migrate-schema tests still green
2. WS7  Doc corrections (§6, §7)                     → verify: doc matches code; no guard contradicts a shipped default
3. WS1  Pre-schema pass                              → verify: fixture per legacy key asserts the targeted message
4. WS2  Env-var guard                                → verify: each var set → expected warn/throw; repo's own CI sets none
5. WS4  Node floor + implicit-publish + PackagerOptions
6. WS3  electron-updater shims                       → verify: v26 call shapes warn and still behave as v26 intended
7. WS5  Behavior-flip warnings
8. WS6  Schema repairs (last — the only one that can newly fail a valid config)
```

WS7 comes second on purpose: §6 contains cases where the **doc is wrong**, and writing a guard from a wrong doc would ship the wrong guard.

---

## 6. Bugs found during the audit

These are defects in v27 as it stands, not just missing warnings.

### 6.1 `mac.sign` / `mas.sign` / `masDev.sign` is completely unvalidated

`schemeDataPromise`'s schema for `mac.sign` is `anyOf[ $ref ElectronSignOptions, {"typeof":"function"}, {"type":["null","string"]} ]`. **`typeof` is an `ajv-keywords` keyword, and `ajv-keywords` is never registered** on the `Ajv` instance in `packages/app-builder-lib/src/util/config/schemaValidator.ts:10-15`. With `strict: false`, ajv ignores the unknown keyword, so that branch matches **everything** — the whole `sign` object accepts any content.

Consequence: after a user hand-migrates or runs the migrator, a typo'd or unsupported key under `mac.sign` is accepted and silently dropped at build time. Fix: register `ajv-keywords`, or replace `{"typeof":"function"}` with a schema ajv understands. **Sequence last** — this is the one change that can newly fail a config that passes today.

### 6.2 `migrate-schema` emits a config that fails validation

`MAC_SIGN_FIELDS` (`packages/electron-builder/src/cli/migrate-schema.ts:54`) includes `"gatekeeperAssess"` and moves it to `mac.sign.gatekeeperAssess`. But `ElectronSignOptions` (`packages/app-builder-lib/src/options/macOptions.ts:32`) `Omit`s it and is `additionalProperties: false` — and `@electron/osx-sign` 2.4.0 has no such option.

So: user runs the blessed migration path → gets a config that fails the next build. It only "passes" today because of bug 6.1. The doc's `mac.sign` mapping table states the same wrong mapping. **Fix all three: the constant, the doc row, and the runtime message** (`gatekeeperAssess` was removed, not moved).

### 6.3 `github` publish errors are a 31-line wall

Root `publish` is an `anyOf` over 10 provider definitions, each `additionalProperties: false`. `filterRelevantErrors` keeps the `additionalProperties` error from **every** branch, so `{ provider: "github", owner, repo, vPrefixedTagName: false }` reports `owner` and `repo` — *valid keys* — as unknown properties, eight times over. The one actionable key is buried. Fix by discriminating on `provider` before formatting (`schemaValidator.ts`), which WS1 partly pre-empts by catching `vPrefixedTagName` first.

### 6.4 `snapcraft` without `base` says "should be null"

`base` is required, but because root `snapcraft` is `anyOf[SnapcraftOptions, {type:"null"}]`, `filterRelevantErrors` collapses to the composite parent and prints `configuration.snapcraft should be one of these: null`. The user is told to set their snapcraft config to `null`. WS1 should catch missing `base` and say so directly.

---

## 7. The doc is wrong or incomplete — fix before writing guards

### 7.1 Documented as breaking, but the code disagrees

| Doc claim | Reality | Action |
|---|---|---|
| "`asar: true` is no longer valid" (§`asar: true` sentinel + ASAR table) | Valid at **all three** layers: type is `AsarOptions \| boolean \| null` (`options/PlatformSpecificBuildOptions.ts:161`); schema is `anyOf[AsarOptions, {"type":["null","boolean"]}]` with `"default": true`; runtime does `if (result == null \|\| result === true) return {}` (`platformPackager.ts:701`). | **Correct the doc.** Do not add a guard — it would reject a value the shipped schema advertises as the default. |
| `toolsets.X: null` "still works at runtime" | Each toolset property is `anyOf[ToolsetCustom, enum]` with no `null` and `additionalProperties: false`. ajv rejects it before any runtime code runs. | Re-add `null` to the schema, **or** correct the doc. Not fixable as a warn. |
| `electronDownload.cache` has "no equivalent" | `ELECTRON_BUILDER_CACHE` is alive and is the replacement (`util/electronGet.ts:69-76`). `customDir`/`customFilename` exist in `@electron/get` v5 but are deliberately `Omit`ted. | Reword to "intentionally not exposed — use `ELECTRON_BUILDER_CACHE`". |
| "new osx-sign fields are picked up automatically" (design note) | `ElectronSignOptions` is `additionalProperties: false`; a new upstream field is rejected until the schema is regenerated. | Correct the design note. |
| `mac.sign` table maps `gatekeeperAssess` → `sign.gatekeeperAssess` | The option does not exist in osx-sign 2.x and is schema-rejected. | Change the row to "removed". |
| `disableWebInstaller` section describes an unconditional `?? true` | NSIS installers now write `resources/package-type`, and `NsisUpdater` reads it to default `disableWebInstaller` to `false` for `nsis-web` installs. The section is **wrong for new installs** and the migrator's `NSIS_WEB_ADVISORY` is now unnecessary for them. | Document the distinction between existing and go-forward installs. |

### 7.2 Breaking changes in the code, absent from the doc

Ranked by blast radius. All verified against `release/v26` @ `f4610970f` (v26.16.0) — **not** the local `v26.0.9` tag, which is too old to be a valid baseline.

1. **`allowMissingDependencies` default `true` → `false`.** New hard failure. `appFileCopier.ts:315` returns early only on `=== true`, then `:329` throws listing every unresolved production dependency. Own changeset is `app-builder-lib: major` with a "Migration:" paragraph. **Zero mentions in the doc.** Needs a full section and an index-table row.
2. **`publisherName` vs certificate-subject validation.** `codeSign/win/signtoolBaseSignManager.ts:196-202` throws on mismatch. Certificate rotation and wrong-cert CI setups now fail. Separately, electron-updater warns when `app-update.yml` has no `publisherName` and announces v28 will fail closed — the same grace-period pattern the doc documents for `disableWebInstaller`, but undocumented here.
3. **`extraFiles` / `extraResources` `to` validation.** `fileMatcher.ts:509,519` throw on an absolute `to` or a relative `to` escaping the output dir. Configs that previously copied files onto the build machine now fail. `extraFiles` appears **zero** times in the doc.
4. **Windows custom signing hook has no migration story.** v26's `WindowsConfiguration.sign` was `CustomWindowsSign | string | null`; v27 reuses the *same key* for the discriminated union, and the custom hook moved to `win.sign.sign` (`options/winOptions.ts:188`). A lone `win.sign: "./customSign.js"` passes the migrator untouched and then fails ajv. The mac path handles exactly this case deliberately (`migrateMacSigning`, `migrate-schema.ts:388-393`) — the asymmetry looks like an oversight.
5. **macOS names no longer NFD-normalized.** The doc covers only the validation half of `.changeset/mac-helper-name-consistency.md`. The other half changes on-disk bundle filename **bytes** for any accented product name — which is what notarization/upload tooling matches on. Related: `targets/archive.ts:231-234` silently falls back from 7z to zip for NFD filenames.
6. **Three removed env vars missing from the "removed" table**: `ELECTRON_BUILDER_7ZIP_PATH`, `SIGNTOOL_PATH`, `ELECTRON_BUILDER_ICONS_TOOLSET_DIR` — all present in v26.16, zero hits at HEAD. The table claims to be complete.
7. **pacman default `depends` changed** — `http-parser` dropped; new `"default"` keyword for deb/rpm/pacman `depends`. Changeset marked `major`. "pacman" appears zero times in the doc.
8. **`ElectronGetOptions` lost `force`** — same family as the documented `electronDownload` drops, unlisted.
9. **Index-table gaps** — `### New: Cloudflare R2 publish provider` and `### New command: migrate-schema` are document headings with no index row, so the "at a glance" table is not a complete index of its own document. R2 also has two hard requirements (`accountId`, `https` `publicUrl`) that are cheap config guards.

### 7.3 One behavior change with no doc entry and a real user impact

**Linux `executableArgs` field codes are now literal.** v26 had explicit handling — `desktopExecArgEscape()` returned any `/^%[a-zA-Z]$/` arg unquoted, and the `%U` append was skipped when a field code was already present. Both were deleted. Now `linux: { executableArgs: ["%F"] }` produces `Exec='/opt/MyApp/myapp-launcher' %U` with the launcher running `exec '/opt/MyApp/myapp' '%F' "$@"` — the app receives the **literal string** `%F` instead of the file list. Silent, and it breaks file-handling apps. Guard in `linuxPackager.ts` constructor; document under the launcher-entrypoint section.

---

## 8. Test plan

Per `CLAUDE.md`, verify with `TEST_FILES=<name> pnpm ci:test`.

| Suite | Covers | Shape |
|---|---|---|
| `legacyConfigGuard` (new) | WS1 | One fixture per entry in `LEGACY_CONFIG_OPTIONS`, asserting the message names the v27 replacement. Table-driven off the constant so a new entry without a test is impossible. |
| `removedEnvVars` (new) | WS2 | Set each var → assert warn/throw. Plus a repo-hygiene test asserting `test/` and `.github/` set none of them. |
| `migrate-schema` (existing) | WS0, §6.2 | Must stay green through the table move. Add a **round-trip test**: migrator output → `validateConfiguration()` must pass. This is what would have caught `gatekeeperAssess`. |
| `updaterLegacyApi` (new) | WS3 | v26 call shapes (`quitAndInstall(true,false)`, `autoInstallOnAppQuit = false`, `const [f] = await downloadUpdate()`) warn **and** behave as v26 intended. |
| `nodeVersionFloor` (new) | WS4 | Guard fires below 22.12 with a named message; assert it is **not** reachable from any `electron-updater` entrypoint. |

The round-trip test in row 3 is the highest-value single addition: it makes the documented migration path self-verifying.

---

## 9. Open decisions

1. **Is WS1 a throw or a warn for keys the schema already rejects?** Recommendation: **throw**, since those builds already fail — the change is message quality at zero compatibility cost. The alternative (warn + let ajv fail) produces two messages for one problem.
2. **`asar: true` — fix the doc, or actually remove the sentinel?** Recommendation: **fix the doc.** Removing it now means a type change, a schema change, and a runtime change to reject a value whose own schema lists it as the default.
3. **`toolsets.X: null` — re-add `null` to the schema, or correct the doc?** Recommendation: **re-add `null`**, since the doc's stated intent (unset/`null`/`"latest"` are equivalent) is the better design and the runtime already implements it.
4. **How long do the `electron-updater` shims live?** Recommendation: warn in v27, remove in v28, stated in the warning text itself.

---

## Appendix — all 133 findings by workstream

Severity is *surprise potential*: **H** = ships a wrong artifact or silently inverts intent; **M** = fails or changes behavior with an unhelpful message; **L** = fails loudly, message could be better.

"Today" = what a v26-shaped input actually does at HEAD, confirmed by reading the code:
`**silent**` = nothing happens · `generic ajv` = build fails with `unknown property 'X'`, replacement not named · `cryptic crash` = fails with a message naming neither the API nor the fix · `TS-only` = compile error, runtime unaffected.


### WS1 — pre-schema legacy-config pass (62)

| Sev | ID | v26 form → v27 form | Today | Action |
|:---:|---|---|---|---|
| H | `asar-true-sentinel` [^1] | { "build": { "asar": true } }  — and platform-level { "build": { "mac": { "asar": true }… → omit `asar` entirely (enabled by default), or `{ "asar": {} }` / `{ "asar": { "unpack": [… | **silent** | doc |
| H | `disable-default-ignored-files-removed` | { "build": { "disableDefaultIgnoredFiles": true } } — also valid under `mac`, `mas`, `mas… → { "build": { "files": ["**/*", "**/*.obj"] } } — name the default-excluded extension/file… | generic ajv | **throw** |
| H | `electron-download-cache` [^2] | { "electronDownload": { "cache": "/ci/cache/electron" } } → (no config equivalent — set the ELECTRON_BUILDER_CACHE environment variable) | generic ajv | **throw** |
| H | `electron-download-isverifychecksum` | { "electronDownload": { "isVerifyChecksum": false } } → { "electronGet": { "unsafelyDisableChecksums": true } } | generic ajv | **throw** |
| H | `github-vprefixedtagname-removed` | { "publish": { "provider": "github", "owner": "o", "repo": "r", "vPrefixedTagName": false… → { "publish": { "provider": "github", "owner": "o", "repo": "r", "tagNamePrefix": "" } } | generic ajv | **throw** |
| H | `snapcraft-missing-base-misleading-error` | { "snapcraft": { "core22": { "confinement": "strict" } } }  // hand-migrated from v26 `sn… → { "snapcraft": { "base": "core22", "core22": { "confinement": "strict" } } } | generic ajv (type) | **throw** |
| H | `win-azure-additional-metadata` | { "win": { "azureSignOptions": { "endpoint": "…", "certificateProfileName": "…", "codeSig… → { "win": { "sign": { "type": "azure", "endpoint": "…", "certificateProfileName": "…", "co… | generic ajv | **throw** |
| H | `win-sign-and-edit-executable-removed` | { "win": { "signAndEditExecutable": false } }   (and { "win": { "signAndEditExecutable":… → No direct equivalent for `false`. Resource editing ALWAYS runs in v27; to skip only signi… | generic ajv | **throw** |
| H | `win-sign-executable-removed` | { "win": { "signExecutable": false } }   (and { "win": { "signExecutable": true } }) → { "win": { "sign": false } }   for the `false` case; `signExecutable: true` has no replac… | generic ajv | **throw** |
| H | `win-sign-missing-type-discriminator` | Hand-migration intermediate: { "win": { "sign": { "certificateFile": "cert.pfx", "publish… → { "win": { "sign": { "type": "signtool", "certificateFile": "cert.pfx", "publisherName":… | generic ajv | **throw** |
| M | `asar-unpack-platform-level` | { "build": { "mac": { "asarUnpack": ["**/*.node"] } } } (also valid under win / linux / m… → { "build": { "mac": { "asar": { "unpack": ["**/*.node"] } } } } | generic ajv | **throw** |
| M | `electron-compile-removed` | { "build": { "electronCompile": true } } → delete the key entirely; compile sources with electron-vite / esbuild / webpack before pa… | generic ajv | **throw** |
| M | `electron-download-customdir-customfilename` | { "electronDownload": { "customDir": "v30.0.0", "customFilename": "electron-custom.zip" }… → (no equivalent — removed; use `electronDist` to stage a custom Electron build) | generic ajv | **throw** |
| M | `electron-download-mirror` | { "electronDownload": { "mirror": "https://my-mirror/" } } → { "electronGet": { "mirrorOptions": { "mirror": "https://my-mirror/" } } } | generic ajv | **throw** |
| M | `electron-download-root-key` | { "electronDownload": { "mirror": "https://my-mirror/" } } → { "electronGet": { "mirrorOptions": { "mirror": "https://my-mirror/" } } } | generic ajv | **throw** |
| M | `electron-download-strictssl` | { "electronDownload": { "strictSSL": false } } → (no equivalent — removed; @electron/get v5 downloads via `fetch`) | generic ajv | **throw** |
| M | `extrametadata-build-config-silent` | electron-builder -c.extraMetadata.build.appId=com.example.app  (or `"extraMetadata": { "b… → electron-builder -c.appId=com.example.app  (put build configuration at the config root, n… | **silent** | **throw** |
| M | `framework-removed` | { "build": { "framework": "electron" } }  (also "proton" / "proton-native" / "libui") → delete the key; Electron is the only supported framework and was already the default | generic ajv | **throw** |
| M | `linux-syncdesktopname-key-removed` | { "build": { "linux": { "syncDesktopName": true } } } → (delete the option — the behaviour is now always on) | generic ajv | **throw** |
| M | `mac-binaries-to-sign-binaries` | { "mac": { "binaries": ["Contents/Resources/bin/helper"] } } → { "mac": { "sign": { "binaries": ["Contents/Resources/bin/helper"] } } } | generic ajv | **throw** |
| M | `mac-entitlements-to-sign-entitlements` | { "mac": { "entitlements": "build/entitlements.mac.plist" } }  (same on `mas` / `masDev`) → { "mac": { "sign": { "entitlements": "build/entitlements.mac.plist" } } } | generic ajv | **throw** |
| M | `mac-gatekeeperassess-removed-not-moved` [^3] | { "mac": { "gatekeeperAssess": false } } → No replacement. `mac.sign.gatekeeperAssess` DOES NOT EXIST — @electron/osx-sign 2.x remov… | **silent** | **throw** |
| M | `mac-hardenedruntime-to-sign-hardenedruntime` | { "mac": { "hardenedRuntime": true } }  (or `false` to opt out) → { "mac": { "sign": { "hardenedRuntime": true } } } | generic ajv | **throw** |
| M | `mac-identity-to-sign-identity` | { "mac": { "identity": "Developer ID Application: My Company (TEAMID)" } }  (same on `mas… → { "mac": { "sign": { "identity": "Developer ID Application: My Company (TEAMID)" } } } | generic ajv | **throw** |
| M | `mac-mergeasars-to-universal` | { "mac": { "mergeASARs": false } }  (same on `mas` / `masDev`) → { "mac": { "universal": { "mergeASARs": false } } } | generic ajv | **throw** |
| M | `mac-provisioningprofile-to-sign` | { "mas": { "provisioningProfile": "build/embedded.provisionprofile" } } → { "mas": { "sign": { "provisioningProfile": "build/embedded.provisionprofile" } } } | generic ajv | **throw** |
| M | `mac-sign-custom-fn-with-legacy-siblings` | { "mac": { "sign": "./customSign.js", "identity": "Developer ID Application: Acme (TEAMID… → Not expressible — `mac.sign` is a single union. Either keep the custom signer (`sign: "./… | generic ajv | **throw** |
| M | `mac-signignore-renamed-to-sign-ignore` | { "mac": { "signIgnore": ["**/*.txt"] } }  — v26 type was `Array<string> \| string \| nul… → { "mac": { "sign": { "ignore": ["**/*.txt"] } } }  — renamed to the @electron/osx-sign ca… | generic ajv | **throw** |
| M | `mac-singlearchfiles-to-universal` | { "mac": { "singleArchFiles": "*.node" } }  — v26 type was `string \| null` → { "mac": { "universal": { "singleArchFiles": "*.node" } } } | generic ajv | **throw** |
| M | `mac-type-to-sign-type` | { "mac": { "type": "development" } }  — v26 type was `"distribution" \| "development" \|… → { "mac": { "sign": { "type": "development" } } }  — default is now derived: mas-dev → "de… | generic ajv | **throw** |
| M | `native-npm-rebuild` | { "build": { "npmRebuild": false } } → { "build": { "nativeModules": { "npmRebuild": false } } } | generic ajv | **throw** |
| M | `native-rebuilder-rename` | { "build": { "nativeRebuilder": "parallel" } } → { "build": { "nativeModules": { "rebuildMode": "parallel" } } } | generic ajv | **throw** |
| M | `npm-skip-build-from-source` | { "build": { "npmSkipBuildFromSource": true } } → { "build": { "nativeModules": { "buildDependenciesFromSource": false } } }  — note the va… | generic ajv | **throw** |
| M | `snap-flat-subkeys-need-base-nesting` | { "snapcraft": { "base": "core22", "confinement": "strict", "stagePackages": ["libfoo"] }… → { "snapcraft": { "base": "core22", "core22": { "confinement": "strict", "stagePackages":… | generic ajv | **throw** |
| M | `snap-top-level-key` | { "build": { "snap": { "confinement": "strict", "stagePackages": ["libfoo"], "base": "cor… → { "build": { "snapcraft": { "base": "core22", "core22": { "confinement": "strict", "stage… | generic ajv | **throw** |
| M | `toolsets-null-value-rejected-by-schema` [^4] | `{ "toolsets": { "nsis": null } }` — the doc states `null` "still works at runtime" and o… → `{ "toolsets": { "nsis": "latest" } }` or omit the property entirely | generic ajv (type) | doc |
| M | `win-azure-sign-options` | { "win": { "azureSignOptions": { "endpoint": "https://weu.codesigning.azure.net/", "certi… → { "win": { "sign": { "type": "azure", "endpoint": "https://weu.codesigning.azure.net/", "… | generic ajv | **throw** |
| M | `win-signtool-options` | { "win": { "signtoolOptions": { "certificateFile": "cert.pfx", "certificatePassword": "…"… → { "win": { "sign": { "type": "signtool", "certificateFile": "cert.pfx", "certificatePassw… | generic ajv | **throw** |
| L | `appimage-system-integration-removed` | { "build": { "appImage": { "systemIntegration": "doNotAsk" } } } → delete the key; desktop integration is handled by AppImageLauncher | generic ajv | **throw** |
| L | `asar-nested-unpack-dir` | { "build": { "asar": { "unpackDir": "node_modules/foo" } } } → { "build": { "asar": { "unpack": "node_modules/foo" } } } | generic ajv | **throw** |
| L | `asar-unpack-dir-hyphenated` | { "build": { "asar-unpack-dir": "node_modules/foo" } } → { "build": { "asar": { "unpack": "node_modules/foo" } } } | generic ajv | **throw** |
| L | `asar-unpack-hyphenated` | { "build": { "asar-unpack": ["**/*.node"] } } → { "build": { "asar": { "unpack": ["**/*.node"] } } } | generic ajv | **throw** |
| L | `asar-unpack-root` | { "build": { "asarUnpack": ["**/*.node"] } } → { "build": { "asar": { "unpack": ["**/*.node"] } } } | generic ajv | **throw** |
| L | `disable-asar-integrity` | { "build": { "disableAsarIntegrity": true } } → { "build": { "asar": { "disableIntegrity": true } } } | generic ajv | **throw** |
| L | `disable-sanity-check-asar` | { "build": { "disableSanityCheckAsar": true } } → { "build": { "asar": { "disableSanityCheck": true } } } | generic ajv | **throw** |
| L | `extrametadata-directories-config-silent` | electron-builder -c.extraMetadata.directories.output=release  (or `"extraMetadata": { "di… → electron-builder -c.directories.output=release | **silent** | **throw** |
| L | `gitlab-vprefixedtagname-retained` | { "publish": { "provider": "gitlab", "projectId": 1, "vPrefixedTagName": false } } → { "publish": { "provider": "gitlab", "projectId": 1, "vPrefixedTagName": false } }  // un… | **silent** | none (ok today) |
| L | `helper-bundle-id-removed` | { "build": { "helper-bundle-id": "com.example.helper" } }  (hyphenated, root-level) → { "build": { "mac": { "helperBundleId": "com.example.helper" } } } | generic ajv | **throw** |
| L | `launch-ui-version-removed` | { "build": { "launchUiVersion": "0.1.0" } } → delete the key; it only applied to libui-based frameworks on Windows | generic ajv | **throw** |
| L | `mac-additionalarguments-to-sign` | { "mac": { "additionalArguments": ["--deep"] } } → { "mac": { "sign": { "additionalArguments": ["--deep"] } } } | generic ajv | **throw** |
| L | `mac-entitlementsinherit-to-sign` | { "mac": { "entitlementsInherit": "build/entitlements.mac.inherit.plist" } } → { "mac": { "sign": { "entitlementsInherit": "build/entitlements.mac.inherit.plist" } } } | generic ajv | **throw** |
| L | `mac-entitlementsloginhelper-to-sign` | { "mas": { "entitlementsLoginHelper": "build/entitlements.mas.loginhelper.plist" } } → { "mas": { "sign": { "entitlementsLoginHelper": "build/entitlements.mas.loginhelper.plist… | generic ajv | **throw** |
| L | `mac-preautoentitlements-to-sign` | { "mac": { "preAutoEntitlements": false } } → { "mac": { "sign": { "preAutoEntitlements": false } } } | generic ajv | **throw** |
| L | `mac-requirements-to-sign-requirements` | { "mac": { "requirements": "build/requirements.txt" } } → { "mac": { "sign": { "requirements": "build/requirements.txt" } } } | generic ajv | **throw** |
| L | `mac-strictverify-to-sign-strictverify` | { "mac": { "strictVerify": false } } → { "mac": { "sign": { "strictVerify": false } } } | generic ajv | **throw** |
| L | `mac-timestamp-to-sign-timestamp` | { "mac": { "timestamp": "http://timestamp.apple.com/ts01" } } → { "mac": { "sign": { "timestamp": "http://timestamp.apple.com/ts01" } } } | generic ajv | **throw** |
| L | `mac-x64archfiles-to-universal` | { "mac": { "x64ArchFiles": "*.node" } }  — v26 type was `string \| null` → { "mac": { "universal": { "x64ArchFiles": "*.node" } } } | generic ajv | **throw** |
| L | `native-build-deps-from-source` | { "build": { "buildDependenciesFromSource": true } } → { "build": { "nativeModules": { "buildDependenciesFromSource": true } } } | generic ajv | **throw** |
| L | `native-node-gyp-rebuild` | { "build": { "nodeGypRebuild": true } } → { "build": { "nativeModules": { "nodeGypRebuild": true } } } | generic ajv | **throw** |
| L | `node-version-removed` | { "build": { "nodeVersion": "current" } } → delete the key; it only applied to libui-based frameworks and never affected Electron bui… | generic ajv | **throw** |
| L | `npm-skip-build-from-source-removed` | { "build": { "npmSkipBuildFromSource": true } } → { "build": { "nativeModules": { "buildDependenciesFromSource": false } } }  (logical inve… | generic ajv | **throw** |
| L | `squirrel-windows-no-msi-removed` | { "build": { "squirrelWindows": { "noMsi": true } } } → { "build": { "squirrelWindows": { "msi": false } } }  (inverted boolean) | generic ajv | **throw** |

### WS2 — removed environment variables (14 actionable + 1 refuted)

| Sev | ID | v26 form → v27 form | Today | Action |
|:---:|---|---|---|---|
| H | `appimage-tools-path-env-removed` | APPIMAGE_TOOLS_PATH=/opt/my-appimage-tools electron-builder --linux AppImage → { "build": { "toolsets": { "appimage": { "url": "file:///opt/my-appimage-tools" } } } } | **silent** | **throw** |
| H | `ci-build-tag-env-removed` | CI_BUILD_TAG=v1.2.3 electron-builder --publish onTag   (or, in v26, no --publish at all —… → CI_COMMIT_TAG=v1.2.3 electron-builder --publish onTag | **silent** | **throw** |
| H | `custom-fpm-path-env-removed` | CUSTOM_FPM_PATH=/opt/homebrew/bin/fpm electron-builder --linux deb   # a path to the fpm… → { "build": { "toolsets": { "fpm": { "url": "file:///opt/homebrew/bin" } } } }   # a path… | **silent** | **throw** |
| H | `electron-builder-nsis-dir-env-removed` | ELECTRON_BUILDER_NSIS_DIR=/opt/nsis-3.08 electron-builder --win nsis → { "build": { "toolsets": { "nsis": { "url": "file:///opt/nsis-3.08" } } } } | **silent** | **throw** |
| H | `electron-builder-nsis-resources-dir-env-removed` | ELECTRON_BUILDER_NSIS_RESOURCES_DIR=/opt/nsis-resources electron-builder --win nsis → { "build": { "toolsets": { "nsis": { "url": "file:///opt/my-nsis-bundle" } } } }   # one… | **silent** | **throw** |
| H | `electron-builder-wine-toolset-dir-env-removed` | ELECTRON_BUILDER_WINE_TOOLSET_DIR=/opt/wine-custom electron-builder --win nsis   # on mac… → { "build": { "toolsets": { "wine": { "url": "file:///opt/wine-custom" } } } } | **silent** | **throw** |
| H | `signtool-path-env-removed-undocumented` [^5] | SIGNTOOL_PATH=C:\\Windows Kits\\10\\bin\\10.0.22621.0\\x64\\signtool.exe electron-builder… → { "build": { "toolsets": { "winCodeSign": { "url": "file:///absolute/path/to/bundle-dir"… | **silent** | warn |
| H | `use-system-fpm-env-removed` | USE_SYSTEM_FPM=true electron-builder --linux deb → { "build": { "toolsets": { "fpm": { "url": "file:///opt/homebrew/bin" } } } }   # directo… | **silent** | **throw** |
| H | `use-system-signcode-env-removed` | USE_SYSTEM_SIGNCODE=true electron-builder --win → No env-var replacement. Configure signing via win.sign (e.g. { "win": { "sign": { "type":… | **silent** | **throw** |
| H | `use-system-wine-env-removed` | USE_SYSTEM_WINE=true electron-builder --win nsis → On Linux: no action — the host `wine` is now the default. On macOS: { "build": { "toolset… | **silent** | **throw** |
| — | ~~`custom-nsis-resources-env-removed`~~ [^8] | CUSTOM_NSIS_RESOURCES=<alternate nsis-resources bundle> → n/a | n/a | **refuted — no guard** |
| M | `electron-builder-7zip-path-env-removed-undocumented` | ELECTRON_BUILDER_7ZIP_PATH=/usr/local/bin/7za electron-builder → { "build": { "toolsets": { "sevenZip": { "url": "file:///absolute/path/to/dir" } } } }… | **silent** | **throw** |
| M | `linux-tools-mac-path-env-removed` | LINUX_TOOLS_MAC_PATH=/opt/linux-tools-mac electron-builder --linux deb (on macOS) → { "build": { "toolsets": { "linuxToolsMac": { "url": "file:///opt/linux-tools-mac" } } } } | **silent** | **throw** |
| M | `use-system-osslsigncode-env-removed` | USE_SYSTEM_OSSLSIGNCODE=true electron-builder --win   # on macOS/Linux → No env-var replacement. Configure signing via win.sign and/or toolsets.winCodeSign: { url… | **silent** | **throw** |
| L | `electron-builder-icons-toolset-dir-env-removed-undocumented` | ELECTRON_BUILDER_ICONS_TOOLSET_DIR=/opt/icons-bundle electron-builder → { "build": { "toolsets": { "icons": { "url": "file:///opt/icons-bundle" } } } } | **silent** | warn |

### WS3 — electron-updater runtime guards (8)

| Sev | ID | v26 form → v27 form | Today | Action |
|:---:|---|---|---|---|
| H | `autoinstallonappquit-removed-silently` | autoUpdater.autoInstallOnAppQuit = false → autoUpdater.autoInstallEvent = "manual" | **silent** | warn → throw v28 [^9] |
| H | `downloadupdate-array-destructure-throws` | const [installer] = await autoUpdater.downloadUpdate()   /* and: const [downloaded] = (aw… → const { updateFile } = await autoUpdater.downloadUpdate()   /* and: const downloaded = (a… | cryptic crash | warn → throw v28 |
| H | `downloadupdate-index-access-undefined` | const files = await autoUpdater.downloadUpdate(); const installer = files[0] → const { updateFile } = await autoUpdater.downloadUpdate() | **silent** | warn → throw v28 |
| H | `electron-updater-esm-requires-node-2212-inside-electron` | `const { autoUpdater } = require("electron-updater")` in a CommonJS Electron main process… → Same call, but it only works when the Electron build in use bundles Node >= 22.12.0. Othe… | cryptic crash | warn |
| H | `quitandinstall-positional-args` | autoUpdater.quitAndInstall(true, false) → autoUpdater.quitAndInstall({ isSilent: true, isForceRunAfter: false }) | **silent** | warn → throw v28 |
| M | `updateinfo-legacy-path-sha512-consumers` | autoUpdater.on("update-downloaded", info => { const url = info.path; const hash = info.sh… → autoUpdater.on("update-downloaded", info => { const url = info.files[0].url; const hash =… | **silent** | warn |
| L | `allowunverifiedlinuxpackages-additive` | (none — no v26 property existed; historical behavior was to always bypass GPG/signature c… → autoUpdater.allowUnverifiedLinuxPackages = false   // optional opt-in to enforce GPG chec… | **silent** | none (ok today) |
| L | `disablewebinstaller-default-true` | (no code — an app that publishes an nsis-web target and never sets autoUpdater.disableWeb… → autoUpdater.disableWebInstaller = false   // explicit opt-in, required before v28 | targeted warn | none (ok today) |

### WS4 — CLI, programmatic API & Node floor (13)

| Sev | ID | v26 form → v27 form | Today | Action |
|:---:|---|---|---|---|
| H | `arch-all-drops-ia32` | `import { createTargets } from "electron-builder"; createTargets([Platform.WINDOWS], "nsi… → `createTargets([Platform.WINDOWS], "nsis", "all")` -> `[Arch.x64, Arch.arm64]`. To keep 3… | **silent** | warn |
| H | `node-min-not-enforced-at-runtime` [^6] | Running `electron-builder` (CLI or programmatic) on Node.js 14/16/18/20. v26 declared `en… → Node.js >= 22.12.0. Every package under packages/ now declares `"engines": { "node": ">=2… | cryptic crash | **throw** |
| M | `packageroptions-extrametadata` | await build({ targets: Platform.MAC.createTarget(), extraMetadata: { … } })  — v26 Packag… → await build({ targets: Platform.MAC.createTarget(), config: { extraMetadata: { … } } }) | targeted throw | **throw** |
| L | `em-build-cli-flag` | electron-builder --em.build.appId=com.example.app → electron-builder -c.appId=com.example.app | cryptic crash | **throw** |
| L | `em-directories-cli-flag` | electron-builder --em.directories.output=release → electron-builder -c.directories.output=release | cryptic crash | **throw** |
| L | `packageroptions-devmetadata` | await build({ targets: Platform.MAC.createTarget(), devMetadata: { … } })  — v26 Packager… → await build({ targets: Platform.MAC.createTarget(), config: { … } }) | targeted throw | **throw** |
| L | `removed-export-libuiframework` | import { LibUiFramework } from "app-builder-lib/out/frameworks/LibUiFramework"  (and, ind… → no replacement — use the default Electron framework; the class and its source file were d… | cryptic crash | doc |
| L | `removed-export-protonframework` | import { ProtonFramework } from "app-builder-lib/out/ProtonFramework"  (and, indirectly,… → no replacement — use the default Electron framework; the class and its source file were d… | cryptic crash | doc |
| L | `removed-export-snapoptions` | import { SnapOptions } from "app-builder-lib"   /   import { SnapOptions } from "electron… → import { SnapcraftOptions } from "app-builder-lib"   (NOT available from "electron-builde… | TS-only | doc |
| L | `renamed-export-electrondownloadoptions` | import { ElectronDownloadOptions } from "electron-builder"   /   from "app-builder-lib"… → import { ElectronGetOptions } from "electron-builder"   /   from "app-builder-lib"  (now… | TS-only | doc |
| L | `renamed-export-windowsazuresigningconfiguration` | import { WindowsAzureSigningConfiguration } from "app-builder-lib" → import { WindowsAzureSigningConfig } from "app-builder-lib" | TS-only | doc |
| L | `renamed-export-windowssigntoolconfiguration` | import { WindowsSigntoolConfiguration } from "app-builder-lib" → import { WindowsSigntoolSigningConfig } from "app-builder-lib" | TS-only | doc |
| L | `snapoptions-type-export-removed` | import { SnapOptions } from "app-builder-lib" → import { SnapcraftOptions } from "app-builder-lib"  // per-base types: SnapOptionsLegacy… | TS-only | doc |

### WS5 — behavior-flip warnings (28)

| Sev | ID | v26 form → v27 form | Today | Action |
|:---:|---|---|---|---|
| H | `electron-prebuilt-rebuild-now-shipped` | `"dependencies": { "electron-prebuilt": "^1.4.13" }` (or `electron-rebuild`) — v26 aborte… → migrate (`electron` / `@electron/rebuild` in devDependencies), or keep them declared and… | **silent** | warn |
| H | `implicit-publish-removed` | No --publish flag at all. PublishManager auto-set publishOptions.publish = "always" when… → electron-builder --win --publish always   (or --publish onTag / onTagOrDraft; programmati… | **silent** | warn |
| H | `linux-desktop-filename-always-synced` | package.json: { "desktopName": "com.myapp.MyApp" }  with linux.syncDesktopName absent or… → same package.json, no config change → installed /usr/share/applications/com.myapp.MyApp.d… | **silent** | warn |
| H | `linux-executable-args-field-codes-now-literal` | `linux: { executableArgs: ["%F"] }` (or "%f"/"%u"/"%U") — v26 inlined field codes into th… → no supported replacement: field codes must be dropped from `executableArgs`. The .desktop… | **silent** | warn |
| H | `linux-maintainer-script-ejs-syntax` | a custom template referenced by linux.afterInstall / linux.afterRemove / linux.appArmorPr… → the same template using shell-style macros: `ln -sf '/opt/${sanitizedProductName}/${execu… | **silent** | **throw** |
| H | `mac-sign-null-semantic-flip` | { "mac": { "sign": null } }  — in v26 `sign` was ONLY a custom-signer hook (`CustomMacSig… → Delete the key entirely to keep signing. `mac.sign: null` now means SKIP SIGNING ENTIRELY. | migrator only | warn |
| H | `toolset-defaults-latest-unlogged` | no `toolsets` key at all (the option is new in v27). v26 always used the fixed bundles: w… → unset / `null` / `"latest"` all resolve to the newest bundle (wine 1.0.1, winCodeSign 1.3… | **silent** | warn |
| M | `allow-electron-builder-as-production-dependency-env-removed` | `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY=true electron-builder` — allowed `electr… → the env var is gone; to bundle electron-builder you must override the ignore list and dro… | **silent** | warn |
| M | `appimage-no-sandbox-default-dropped` | no config at all — AppImage always injected `--no-sandbox` (v26 default; the pre-change c… → `linux: { executableArgs: ["--no-sandbox"] }` to keep it unconditionally, or `toolsets: {… | **silent** | doc |
| M | `bitbucket-token-without-username-bearer` | BITBUCKET_TOKEN=<app password or Atlassian API token> with no BITBUCKET_USERNAME / bitbuc… → set BITBUCKET_USERNAME (Bitbucket username, or Atlassian account email for an API token)… | targeted warn | warn |
| M | `dmg-filesystem-defaults-apfs` | no `dmg.filesystem` key — the default was `HFS+` → `{ "dmg": { "filesystem": "HFS+" } }` to keep the v26 volume format | **silent** | doc |
| M | `legacy-electron-updater-compatibility-pin-not-warned` | "electronUpdaterCompatibility": ">=2.15"   (or any range intersecting <2.16.0, e.g. ">=1.… → remove the pin (the v27 default is ">=2.16"); keep a legacy range ONLY if you still ship… | **silent** | warn |
| M | `linux-launcher-entrypoint` | deb/rpm shipped only `/opt/<App>/<exe>` and the generated .desktop had `Exec=/opt/<App>/<… → every Linux target ships an extra `/opt/<App>/<exe>-launcher` shell script and the .deskt… | **silent** | doc |
| M | `mac-productname-validated-not-sanitized` | `productName: "My App: Pro"` (or any name containing / \ : * ? " < > \| or control chars)… → choose a productName / executableName that needs no filename sanitization, e.g. `productN… | targeted throw | none (ok today) |
| M | `node-modules-arch-os-filtered` | no config — host-installed `node_modules` were copied verbatim, so a package declaring `c… → no config to restore it; re-add a deliberately cross-arch binary through `extraResources`… | targeted warn | none (ok today) |
| M | `nsis-file-association-progid-changed` | `fileAssociations: [{ ext: "myext", name: "MyApp Document" }]` registered the association… → same `fileAssociations` config, but the registered ProgID is now a generated `<program>.<… | **silent** | warn |
| M | `root-directories-in-package-json` | { "name": "my-app", "directories": { "output": "release" }, "build": { ... } }  — `direct… → { "name": "my-app", "build": { "directories": { "output": "release" } } } | **silent** | **throw** |
| M | `suffixed-update-channels-expand` | `{ "generateUpdatesFilesForAllChannels": true, "publish": { "provider": "generic", "url":… → same config now writes `beta-arm64.yml` + `alpha-arm64.yml` (and `latest-arm64` writes al… | **silent** | warn |
| L | `ats-signtool-dlib-default` | Azure Trusted Signing always went through PowerShell `Invoke-TrustedSigning` (requiring t… → unset / `null` / `"latest"` / any winCodeSign >= 1.3.0 uses `signtool /dlib`. To force th… | targeted warn | none (ok today) |
| L | `dmg-format-ulmo-additive` | no v26 form — `dmg.format` accepted UDRW \| UDRO \| UDCO \| UDZO \| UDBZ \| ULFO and reje… → `{ "dmg": { "format": "ULMO" } }` is now accepted (LZMA-compressed image, macOS 10.15+ on… | **silent** | doc |
| L | `electron44-ia32-armv7l-fail-fast` | `electron-builder --win --ia32` (or `--linux --armv7l`) with any electronVersion — v26 at… → pin `electronVersion` to 43.x or earlier to keep ia32/armv7l, or drop those arches | targeted throw | none (ok today) |
| L | `forge-makers-esm-api-parity-confirmed` | CJS module: `exports.__esModule = true; exports.isSupportedOnCurrentPlatform = () => Prom… → ESM module: `export const isSupportedOnCurrentPlatform = () => Promise.resolve(true); exp… | **silent** | none (ok today) |
| L | `mac-sign-not-actually-a-passthrough` [^7] | n/a — no v26 legacy form. This is a v27 doc-vs-implementation mismatch found while auditi… → { "mac": { "sign": { "batchCodesignCalls": true } } } / { "sign": { "preEmbedProvisioning… | **silent** | doc |
| L | `msix-target-beta-additive` | no v26 form — the `msix` target did not exist (v26 users shipped `appx`) → `win: { target: "msix" }`; works with the default winCodeSign toolset, requires Windows 1… | targeted throw | doc |
| L | `platformpackager-info-protected` | packager.info.tempDirManager / packager.info.metadata / packager.info.framework / package… → drop the `.info.` hop: packager.tempDirManager, packager.metadata, packager.framework, pa… | TS-only | doc |
| L | `platformpackager-platformspecificbuildoptions-protected` | packager.platformSpecificBuildOptions   /   deepAssign({}, packager.platformSpecificBuild… → packager.platformOptions   /   packager.getOptionsForTarget<AppXOptions>("appx") | TS-only | doc |
| L | `redundant-production-dependencies-excluded` | `"dependencies": { "electron": "^38" }` aborted the build with `Package "electron" is onl… → the package stays in `dependencies` and is excluded from the copied node_modules; overrid… | targeted warn | none (ok today) |
| L | `win-sign-hsm-pkcs11-beta` | None — no v26 config maps to these. They are purely additive in v27; nothing a v26 user h… → { "win": { "sign": { "type": "hsm", "cryptoServiceProvider": "…", "keyContainer": "…" } }… | targeted throw | none (ok today) |

### WS6 — schema / validator repairs (1)

| Sev | ID | v26 form → v27 form | Today | Action |
|:---:|---|---|---|---|
| H | `mac-sign-union-schema-hole` | n/a — this is the v27 validation gap that makes every other mac.sign finding worse. Any o… → { "mac": { "sign": { "identity": "Developer ID Application: Acme (TEAMID)" } } } | **silent** | **throw** |

### WS7 — documentation-only (6)

| Sev | ID | v26 form → v27 form | Today | Action |
|:---:|---|---|---|---|
| H | `cjs-require-esm-old-node-misleading-advice` | `const { build, Platform } = require("electron-builder")` from a CommonJS script or confi… → Same `require()` call, but only on Node >= 22.12.0. On older Node the only options are up… | cryptic crash | doc |
| H | `electron-updater-import-meta-breaks-cjs-bundling` | Bundling the Electron main process to CommonJS (electron-vite, electron-forge + webpack,… → Mark `electron-updater` as external (Vite `build.rollupOptions.external`, webpack `extern… | cryptic crash | doc |
| H | `exports-map-blocks-deep-and-package-json-subpaths` | Any subpath import of any electron-builder package, e.g. `require("app-builder-lib/out/ut… → Only `<pkg>` and `<pkg>/internal` are importable. `electron-updater` additionally exports… | cryptic crash | doc |
| M | `builder-util-removed-public-exports` | `import { executeAppBuilder, getPath7za, getPath7x } from "builder-util"` — all three wer… → Removed with no public replacement. `executeAppBuilder` and the `app-builder-bin` depende… | TS-only | doc |
| M | `ts-module-node16-hard-compile-error` | tsconfig `{"module": "node16", "moduleResolution": "node16"}` (a very common Node-targeti… → `"module": "nodenext"` with TypeScript >= 5.8 (which models `require(esm)`), or `"module"… | TS-only | doc |
| L | `node-2212-experimental-warning-on-cjs-require` | `require("electron-builder")` from CJS on the documented minimum runtime, Node 22.12.0 or… → Functionally identical, but Node 22.14.0+ is the version at which the require(esm) suppor… | **silent** | doc |

#### Overrides applied to the raw audit output

[^1]: `asar-true-sentinel` — Code is correct, doc is wrong: `asar: true` is valid at all three layers. Fix the doc, do not add a guard.
[^2]: `electron-download-cache` — Message must point at `ELECTRON_BUILDER_CACHE`, which is alive — not "no equivalent".
[^3]: `mac-gatekeeperassess-removed-not-moved` — Also fix `MAC_SIGN_FIELDS` in migrate-schema.ts and the doc table — the migrator currently emits an invalid config.
[^4]: `toolsets-null-value-rejected-by-schema` — Not implementable as a warn — ajv rejects `toolsets.X: null` first. Either re-add `null` to the schema or correct the doc.
[^5]: `signtool-path-env-removed-undocumented` — Generic name; a Windows CI image may set it for unrelated tooling. Warn only, never throw.
[^6]: `node-min-not-enforced-at-runtime` — Builder entrypoints ONLY. Must not run in electron-updater — that loads inside Electron’s bundled Node, often < 22.12.
[^8]: `custom-nsis-resources-env-removed` — **Refuted and dropped.** It was never an environment variable in v26, only a union-type label inside an error string, so there is nothing for a v26 user to have set.
[^9]: `autoinstallonappquit-removed-silently` — Audit proposed a throw; downgraded to a warning shim that maps the value to `autoInstallEvent` (§3.4). A throw would crash a shipping app at startup on a property assignment.
[^7]: `mac-sign-not-actually-a-passthrough` — `ElectronSignOptions` is `additionalProperties: false`, so the design note claiming new osx-sign fields are picked up automatically is false.

---

## Appendix — method

Ten parallel audits (one per breaking-change group), each enumerating individual keys/vars/flags rather than doc headings, then determining the actual HEAD behavior for each v26-shaped input by reading source. Every group's findings were then re-read by an independent adversarial verifier instructed to refute them — checking both the claimed current behavior and whether the proposed hook file exists and runs on every build. A final critic cross-checked coverage against the doc's own index table and swept `release/v26` @ `f4610970f` for code-level breaking changes missing from the doc.

**Verification outcome:** 126 CONFIRMED · 6 CORRECTED (substance right, classification label wrong) · 1 REFUTED and dropped (`CUSTOM_NSIS_RESOURCES` was never an env var in v26 — only a union-type label in an error string).

Seven recommendations were overridden after review; each is footnoted at the point of use.
