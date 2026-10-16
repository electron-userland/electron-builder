---
"app-builder-lib": patch
---

fix(pnpm-collector): find nested dependencies under the workspace root when the app is a package in a pnpm hoisted (`nodeLinker: hoisted`) workspace, instead of packaging an out-of-range hoisted copy
