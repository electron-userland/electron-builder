---
"app-builder-lib": patch
---

fix(nsis): quote the app executable path when the portable launcher starts the extracted app, so a path containing spaces cannot resolve to a different executable
