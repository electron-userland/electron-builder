---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): stop downloading a blockmap as soon as it passes the blockmap size limit derived from the update's size, instead of buffering up to 500 MB before rejecting it (`downloadToBuffer` takes an optional `maxSize`)
