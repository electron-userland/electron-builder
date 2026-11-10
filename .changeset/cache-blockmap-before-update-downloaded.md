---
"electron-updater": patch
---

fix: cache the downloaded update's blockmap before emitting `update-downloaded`, so an app that calls `quitAndInstall()` from that listener still makes its next update differential
