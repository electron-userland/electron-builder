---
"app-builder-lib": patch
"builder-util": patch
"builder-util-runtime": patch
"dmg-builder": patch
"electron-updater": patch
---

fix: remove `shell: true` from node_modules collector so as to prevent shell console logging from malforming the json output
