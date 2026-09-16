---
"app-builder-lib": minor
---

feat(nsis): `differentialPackage: "store-asar"` — store `resources/app.asar` uncompressed (7-Zip `Copy`) in the differential-aware app package so a small app-code change costs a proportionally small differential download instead of re-downloading the entire recompressed asar (measured on a ~32 MB asar: 0.2% instead of 100% for a one-line change). `nsis.differentialPackage` is widened to `boolean | "compressed" | "store-asar"`: `false` disables differential support as before, `"store-asar"` opts into the stored asar, and everything else (`true`, `"compressed"`, unset) keeps today's fully compressed differential package. Backed by a generic `ArchiveOptions.storedPaths` in `archive()`.
