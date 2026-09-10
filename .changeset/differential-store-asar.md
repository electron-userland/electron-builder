---
"app-builder-lib": minor
---

feat(nsis): opt-in `differentialPackageStoreAsar` — store `resources/app.asar` uncompressed (7-Zip `Copy`) in the differential-aware app package so a small app-code change costs a proportionally small differential download instead of re-downloading the entire recompressed asar (measured on a ~32 MB asar: 0.2% instead of 100% for a one-line change). Backed by a generic `ArchiveOptions.storedPaths` in `archive()`.
