---
"app-builder-lib": major
"electron-builder": major
---

feat!: add `fileOptions.excludedExts` (root and per platform) to configure the file extensions excluded from the app files and the copied `node_modules` — `"default"` is the built-in list, which now includes `pdb`, and `"!ext"` removes an extension. BREAKING: removed the `includePdb` option — `electron-builder migrate-schema` rewrites `includePdb: true` to `"fileOptions": { "excludedExts": ["default", "!pdb"] }` and removes `includePdb: false`.
