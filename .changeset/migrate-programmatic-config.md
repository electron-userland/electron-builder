---
"electron-builder": minor
---

feat(cli): `migrate-schema` now auto-migrates programmatic JS/TS configs

`electron-builder migrate-schema` previously printed manual steps for programmatic configs (`.js`/`.cjs`/`.mjs`/`.ts`). It now rewrites them in place via an AST-located text codemod that applies the same v26→v27 transforms as static configs while preserving comments, imports, functions, and formatting. Falls back to manual steps when `typescript` is not installed or the config cannot be statically reduced to a single object literal (dynamic function bodies, spreads, computed keys).
