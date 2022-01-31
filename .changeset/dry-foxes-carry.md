---
"electron-updater": patch
---

fix(updater): Replacing fs/promises with fs-extra to support legacy versions of Electron that use node 12 and below. Fixes: #6000
