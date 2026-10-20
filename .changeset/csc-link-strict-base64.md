---
"builder-util": major
"app-builder-lib": major
---

feat(signing)!: a base64 `CSC_LINK` / `WIN_CSC_LINK` / `CSC_INSTALLER_LINK` / `SNAP_CSC_LINK` / `cscLink` value must be valid standard base64 (line breaks are ignored) — one with surrounding quotes, URL-safe characters or other stray characters, which was decoded leniently into a corrupt certificate before, now fails with an `InvalidConfigurationError` that does not print the value; adds the strict `decodeStrictBase64` helper to builder-util.
