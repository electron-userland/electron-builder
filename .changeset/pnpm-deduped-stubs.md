---
"app-builder-lib": patch
---

fix(pnpm): collect packages that pnpm 10.29.3+ `pnpm list` only prints as deduped stubs, so they and their dependencies are no longer missing from app.asar (#10253)
