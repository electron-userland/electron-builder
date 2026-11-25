---
"electron-updater": patch
---

fix: quote the `blockMapSha512` of the update manifest in the block map mismatch error, so a value with control characters cannot forge log lines
