---
"app-builder-lib": patch
---

chore: Serialize concurrent downloads of the same artifact across vitest workers to prevent `@electron/get`'s non-atomic `putFileInCache` (remove + move) from racing with a concurrent reader.

