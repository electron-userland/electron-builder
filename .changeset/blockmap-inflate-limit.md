---
"electron-updater": patch
---

fix(updater): bound how far a blockmap may inflate (to a limit derived from the update's size) and validate an embedded blockmap's size before reading it, so an oversized blockmap falls back to a full download before it can exhaust memory
