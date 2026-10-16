---
"app-builder-lib": patch
"electron-updater": patch
---

refactor: once-only build and updater warnings use `log.once` / `log.limit` (and the updater's per-instance counter) instead of hand-rolled flags and sets; a concurrently resolved NSIS ProgID notice can no longer print twice
