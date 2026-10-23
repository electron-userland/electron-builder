---
"app-builder-lib": minor
---

feat(app-builder-lib): warn at build start when a `process.env` variable removed in v26 → v27 is still set

- Added `warnOnRemovedEnvVars()` (registry in `app-builder-lib/src/util/removedEnvVars.ts`), invoked once per build from the `Packager` constructor so both the CLI and programmatic `build()` API surface the same guidance. When a removed variable is still present in the environment it is otherwise silently ignored — this logs a one-time deprecation warning naming the variable and its replacement.
- Covers the removed toolset-path overrides (`APPIMAGE_TOOLS_PATH`, `MKSQUASHFS_PATH`, `LINUX_TOOLS_MAC_PATH`, `CUSTOM_FPM_PATH`, `ELECTRON_BUILDER_NSIS_DIR`, `ELECTRON_BUILDER_NSIS_RESOURCES_DIR`, `CUSTOM_NSIS_RESOURCES`, `ELECTRON_BUILDER_WINE_TOOLSET_DIR`, `ELECTRON_BUILDER_7ZIP_PATH`, `ELECTRON_BUILDER_ICONS_TOOLSET_DIR`, `ELECTRON_BUILDER_OSSL_SIGNCODE_PATH`, `ELECTRON_BUILDER_RCEDIT_PATH`, `ELECTRON_BUILDER_WINDOWS_KITS_PATH`, `SIGNTOOL_PATH`) → `toolsets.*` / `win.sign`; the `USE_SYSTEM_*` toggles; `ELECTRON_BUILDER_BINARIES_ALLOW_HTTP` → `ELECTRON_BUILDER_DANGEROUSLY_ALLOW_HTTP`; `CI_BUILD_TAG` → `CI_COMMIT_TAG`; and `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` → `ignoredProductionDependencies`.
- Internal/test-only variables (`JEST_WORKER_ID`, `TEST_SET_BABEL_PRESET`) and `npm_lifecycle_event` (set by npm for every script) are intentionally excluded from the runtime scan.
- Migration docs: filled the previously undocumented removed vars in the v27 breaking-changes catalogue (the toolset-path family plus `MKSQUASHFS_PATH`), added a "Replace with" column, and documented the `ELECTRON_BUILDER_BINARIES_ALLOW_HTTP` rename and the removed `npm run release` implicit-publish behavior.
