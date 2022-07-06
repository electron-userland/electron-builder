---
"app-builder-lib": patch
---

Fix issue where, upon publishing a new release, electron-builder would attempt to create the same release for each artifact in parallel, resulting in conflict errors.
