---
"app-builder-lib": patch
---

fix: classify missing declared-optional dependencies (e.g. `fsevents` on Linux/Windows) as missing optional dependencies in the pnpm collector, instead of warning `dependency not found on disk`
