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
