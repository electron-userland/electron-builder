---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(updater): stop downloading a blockmap as soon as it passes the blockmap size limit derived from the update's size, and abort its request (`ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED`); `downloadToBuffer` honors `DownloadOptions.maxSize` below its 500 MB limit
