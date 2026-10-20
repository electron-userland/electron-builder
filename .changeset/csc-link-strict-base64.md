---
"builder-util": patch
"app-builder-lib": patch
---

fix(signing): a base64 `CSC_LINK` / `WIN_CSC_LINK` / `CSC_INSTALLER_LINK` / `SNAP_CSC_LINK` / `cscLink` value must be valid standard base64 (line breaks are ignored; encode it with `base64 -w0` or `openssl base64 -A`) — a value with surrounding quotes, URL-safe characters or other stray characters fails with an `InvalidConfigurationError` that does not print the value; adds the strict `decodeStrictBase64` helper to builder-util.
