---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): check a v3 blockmap's header (the size limit derived from the update's size, exact length, the update's file size) and tables before decoding or range-fetching its records, and keep decoded records compact, so a map declaring millions of blocks falls back to a full download before it can exhaust memory
