---
"app-builder-lib": major
"electron-builder": major
"builder-util": patch
---

feat!: add `fileOptions.excludedExts` (root and per platform, a list or a single string such as `-c.fileOptions.excludedExts=default`) to configure the file extensions excluded from the app files and the copied `node_modules` — `"default"` is the built-in list, which now includes `pdb`, any other entry adds an extension, and `"!ext"` removes one (a list of removals only, such as `["!pdb"]`, is rejected: write `["default", "!pdb"]`; an invalid list fails the build when the configuration is validated, at the root and in every platform section); a later layer's list replaces an earlier one instead of being merged with it (`extends` child, programmatic or `-c` configuration, platform section, `mas` / `masDev`); a `files` pattern that names an excluded extension (e.g. `native/addon.pdb`) re-includes only the files it matches. BREAKING: removed the `includePdb` option — `electron-builder migrate-schema` rewrites `includePdb: true` to `"fileOptions": { "excludedExts": ["default", "!pdb"] }` and `includePdb: false` to `"fileOptions": { "excludedExts": ["default"] }`.
