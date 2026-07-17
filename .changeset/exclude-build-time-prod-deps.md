---
"app-builder-lib": major
"electron-builder": major
---

feat: build-time packages (`electron`, `electron-builder`) listed in `dependencies` are now excluded from the packaged app (logged once) instead of failing the build, configurable via the new `ignoredProductionDependencies` option. BREAKING: removed the `ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY` env var — `electron-builder` is excluded by default; drop a name from `ignoredProductionDependencies` to bundle it.
