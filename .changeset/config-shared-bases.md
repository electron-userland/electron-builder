---
"app-builder-lib": minor
"builder-util-runtime": patch
---

refactor: declare the options AppX/MSIX, MSI/MSI-wrapped and the snap core18-22/core24 bases share once (new exported `CommonAppxOptions`, `CommonWixOptions`, `CommonSnapOptions`), declare `channel` once on `PublishConfiguration`, move the root-only `electronGet` / `electronBranding` / `electronVersion` / `writeEffectiveConfig` / `extends` / `electronDist` into `CommonConfiguration`, and document `publish`, `artifactName`, `oneClick`, `perMachine` and `buildUniversalInstaller` once; the configuration keeps every key, and `msiWrapped` now also accepts `additionalLightArgs`, which light.exe already received
