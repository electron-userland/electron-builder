---
"app-builder-lib": patch
---

fix: don't mutate shared UpdateInfo.files when applying GitHub safeArtifactName, which leaked the GitHub-safe file name into other publish providers' update metadata
