---
"app-builder-lib": patch
---

chore: move the manual node module traversal to the separate class. Add `env: { COREPACK_ENABLE_STRICT: "0", ...process.env },` to allow `npm list` to work across environments.
