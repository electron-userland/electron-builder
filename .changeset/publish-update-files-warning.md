---
"app-builder-lib": patch
"electron-builder": patch
---

feat(publish): `electron-builder publish -f` warns when it uploads update info (`latest*.yml`, a channel's `.yml`) or a file it lists: it states the rules electron-updater applies to them once, and names each uploaded file whose `size` or `sha512` differs from its update info, and update info that uses YAML aliases; `electron-builder verify` shares the same file comparison, now also checks nsis-web `packages`, says whether a same-named file's size or sha512 is stale, and fails update info that uses YAML aliases or is not valid YAML
