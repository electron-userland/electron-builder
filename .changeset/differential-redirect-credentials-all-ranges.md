---
"electron-updater": patch
---

fix(updater): multi-range differential downloads and the embedded blockmap read of AppImage and NSIS web installer updates no longer send credential headers such as `Authorization` to a redirect target on another origin
