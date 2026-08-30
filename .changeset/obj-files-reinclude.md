---
"app-builder-lib": major
"electron-builder": major
---

feat: allow including default-excluded files (e.g. Wavefront `.obj`) by adding an explicit `files` glob such as `**/*.obj` (fixes #6126). BREAKING: removed the `disableDefaultIgnoredFiles` option — `electron-builder migrate-schema` strips it automatically; re-include specific files via `files` globs instead.
