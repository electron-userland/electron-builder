# Duplicated-Logic Extraction & Migration Plan

## Implementation status (branch: refactor/extract-dup-logic-helpers)

IMPLEMENTED (behavior-preserving unless noted; full compile + eslint + targeted tests green):
- builder-util-runtime: hashFile, getGitlabAuthHeaders
- builder-util: assertVersionHasNoVPrefix; deleted dead deepAssign.ts; orNullIfFileNotExist/orIfFileNotExist consolidation (incl. migrate-schema readFileSafe); snapcraftBuilder exec migration
- app-builder-lib: writeAppUpdateYaml, createProjectMetadataLazy, addTargetsForPlatform (target-spec parser)
- electron-updater: channelFileNotFoundError; getElectronVersionFromInstalled delegation
- app-builder-lib node-module-collector: readJsonOrNull (catch-all)
- electron-publish: validateResolvedToken

SKIPPED (not a clean generalization): withFileLock — the lock scaffolding is small and would force wrapping large extraction bodies with divergent options; see the app-builder-lib/util section.

DEFERRED to separate PRs (behavior-changing): errorToString (24 sites; alters updater error text), retry consolidation, downloadToFile base-class skeleton, ELECTRON_BUILDER_OFFLINE -> isOfflineModeEnabled (intentional bug-fix). See the "Local-only / do-not-extract" and "Recommended sequencing" sections for per-item detail.

## Summary

This plan consolidates 15 distinct, adversarially-verified duplicated-logic findings across the electron-builder monorepo. Three separate `orNullIfFileNotExist` / `orIfFileNotExist` findings (`ornullif-filenotexist-dup`, `or-if-file-not-exist-dup`, `dup-ornullif-file-not-exist`) describe the same consolidation and are merged into one (using the most complete variant, which also catches the inline `readFileSafe` reimplementation in electron-builder's migrate-schema). The two stream-based `hashFile` findings (`stream-pipe-hash-file`, `dup-hashfile-stream`) are likewise merged. The goal of each item below is either (a) DELETE a duplicate and import the existing canonical helper, or (b) EXTRACT a new shared helper into the correct package per the dependency graph. Several findings are genuine duplication but low enough value that the recommendation is to fix locally or not extract at all — these are called out explicitly.

### Counts overview

- Distinct findings after merge: 15
- builder-util-runtime (pure / runtime-safe, shared with electron-updater): 5
- builder-util (packaging-flow shared utilities): 3
- app-builder-lib/util (app-builder-lib-internal, cross-subdir): 4
- local-only / do-not-extract: 6 (3 are recommended NOT to extract or to fix only locally)
- Highest-confidence safe consolidations (do first): deepAssign dead-copy deletion (0.97), orNullIfFileNotExist consolidation (0.95).

---

## (1) Target: builder-util-runtime

These are pure, Node-core-only (crypto/fs/string) logics shareable with electron-updater (which depends ONLY on builder-util-runtime). None drags packaging-only deps into the leaf package.

| Pattern | Occurrences | Proposed helper | Effort | Risk | Confidence |
|---|---|---|---|---|---|
| deepAssign dead duplicate (delete builder-util copy) | 2 | delete packages/builder-util/src/deepAssign.ts (keep builder-util-runtime/objects.ts) | S | low | 0.97 |
| hashFile (stream-based file hashing) | 2 | hashFile(file, algorithm?, encoding?, options?): Promise<string> | S | low | 0.95 |
| GitLab token -> auth header builder | 2 | getGitlabAuthHeaders(token: string \| null): { [k: string]: string } | S | low | 0.95 |
| Stack-preferring error stringification | 26 | errorToString(e: unknown, opts?: { preferStack?: boolean }): string | M | med | 0.82 |
| Hand-rolled retry-with-backoff loops | 3 | use existing retry(...); + retryOnErrorMatch(patterns) predicate factory | M | med | 0.84 |
| download-to-file promise skeleton | 2 | protected downloadToFile(url, destination, options): Promise<string> on HttpExecutor | M | med | 0.70 |

### deepAssign dead duplicate (delete builder-util copy)

What's duplicated: `deepAssign` plus its private helpers (`isObject`, `assignKey` with the PR#562 `value === undefined` guard and Array set-merge, `assign` filtering via `isValidKey`) is byte-for-byte identical in two files. The builder-util barrel (`packages/builder-util/src/util.ts` line 36) ALREADY re-exports `deepAssign` from builder-util-runtime, and grep finds ZERO importers of the builder-util copy — it is orphaned dead code.

Occurrences:
- packages/builder-util/src/deepAssign.ts:1-50 (dead duplicate, no importers)
- packages/builder-util-runtime/src/objects.ts:38-85 (canonical; re-exported by builder-util barrel)

Proposed change: delete packages/builder-util/src/deepAssign.ts. No call-site changes required.

Target rationale: canonical implementation already lives in builder-util-runtime and is the one consumed across packages via the barrel. Pure consolidation by deletion.

Risk/notes: lowest-risk item in the plan; the file is not referenced by util.ts, index.ts, or any test. Note the dead file itself imports `isValidKey` from builder-util-runtime, reinforcing that runtime is the source of truth.

### hashFile (stream-based file hashing)

What's duplicated: a Promise-wrapped streaming file hasher — `createHash(algorithm)` + `createReadStream(file, { highWaterMark: 1MB })` piped into the hash with `end: false`, resolving the encoded digest. Byte-for-byte identical bodies, including the same `highWaterMark: 1024 * 1024` and the verbatim comment "better to use more memory but hash faster". Confirmed copy-paste (only the signature differs: app-builder-lib exports it; electron-updater keeps it module-private with an explicit Promise<string> return type).

Occurrences:
- packages/app-builder-lib/src/util/hash.ts:1-17 (exported; consumers: NsisTarget.ts:861, FpmTarget.ts:319, updateInfoBuilder.ts:108/172)
- packages/electron-updater/src/DownloadedUpdateHelper.ts:166-179 (module-private; consumer: DownloadedUpdateHelper.ts:145)

Proposed helper: `hashFile(file: string, algorithm?: string, encoding?: "base64" | "hex", options?: Parameters<typeof createReadStream>[1]): Promise<string>` in builder-util-runtime; app-builder-lib/src/util/hash.ts re-exports it for its existing call sites; electron-updater imports it directly and deletes its private copy.

Target rationale: electron-updater depends ONLY on builder-util-runtime, so this is the single package both consumers can import from. Uses only `crypto.createHash` + `fs.createReadStream`, both already imported in builder-util-runtime (uuid.ts, httpExecutor.ts) — no new dep surface.

Risk/notes: `options?: any` is effectively dead at all current call sites (none pass it); tightening to the createReadStream param type is an optional improvement. Effort S, risk low.

### GitLab token -> auth header builder

What's duplicated: a private method `setAuthHeaderForToken(token)` — if the token starts with "Bearer" it goes in `authorization`, otherwise in the `PRIVATE-TOKEN` header; a null token yields empty headers. Identical body AND identical 3-line comment block across two packages. Each copy is the sole source of GitLab auth headers in its package (used 3x in each).

Occurrences:
- packages/electron-publish/src/gitlabPublisher.ts:324-339 (used at lines 255, 280, 312)
- packages/electron-updater/src/providers/GitLabProvider.ts:230-245 (used at lines 72, 116, 209)

Proposed helper: `getGitlabAuthHeaders(token: string | null): { [key: string]: string }` in builder-util-runtime/src/publishOptions.ts.

Target rationale: pure string->object logic, zero node/packaging deps. electron-updater cannot reach electron-publish or builder-util, so the leaf runtime package is the only shared home. publishOptions.ts already hosts analogous pure GitLab/GitHub helpers (githubUrl, githubTagPrefix, getS3LikeProviderBaseUrl) and the GitlabOptions type; both files already import from builder-util-runtime.

Risk/notes: callers pass the token slightly differently (`this.token` vs `this.options.token || null`) but both normalize to `string | null`, so the signature fits cleanly. Effort S, risk low.

### Stack-preferring error stringification

What's duplicated: render a caught unknown error preferring the full stack trace and falling back to message/toString. Two near-identical idiom families — `${e.stack || e.message}` (electron-updater providers + AppUpdater) and `(e.stack || e).toString()` / `${e.stack || e}` (AppUpdater, NsisUpdater, AppImageUpdater, builder-util, app-builder-lib). 26 occurrences verified by grep.

Occurrences (representative; full set is 26 across the listed files):
- packages/electron-updater/src/providers/GitHubProvider.ts:133/151/202
- packages/electron-updater/src/providers/GitLabProvider.ts:77/89/127/222
- packages/electron-updater/src/AppUpdater.ts:276/353/577/602/884
- packages/electron-updater/src/NsisUpdater.ts:213, packages/electron-updater/src/AppImageUpdater.ts:72
- packages/builder-util/src/promise.ts:4, packages/builder-util/src/util.ts:240, packages/builder-util/src/log.ts:81
- packages/app-builder-lib/src/util/cacheManager.ts:50/71, packages/app-builder-lib/src/winPackager.ts:91, packages/app-builder-lib/src/codeSign/macCodeSign.ts:147
- packages/electron-builder/src/publish.ts:117

Proposed helper: `errorToString(e: unknown, opts?: { preferStack?: boolean }): string` returning `e.stack || e.message || String(e)`, placed beside `newError` in builder-util-runtime/src/error.ts.

Target rationale: pure, runtime-safe formatting, no node/packaging deps. electron-updater (leaf-only consumer) is the heaviest user; builder-util and app-builder-lib both transitively depend on builder-util-runtime, so one home serves every call site.

Risk/notes: the two idiom families have subtly different fallback semantics (`e.stack || e.message` drops the message-only case; `e.stack || e` stringifies the raw error). Unifying to `e.stack || e.message || String(e)` is a real behavior change at most call sites — review per-site, especially log.ts:81 and publish.ts:117 which have their own variants. This is the rationale for risk=med. Highest occurrence count in the plan; high migration value but not mechanical.

### Hand-rolled retry-with-backoff loops

What's duplicated: try/catch + sleep-backoff retry loops with a "should I retry this error" predicate, re-implementing the existing generic `retry(task, { retries, interval, backoff, shouldRetry, cancellationToken })` (builder-util-runtime/src/retry.ts). `snapcraftBuilder.executeWithRetry`'s `retryableErrors: string[]` substring match maps onto `shouldRetry`; `HttpExecutor.retryOnServerError`'s server-error/EPIPE predicate maps onto `shouldRetry`. A third hand-rolled loop exists in GenericProvider.

Occurrences:
- packages/app-builder-lib/src/targets/linux/snap/snapcraftBuilder.ts:132-162 (executeWithRetry; called at 267)
- packages/builder-util-runtime/src/httpExecutor.ts:429-441 (static retryOnServerError)
- packages/electron-updater/src/providers/GenericProvider.ts:27-47 (getLatestVersion loop with ECONNREFUSED predicate)

Proposed helper: reuse existing `retry<T>(task, { retries, interval, backoff?, shouldRetry?, cancellationToken? })`. Optionally add a small predicate factory `retryOnErrorMatch(patterns: string[]): (e) => boolean`. `retryOnServerError` should internally delegate to `retry`.

Target rationale: `retry` and `retryOnServerError` already live in builder-util-runtime (pure, runtime-safe). snapcraftBuilder already imports `sleep` from builder-util-runtime, so importing `retry` pulls nothing new into the leaf.

Risk/notes: `retryOnServerError` is a public static method consumed externally (electron-publish keygenPublisher.ts:114, bitbucketPublisher.ts:44), so it must REMAIN a public method that internally delegates to `retry` — do not delete it. GenericProvider's per-call `setTimeout` backoff has attempt-0 zero-delay semantics to preserve. Effort M, risk med.

### download-to-file promise skeleton

What's duplicated: both methods build `{ headers: options.headers || undefined, redirect: "manual" }`, run `configureRequestUrl(url, requestOptions)` then `configureRequestOptions(requestOptions)`, and wrap a single `cancellationToken.createPromise(...)` calling `this.doDownload(requestOptions, { destination, options, onCancel, callback, responseHandler }, 0)`. The base `downloadToBuffer` sets destination=null + chunk-accumulating responseHandler; the subclass `download` sets a real destination + responseHandler=null. The request-prep + createPromise + doDownload skeleton is the duplicated part.

Occurrences:
- packages/builder-util-runtime/src/httpExecutor.ts:263-304 (downloadToBuffer)
- packages/electron-updater/src/electronHttpExecutor.ts:26-52 (download)

Proposed helper: `protected downloadToFile(url: URL, destination: string, options: DownloadOptions): Promise<string>` on the base abstract HttpExecutor; ElectronHttpExecutor.download collapses to a one-line `super.downloadToFile(...)` delegation.

Target rationale: HttpExecutor is the abstract base in builder-util-runtime that already owns downloadToBuffer + doDownload + redirect/timeout machinery; electron-updater depends only on builder-util-runtime. createWriteStream is already imported/used in httpExecutor.ts, so the leaf stays packaging-dep-free.

Risk/notes: ElectronHttpExecutor.download CANNOT be removed — it is the public API consumed by Deb/Pacman/Rpm/Mac/AppImage/Nsis updaters; it collapses to a one-line super delegation, not a deletion. Only ~15 skeleton lines deduped across 2 callers, so value is modest; effort closer to S than M. Low urgency.

---

## (2) Target: builder-util

Packaging-flow shared utilities. These need node/packaging-flow types (InvalidConfigurationError, exec) that are NOT runtime-safe, so they belong in builder-util, not the leaf.

| Pattern | Occurrences | Proposed helper | Effort | Risk | Confidence |
|---|---|---|---|---|---|
| orNullIfFileNotExist / orIfFileNotExist consolidation | 3 | use existing builder-util orNullIfFileNotExist/orIfFileNotExist; delete duplicates | S | low | 0.95 |
| snapcraftBuilder promisify(exec) -> builder-util exec | 4 | use existing exec(command, args, options) | S | med | 0.82 |
| "Version must not start with v" guard | 2 | assertVersionHasNoVPrefix(version: string): void | S | low | 0.82 |

### orNullIfFileNotExist / orIfFileNotExist consolidation (MERGED finding)

What's duplicated: the ENOENT/ENOTDIR-swallowing promise wrappers. builder-util/src/promise.ts is canonical and barrel-exported, yet app-builder-lib/src/util/config/load.ts defines its own byte-identical copies and re-exports `orNullIfFileNotExist` via indexInternal.ts. The same package sources the same helper two ways: cacheManager.ts, repositoryInfo.ts, macPackager.ts, packager.ts, platformPackager.ts import from "builder-util", while config/load.ts (and consumers config.ts, electronVersion.ts) use the local copy. electron-builder/src/cli/migrate-schema.ts adds a third inline reimplementation (`readFileSafe`).

Occurrences:
- packages/builder-util/src/promise.ts:39-50 (canonical, barrel-exported via util.ts)
- packages/app-builder-lib/src/util/config/load.ts:64-75 (byte-identical local copy; re-exported by indexInternal.ts:39)
- packages/electron-builder/src/cli/migrate-schema.ts:601-603 (inline readFileSafe: `fs.readFile(p,"utf8").catch(e => (e.code==="ENOENT"||e.code==="ENOTDIR" ? null : Promise.reject(e)))`)

Proposed change: delete the config/load.ts copies; import `{ orNullIfFileNotExist, orIfFileNotExist }` from "builder-util". Replace migrate-schema `readFileSafe` with `orNullIfFileNotExist(fs.readFile(p, "utf8"))`. Redirect local importers (config.ts, electronVersion.ts) and the indexInternal.ts:39 re-export to source from builder-util.

Target rationale: canonical helper already lives in builder-util/src/promise.ts and is consumed by other app-builder-lib files. Both app-builder-lib and electron-builder already depend on builder-util. Not builder-util-runtime: electron-updater handles ENOENT inline and does not consume these (grep returned zero hits).

Risk/notes: the public re-export in indexInternal.ts (`export { loadEnv, orNullIfFileNotExist } from "./util/config/load.js"`) must be preserved/redirected so external consumers of app-builder-lib's indexInternal are not broken — either keep load.ts re-exporting the imported symbol or update that line to source from builder-util. No circular-import risk (load.ts already imports `log` from "builder-util"). Effort S, risk low. Do this early.

### snapcraftBuilder promisify(exec) -> builder-util exec

What's duplicated: snapcraftBuilder.ts declares its own `const execAsync = util.promisify(childProcess.exec)` and uses it for three snapcraft CLI invocations with shell-command strings, gaining none of builder-util `exec`'s debug logging, env filtering, password redaction, or ExecError wrapping. snapStorePublisher.ts already uses the canonical `exec("snapcraft", ["--version"])` for the identical --version need — proving genuine duplication.

Occurrences:
- packages/app-builder-lib/src/targets/linux/snap/snapcraftBuilder.ts:15 (declaration), 47-51 (expand-extensions), 294 (--version), 339 (whoami)
- packages/electron-publish/src/snapStorePublisher.ts:88 (already uses canonical exec — the consolidation target)

Proposed change: delete the local `util.promisify(childProcess.exec)`; convert the three call sites to array-arg exec, e.g. `exec("snapcraft", ["expand-extensions"], { cwd: workDir, timeout: 30000 })`.

Target rationale: `exec` already lives in builder-util and is the project-wide standard; snapcraftBuilder.ts already imports spawn/log from builder-util. No new helper warranted.

Risk/notes: NOT fully mechanical for the expand-extensions site — that code reads `error.stderr` / `error.stdout` as discrete fields (lines 53-57), whereas builder-util's exec rejects with an ExecError that folds stdout/stderr into the message string. Error-message reconstruction there needs care. Realistic effort S-M; risk med for that one site.

### "Version must not start with v" guard

What's duplicated: both publisher constructors validate the version with `if (version.startsWith("v")) throw new InvalidConfigurationError(\`Version must not start with "v": ${version}\`)`. Identical logic, error type, and message string.

Occurrences:
- packages/electron-publish/src/gitHubPublisher.ts:67-69
- packages/electron-publish/src/gitlabPublisher.ts:58-60

Proposed helper: `assertVersionHasNoVPrefix(version: string): void` (throws InvalidConfigurationError when version starts with "v") in builder-util.

Target rationale: both call sites are in electron-publish, which depends on builder-util. The guard needs InvalidConfigurationError (already exported from builder-util and already imported by both publishers). Not runtime-safe-only, so not the leaf.

Risk/notes: trivial 3-line guard; extraction value is mainly DRYing the exact message string. Marginal but legitimate. Effort S, risk low.

---

## (3) Target: app-builder-lib/util

App-builder-lib-internal logic duplicated across its subdirs (or consumed by downstream electron-builder which already imports from app-builder-lib). Depends on app-builder-lib-only types, so must NOT be pushed to builder-util.

| Pattern | Occurrences | Proposed helper | Effort | Risk | Confidence |
|---|---|---|---|---|---|
| withFileLock generalization (proper-lockfile) | 3 | generalize existing withLock -> withFileLock(lockPath, task, options?) | M | med | 0.55 |
| target-spec parser (processTargets / commonArch) | 2 | addTargetsForPlatform(targets, platform, types, resolveDefaultArchs, emptyTypesValue) | M | med | 0.70 |
| project package.json Lazy tolerant-read | 2 | createProjectMetadataLazy(projectDir): Lazy<Record<string,any> \| null> | S | low | 0.72 |
| write app-update.yml (serializeToYaml + write) | 3 | writeAppUpdateYaml(resourcesDir, publishConfig): Promise<void> | S | low | 0.78 |

### write app-update.yml (serializeToYaml + write)

What's duplicated: three call sites guard on `publishConfig != null` then write `path.join(<resourcesDir>, "app-update.yml")` with `serializeToYaml(publishConfig)`. The filename literal, the serialize call, and the path.join are repeated identically (outputFile vs writeFile is immaterial — the resources dir already exists in every case).

Occurrences:
- packages/app-builder-lib/src/targets/linux/appimage/AppImageTarget.ts:74-76
- packages/app-builder-lib/src/publish/PublishManager.ts:116-119
- packages/app-builder-lib/src/targets/linux/FpmTarget.ts:176-181

Proposed helper: `async function writeAppUpdateYaml(resourcesDir: string, publishConfig: PublishConfiguration): Promise<void>` in app-builder-lib (near updateInfoBuilder.ts or PublishManager).

Target rationale: all sites are inside app-builder-lib and depend on getAppUpdatePublishConfiguration / PublishConfiguration types defined there. Encodes the app-update.yml filename contract, too domain-specific for builder-util; electron-updater only READS this path, never writes it.

Risk/notes: FpmTarget also writes a sibling "package-type" file (target-specific) — the helper covers only the app-update.yml write, leaving that extra line in place. Effort S, risk low.

### project package.json Lazy tolerant-read

What's duplicated: `new Lazy(() => orNullIfFileNotExist(readJson(path.join(projectDir, "package.json"))))` — the same Lazy-wrapped tolerant read seeds getConfig's packageMetadata in two places.

Occurrences:
- packages/app-builder-lib/src/util/config/config.ts:45
- packages/electron-builder/src/cli/install-app-deps.ts:54

Proposed helper: `createProjectMetadataLazy(projectDir: string): Lazy<Record<string, any> | null>` exported from app-builder-lib (config/packageMetadata util).

Target rationale: both call sites feed app-builder-lib's getConfig; the electron-builder CLI already imports getConfig and orNullIfFileNotExist from app-builder-lib/internal. Uses readJson (fs-extra) + Lazy (lazy-val), so not eligible for the leaf.

Risk/notes: the orNullIfFileNotExist used here currently resolves to the app-builder-lib local copy — after the builder-util consolidation (item above), it will resolve to builder-util. Sequence this AFTER the orNullIfFileNotExist consolidation. Effort S, risk low.

### target-spec parser (processTargets / commonArch)

What's duplicated: a nested `processTargets(platform, types)` with nested `commonArch`, lazy `archToType` map creation per Platform, an empty-types branch, and an identical suffix-parse tail: `const suffixPos = type.lastIndexOf(":"); if (suffixPos > 0) addValue(archToType, archFromString(type.substring(suffixPos + 1)), type.substring(0, suffixPos)); else for (const arch of commonArch(true)) addValue(archToType, arch, type)`. Two divergent points: (1) commonArch seeding — packager.ts returns empty/current set, builder.ts seeds from CLI flags (args.x64/armv7l/arm64/ia32/universal); (2) the empty-types branch — builder.ts uses `args.dir ? [DIR_TARGET] : []`, packager.ts uses empty [].

Occurrences:
- packages/app-builder-lib/src/packager.ts:185-214
- packages/electron-builder/src/builder.ts:39-85

Proposed helper: `addTargetsForPlatform(targets: Map<Platform, Map<Arch, Array<string>>>, platform: Platform, types: Array<string>, resolveDefaultArchs: () => Array<Arch>, emptyTypesValue: () => Array<string>): void` in app-builder-lib (a targetFactory util).

Target rationale: produced Map keys on Platform (defined in app-builder-lib core); Arch/archFromString/addValue come from builder-util. Pushing to builder-util would invert the dependency (it cannot import Platform). electron-builder already depends on app-builder-lib. Not electron-updater-relevant.

Risk/notes: BOTH the seeding AND empty-types policies diverge, so the helper needs two injected callbacks — that callback-heavy shape can be as much noise as the duplication it removes. Genuinely-shared tail is only ~8 lines across 2 call sites. Borderline worth-extracting M-effort change; do it only if the callback shape stays clean.

### withFileLock generalization (proper-lockfile)

What's duplicated: the ~6-line acquire/try/finally scaffolding with identical `{ retries: { retries: 100, minTimeout: 1000, maxTimeout: 5000 }, stale: 120000 }` config + `release().catch(err => log.warn(...))` finalizer. The private `withLock` in toolsetLock.ts already encapsulates this config.

Occurrences:
- packages/app-builder-lib/src/util/toolsetLock.ts:11-22 (existing private withLock)
- packages/app-builder-lib/src/toolsets/custom.ts:156-223 (extractArchive)
- packages/app-builder-lib/src/util/electronGet.ts:172-247 (extractArchive)
- packages/app-builder-lib/src/util/electronGet.ts:427-494 (downloadAndExtract; adds realpath: false)
- (NOTE: a 5th site at electronGet downloadArtifactToFile ~283-355 uses a DIFFERENT config — minTimeout:500, stale:600000 — and is a separate parametrization, NOT covered here)

Proposed helper: generalize the existing private `withLock` to `export async function withFileLock<T>(lockPath: string, task: () => Promise<T>, options?: { stale?: number; realpath?: boolean; ensureFile?: boolean }): Promise<T>`.

Target rationale: proper-lockfile is packaging-only and must stay out of builder-util-runtime; all consumers are within app-builder-lib, and the helper already lives in app-builder-lib/src/util/toolsetLock.ts.

Risk/notes: existing `withLock` is NOT a drop-in — it locks a NAMED sentinel lock FILE and pre-writes it (`writeFile(lockFile, '', { flag: 'a' })`), whereas the extract sites lock an EXISTING DIRECTORY directly (no sentinel write) and need `realpath: false`. The helper needs real generalization (skip sentinel write, accept realpath) before the sites can call it. Genuine but low value (~6 saved lines x3). Lowest confidence in this group (0.55) — extract only if the generalization is clean.

---

## (4) Local-only / do-not-extract

Genuine duplication but confined to a single file/class/package, or so trivial that a cross-package (or even local) helper would be over-engineering. Recommendations vary; several are explicitly "do NOT extract".

| Pattern | Occurrences | Recommendation | Effort | Risk | Confidence |
|---|---|---|---|---|---|
| Inline ELECTRON_BUILDER_OFFLINE env check | 3 (7 sites) | use existing isOfflineModeEnabled() (consolidate, fixes a bug) | S | low | 0.90 |
| 404 channel-file-not-found catch wrapper | 3 | channelFileNotFoundError(channelFile, url, e) in Provider base | S | low | 0.82 |
| latest-version-not-found catch wrapper | 5 | local helper composing errorToString; low value | S | low | 0.70 |
| publisher token resolve+validate | 2 real (+2 superficial) | local resolveAndValidatePublishToken in electron-publish; thinner than framed | M | med | 0.60 |
| getElectronVersionFromInstalled / getElectronPackage loop | 2 | intra-file: delegate one to the other | S | low | 0.74 |
| snap template-arch ternary (x64?amd64:armhf) | 2 | compute once, pass through opts; do NOT extract a helper | S | low | 0.75 |
| snap yaml.dump + write snapcraft.yaml | 3 (2 independent) | optional thin local helper; LOW value, OK to leave as-is | S | low | 0.55 |
| mac resources-dir ternary | 2 | do NOT extract — premise partly false (staging vs final name) | M | med | 0.40 |
| strip leading "v" from version/tag | 2 | local private stripVPrefix in electronVersion.ts, or skip | S | low | 0.50 |
| readJson(package.json).catch(()=>null) | 5 | NEW readJsonOrNull (catch-ALL) — NOT orNullIfFileNotExist; behavior trap | M | med | 0.40 |

### Inline ELECTRON_BUILDER_OFFLINE env check (consolidation — also a bug fix)

What's duplicated: `process.env.ELECTRON_BUILDER_OFFLINE !== "true"` gates network operations inline, bypassing the existing `isOfflineModeEnabled()` (app-builder-lib/src/util/flags.ts), which is built on `isEnvTrue` and ALSO treats "1" and "" as true.

Occurrences (3 files, 7 sites):
- packages/app-builder-lib/src/codeSign/win/signtoolBaseSignManager.ts:465/480/488/513
- packages/app-builder-lib/src/codeSign/win/hsmSignManager.ts:35/50
- packages/app-builder-lib/src/codeSign/win/pkcs11SignManager.ts:76

Recommendation: replace each inline check with `!isOfflineModeEnabled()` (import from ../../util/flags.js). Pure consolidation onto the existing helper.

Risk/notes: this is a BEHAVIOR CHANGE, not a no-op refactor: with `ELECTRON_BUILDER_OFFLINE=1`, the helper treats offline as enabled while the inline `!== "true"` checks do NOT. Replacing fixes that divergence — confirm the helper's broader semantics ("1"/"" as true) are intended for these signing gates before merging. None of the 3 sign managers currently import flags.ts.

### 404 channel-file-not-found catch wrapper

What's duplicated: byte-identical `} catch (e: any) { if (e instanceof HttpError && e.statusCode === 404) { throw newError(\`Cannot find ${channelFile} in the latest release artifacts (${url}): ${e.stack || e.message}\`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") }` across three providers (only the interpolated URL var name differs).

Occurrences:
- packages/electron-updater/src/providers/GitHubProvider.ts:149-151
- packages/electron-updater/src/providers/GitLabProvider.ts:125-127
- packages/electron-updater/src/providers/PrivateGitHubProvider.ts:47-49

Recommendation: `channelFileNotFoundError(channelFile: string, url: string, e: unknown): Error` in the electron-updater Provider base/util (which already imports newError, HttpError). Local to electron-updater — NOT cross-package.

Risk/notes: GenericProvider.ts:32 shares the error code + fallback but uses a materially different message — do not fold it in. Composes with the proposed errorToString helper for the suffix. Effort S, risk low.

### latest-version-not-found catch wrapper

What's duplicated: the error code `ERR_UPDATER_LATEST_VERSION_NOT_FOUND` + the `${e.stack || e.message}` suffix across five providers. Two true identical pairs (Bitbucket==Keygen; GitHub==PrivateGitHub); GitLab diverges in wording and reuses the code at two more sites with different messages.

Occurrences:
- packages/electron-updater/src/providers/BitbucketProvider.ts:34-35
- packages/electron-updater/src/providers/KeygenProvider.ts:42-43
- packages/electron-updater/src/providers/GitHubProvider.ts:201-202
- packages/electron-updater/src/providers/PrivateGitHubProvider.ts:87 (identical to GitHub — was missed in the original count)
- packages/electron-updater/src/providers/GitLabProvider.ts:76-77 (DIFFERENT wording: "Unable to find latest release on GitLab")

Recommendation: the only true constant is the error code + suffix, not one message string. A single message-fixing helper would force GitHub/GitLab to lose distinct wording. The strongest dedupe is just the suffix via errorToString. Low value — keep local-only at most; do not over-engineer a template helper.

### publisher token resolve+validate

What's duplicated: the FULL 4-step pattern (resolve-from-env + isEmptyOrSpaces guard + trim + isTokenCharValid with hashSensitiveValue message) appears in only 2 sites; Keygen and Bitbucket share only the trivial 2-line empty-guard.

Occurrences:
- packages/electron-publish/src/gitHubPublisher.ts:51-63 (3-env precedence GITHUB_RELEASE_TOKEN/GH_TOKEN/GITHUB_TOKEN — not a single env)
- packages/electron-publish/src/gitlabPublisher.ts:39-51 (single GITLAB_TOKEN, canonical structure)
- packages/electron-publish/src/keygenPublisher.ts:96-99 (guard only; env-only, no info.token fallback)
- packages/electron-publish/src/bitbucketPublisher.ts:21-26 (guard only; also resolves a parallel username)

Recommendation: if extracted, `resolveAndValidatePublishToken(opts)` as a PRIVATE helper inside electron-publish (e.g. electron-publish/src/tokenAuth.ts) — publish-specific error wording and char policy, not for builder-util. But the duplication is thinner than framed (2 meaningful sites with divergent env-resolution shapes, 2 superficial guard-only). Modest value; effort/risk likely lower than M/med.

### Other local-only items (brief)

- getElectronVersionFromInstalled / getElectronPackage (electronVersion.ts:26-37 and 39-50): two adjacent functions loop the same electronPackages list with identical read+ENOENT-guard scaffolding, differing only in return value and warn text. Collapse `getElectronVersionFromInstalled` to `return (await getElectronPackage(projectDir))?.version ?? null` — intra-file only. Cosmetic warn-text unification is acceptable. Saves ~6 lines.
- snap template-arch ternary (coreLegacy.ts:264 and 282): identical `snapArch === Arch.x64 ? "amd64" : "armhf"` in two private methods of one class; snapArch is already plumbed via opts. Recommendation: compute once and pass through opts; do NOT extract a cross-package helper. Borderline even for a local private method.
- snap yaml.dump + write snapcraft.yaml (core24.ts:59-60, core24.ts:133-134, coreCustom.ts:53-54): only the dump call is identical; the write differs (writeFile vs outputFile). Two of three sites are in the SAME core24 method (the second is a deliberate re-write after mutating appPart.organize). SNAPCRAFT_YAML_OPTIONS (lineWidth -1) is intentionally different from serializeToYaml (lineWidth 8000), so it must NOT route through builder-util. A thin local writeSnapcraftYaml helper is reasonable but LOW value — equally defensible to leave as-is. Do not prioritize.
- mac resources-dir ternary (ElectronFramework.ts:250-252, platformPackager.ts:397-402, getMacOsResourcesDir:721-723): RECOMMEND NOT EXTRACTING. The verdict refuted the core premise: the two inline sites build from `framework.distMacOsAppName` (PRE-rename staging name), while getMacOsResourcesDir builds from `appInfo.productFilename` (POST-rename final name) — different paths at different lifecycle stages. Only 2 genuine same-logic sites (a thin ternary), and the "drift risk" argument is weak since the helpers legitimately differ. The more valuable refactor (unifying the distMacOsAppName-vs-productFilename naming) is out of scope.
- strip leading "v" from version/tag (electronVersion.ts:80 and 93): two `s.startsWith("v") ? s.substring(1) : s` idioms inside computeElectronVersion. The cross-package sharing rationale is overstated — electron-updater's GitHubProvider does NOT strip "v" (its regex simply doesn't capture it), and electron-publish REJECTS a leading "v" rather than stripping. So only the 2 app-builder-lib sites would consume it. Recommendation: a local private stripVPrefix in electronVersion.ts, or skip. Do NOT promote to the runtime leaf.
- readJson(package.json).catch(() => null) (pnpmNodeModulesCollector.ts:200/288-289/362/376, moduleManager.ts:67 — 5 sites): RECOMMEND a NEW narrow helper, NOT consolidation onto orNullIfFileNotExist. The collector deliberately catches ALL errors (documented at lines 311-312/318-319/371-373: tolerating unreadable cross-drive Windows junctions whose failures are NOT ENOENT/ENOTDIR). orNullIfFileNotExist rethrows non-ENOENT errors and would REGRESS this behavior. If extracted, make a local `readJsonOrNull` (catch-all) in node-module-collector; promoting to builder-util is borderline given single-subdir usage. Behavior trap — do not mechanically replace.

---

## Recommended sequencing

1. SAFE PURE CONSOLIDATIONS FIRST (no behavior change, highest confidence): (a) delete packages/builder-util/src/deepAssign.ts (dead duplicate, no importers); (b) consolidate orNullIfFileNotExist/orIfFileNotExist onto builder-util — delete the config/load.ts copies, redirect indexInternal.ts:39 re-export and local importers (config.ts, electronVersion.ts), and replace migrate-schema readFileSafe. These touch no runtime behavior and unblock dependent items.
2. CROSS-PACKAGE LEAF PROMOTIONS (byte-identical copies; do as a pair while builder-util-runtime is open): promote hashFile and getGitlabAuthHeaders into builder-util-runtime, delete the private copies, and add re-exports. No behavior change, high confidence.
3. APP-BUILDER-LIB/UTIL BATCH (group by package to minimize churn; do AFTER step 1 so orNullIfFileNotExist resolves to builder-util): createProjectMetadataLazy, then writeAppUpdateYaml, then the target-spec parser, then withFileLock generalization. Keep these in one PR/sequence to localize app-builder-lib churn.
4. BUILDER-UTIL PACKAGING HELPERS: assertVersionHasNoVPrefix (trivial), then snapcraftBuilder exec migration (handle the expand-extensions error-field reconstruction carefully).
5. BEHAVIOR-CHANGE ITEMS LAST, EACH ITS OWN REVIEWABLE PR: errorToString (26 sites, fallback-semantics change — migrate in batches per package), the hand-rolled retry consolidation (keep retryOnServerError as a public delegating method; preserve GenericProvider attempt-0 timing), the ELECTRON_BUILDER_OFFLINE consolidation (intentionally changes "1"/"" semantics — flag for reviewer sign-off), and the downloadToFile base-class skeleton (verify the public ElectronHttpExecutor.download API is preserved as a one-line delegation).
6. LOCAL-ONLY / OPTIONAL: the electron-updater provider error-wrapper helpers (channelFileNotFoundError; the latest-version wrapper only as an errorToString consumer), the electronVersion intra-file delegation, snap template-arch / yaml-write tidy-ups, and the readJsonOrNull catch-all helper. Recommend SKIPPING the mac resources-dir ternary and the strip-v-prefix promotion entirely (low value / premise issues). Do these opportunistically, not as a dedicated effort.