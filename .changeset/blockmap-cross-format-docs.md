---
"app-builder-lib": patch
---

docs: the `blockmap` option explains what a format switch costs (a differential update with electron-updater 7.0.0-alpha.14 and later; only a stored `app.asar` is downloaded whole once) and what `"v3"` means for compressed artifacts: the same 8/16/32 KiB blocks and data download as `"v2"`, with a smaller map fetched in parts. No change to what is built
