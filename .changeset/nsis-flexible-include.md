---
"app-builder-lib": minor
---

feat(nsis): more flexible custom script includes (#9112)

- `nsis.include` (and `nsisWeb.include`) now also accepts an array of paths — every entry is resolved relative to the build resources directory first, then the project directory, and all scripts are included in order.
- The build resources directory is now always registered via `!addincludedir`, so custom scripts can `!include` sibling files by name even when the main include is auto-discovered.
- The portable target now honors an explicitly set `portable.include` (string or array). It still does **not** auto-discover `build/installer.nsh`, so existing portable builds are unaffected.
- Both `build/x86-unicode` and `build/x86-ansi` user plugin directories are now registered (each when it exists) instead of only the one matching the `unicode` option, matching the documented behavior.
- Fixed the `!ifmacrodef customInstallmode` case mismatch in `multiUserUi.nsh` to match the documented `customInstallMode` macro name (NSIS macro-name matching is case-insensitive, so this is a consistency fix).
