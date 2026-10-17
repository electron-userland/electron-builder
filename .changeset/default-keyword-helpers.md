---
"builder-util": patch
"app-builder-lib": patch
---

fix: `fileOptions.excludedExts` set by a later layer (`extends` child, programmatic or `-c` configuration, `mas` / `masDev`) replaces the earlier list instead of being merged with it, and a `mas` / `masDev` list also applies to the copied `node_modules`; the `"default"` / `"!x"` list resolution is shared between the build, the snap/fpm `"default"` expansion and `migrate-schema`; a `files` pattern that names an excluded extension (e.g. `native/addon.pdb`) now re-includes only the files it matches instead of that whole extension; `fileOptions.excludedExts` also accepts a single string (e.g. `-c.fileOptions.excludedExts=default`).
