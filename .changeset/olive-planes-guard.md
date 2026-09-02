---
"app-builder-lib": minor
---

feat: fail fast with a clear configuration error when building Windows ia32 or Linux armv7l against Electron >= 44, which removed those builds (electron/electron#51816). Previously such builds died with an opaque 404 while downloading the Electron zip. Downgraded to a warning when a custom `electronDist` or Electron mirror is configured, since it may still provide 32-bit builds. Use `electronVersion` <= 43.x to keep building 32-bit (supported until the v43 series reaches end-of-life in January 2027).
