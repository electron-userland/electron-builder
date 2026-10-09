---
"app-builder-lib": patch
---

fix: reject a collected node_modules tree unless every declared production dependency is present or reported as legitimately absent, so a partial tree falls back to traversal
