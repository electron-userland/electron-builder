---
"app-builder-lib": patch
---

fix: Windows signing now reads `ELECTRON_BUILDER_OFFLINE` through the shared offline-mode check, so `1` skips the timestamp server the same way `true` does, matching electron-builder's other boolean environment variables
