---
"app-builder-lib": patch
"builder-util": patch
---

fix: Windows signing now reads `ELECTRON_BUILDER_OFFLINE` through the shared offline-mode check, so `1` skips the timestamp server the same way `true` does; an empty value still keeps timestamping on, and the build warns once when it signs without a timestamp
