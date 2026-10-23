---
"app-builder-lib": minor
---

feat: add `writeEffectiveConfig` to control writing `builder-effective-config.yaml`. Before, the file was only written for local interactive builds, so CI steps could not read the resolved configuration (e.g. the detected `electronVersion`). Set `true` to always write it or `false` to never write it; the default is unchanged.
