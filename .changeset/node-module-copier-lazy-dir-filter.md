---
"app-builder-lib": patch
---

fix: evaluate the node_modules directory filter lazily and only once per directory instead of a synchronous `lstat` per file; await async `onNodeModuleFile` hook results instead of treating the pending Promise as truthy (#10169)
