---
"electron-builder": patch
"app-builder-lib": patch
---

fix(cli): `sign-update-manifest --verify` fails a manifest that uses YAML aliases, as `electron-builder verify` does, and re-signing such a manifest warns that it is written without them
