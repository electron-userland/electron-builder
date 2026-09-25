---
"app-builder-lib": patch
---

fix: prevent infinite recursion in node module collection when a package depends on itself (e.g. `libsql@0.3.19` via `@prisma/adapter-libsql` -> `@libsql/client`), which caused npm-based builds to hang at `searching for node modules` and eventually crash with a JavaScript heap out-of-memory error (#10068)
