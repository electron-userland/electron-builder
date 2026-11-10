---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): check that a v3 blockmap's super-group and group counts sum to its header before planning Range requests from them, and refuse a Range request larger than the blockmap size limit, so every range the updater requests and buffers lies within that limit
