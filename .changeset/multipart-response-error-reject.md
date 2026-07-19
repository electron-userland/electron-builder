---
"electron-updater": patch
---

fix: Reject the differential download promise instead of crashing with an uncaughtException when the multipart range response emits a network error
